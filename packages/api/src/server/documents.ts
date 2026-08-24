import type { HandoverPhoto } from "@prisma/client";
import { prisma } from "../db/client";
import { getPresignedDownloadUrl, uploadObject, buildObjectKey } from "../storage/hetzner";
import { sendSignedContractDocumentsEmail } from "../lib/email";
import { renderContractPdf, renderProtocolPdf, renderTermsPdf } from "../pdf/generate";
import { getCompanyInfoForPdf } from "./companySettings";

function getOwnerEmail(): string {
  const email = process.env.OWNER_EMAIL;
  if (!email) {
    throw new Error("Missing required env var: OWNER_EMAIL");
  }
  return email;
}

/**
 * Generira ugovor + primopredajni zapisnik kao PDF (sa svim slikama
 * primopredaje i opisima oštećenja), sprema ih na Hetzner, i mailom šalje
 * oba dokumenta klijentu i vlasniku. Poziva se nakon uspješnog potpisa -
 * ne ruši sam čin potpisa ako ovdje nešto pukne (poziva se u try/catch iz
 * completeSigning).
 */
export async function finalizeContractDocuments(contractId: string): Promise<void> {
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: {
      vehicle: true,
      client: true,
      createdByOwner: true,
      createdByEmployee: true,
      termsAndConditions: true,
      handoverPhotos: { where: { photoRequestId: null } },
    },
  });

  if (!contract.signatureKey) {
    throw new Error(`Contract ${contractId} has no signatureKey - not signed yet`);
  }

  const [signatureUrl, photoUrls, company] = await Promise.all([
    getPresignedDownloadUrl(contract.signatureKey, 3600),
    Promise.all(
      contract.handoverPhotos.map(async (photo: HandoverPhoto) => ({
        id: photo.id,
        angle: photo.angle,
        url: await getPresignedDownloadUrl(photo.key, 3600),
        damageDescription: photo.damageDescription,
        damagedPart: photo.damagedPart,
      }))
    ),
    getCompanyInfoForPdf(),
  ]);

  // Ime izdavatelja u potpisnom bloku - vlasnik ILI employee koji je kreirao
  // ugovor (točno jedno od createdByOwnerId/createdByEmployeeId je
  // postavljeno, vidi schema.prisma komentar). Null za ugovore kreirane
  // prije nego je ovo polje uvedeno - ContractPdf tada jednostavno preskače
  // tu liniju.
  const issuedByName =
    contract.createdByOwner?.name ??
    contract.createdByOwner?.email ??
    (contract.createdByEmployee
      ? `${contract.createdByEmployee.firstName} ${contract.createdByEmployee.lastName}`
      : null);

  const [contractPdfBuffer, protocolPdfBuffer] = await Promise.all([
    renderContractPdf({
      contract: {
        id: contract.id,
        number: contract.number,
        dateFrom: contract.dateFrom,
        dateTo: contract.dateTo,
        signedAt: contract.signedAt,
        pickupLocation: contract.pickupLocation,
        returnLocation: contract.returnLocation,
        odometerStart: contract.odometerStart,
        odometerEnd: contract.odometerEnd,
        pricePerDay: contract.pricePerDay,
        excessAmount: contract.excessAmount,
        paymentMethod: contract.paymentMethod,
        termsAcceptedAt: contract.termsAcceptedAt,
        termsVersion: contract.termsVersion,
      },
      vehicle: {
        make: contract.vehicle.make,
        model: contract.vehicle.model,
        year: contract.vehicle.year,
        licensePlate: contract.vehicle.licensePlate,
        vin: contract.vehicle.vin,
      },
      client: {
        firstName: contract.client.firstName,
        lastName: contract.client.lastName,
        oib: contract.client.oib,
        email: contract.client.email,
        phone: contract.client.phone,
        address: contract.client.address,
      },
      company,
      issuedByName,
      signatureUrl,
    }),
    renderProtocolPdf({
      contract: { id: contract.id, number: contract.number, dateFrom: contract.dateFrom, dateTo: contract.dateTo },
      vehicle: {
        make: contract.vehicle.make,
        model: contract.vehicle.model,
        licensePlate: contract.vehicle.licensePlate,
      },
      client: { firstName: contract.client.firstName, lastName: contract.client.lastName },
      photos: photoUrls,
      signatureUrl,
    }),
  ]);

  // Snapshot TOČNE verzije uvjeta koju je klijent vidio (contract.termsVersionId,
  // resolvean i validiran u completeSigning) - null samo za ugovore
  // potpisane prije uvođenja ovog polja, ne za nove (termsId je obavezan u
  // completeSigningRequestSchema).
  const termsPdfBuffer = contract.termsAndConditions
    ? await renderTermsPdf({
        companyName: company.name || "Rent-a-Car Manager",
        version: contract.termsAndConditions.version,
        content: contract.termsAndConditions.content,
        contractNumber: contract.number,
        acceptedAt: contract.termsAcceptedAt,
      })
    : null;

  const contractPdfKey = buildObjectKey(`contracts/${contract.id}/documents`, "ugovor.pdf");
  const protocolPdfKey = buildObjectKey(`contracts/${contract.id}/documents`, "zapisnik.pdf");
  const termsPdfKey = termsPdfBuffer
    ? buildObjectKey(`contracts/${contract.id}/documents`, "uvjeti-najma.pdf")
    : null;

  await Promise.all([
    uploadObject({ key: contractPdfKey, body: contractPdfBuffer, contentType: "application/pdf" }),
    uploadObject({ key: protocolPdfKey, body: protocolPdfBuffer, contentType: "application/pdf" }),
    termsPdfKey && termsPdfBuffer
      ? uploadObject({ key: termsPdfKey, body: termsPdfBuffer, contentType: "application/pdf" })
      : Promise.resolve(),
  ]);

  await prisma.contract.update({
    where: { id: contract.id },
    data: { contractPdfKey, protocolPdfKey, termsPdfKey },
  });

  const vehicleLabel = `${contract.vehicle.make} ${contract.vehicle.model} (${contract.vehicle.licensePlate})`;

  await Promise.all([
    sendSignedContractDocumentsEmail({
      to: contract.client.email,
      recipientName: `${contract.client.firstName} ${contract.client.lastName}`,
      vehicleLabel,
      contractPdf: contractPdfBuffer,
      protocolPdf: protocolPdfBuffer,
      termsPdf: termsPdfBuffer ?? undefined,
    }),
    sendSignedContractDocumentsEmail({
      to: getOwnerEmail(),
      recipientName: "Owner",
      vehicleLabel,
      contractPdf: contractPdfBuffer,
      protocolPdf: protocolPdfBuffer,
      termsPdf: termsPdfBuffer ?? undefined,
    }),
  ]);
}
