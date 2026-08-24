import type { HandoverPhoto } from "@prisma/client";
import { prisma } from "../db/client";
import { getPresignedDownloadUrl, uploadObject, buildObjectKey } from "../storage/hetzner";
import { sendSignedContractDocumentsEmail } from "../lib/email";
import { renderContractPdf, renderProtocolPdf } from "../pdf/generate";
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

  // Ime izdavatelja u potpisnom bloku - vlasnik/employee koji je kreirao
  // ugovor (Contract.createdByOwnerId). Null za ugovore kreirane prije nego
  // je ovo polje uvedeno - ContractPdf tada jednostavno preskače tu liniju.
  const issuedByName = contract.createdByOwner?.name ?? contract.createdByOwner?.email ?? null;

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

  const contractPdfKey = buildObjectKey(`contracts/${contract.id}/documents`, "ugovor.pdf");
  const protocolPdfKey = buildObjectKey(`contracts/${contract.id}/documents`, "zapisnik.pdf");

  await Promise.all([
    uploadObject({ key: contractPdfKey, body: contractPdfBuffer, contentType: "application/pdf" }),
    uploadObject({ key: protocolPdfKey, body: protocolPdfBuffer, contentType: "application/pdf" }),
  ]);

  await prisma.contract.update({
    where: { id: contract.id },
    data: { contractPdfKey, protocolPdfKey },
  });

  const vehicleLabel = `${contract.vehicle.make} ${contract.vehicle.model} (${contract.vehicle.licensePlate})`;

  await Promise.all([
    sendSignedContractDocumentsEmail({
      to: contract.client.email,
      recipientName: `${contract.client.firstName} ${contract.client.lastName}`,
      vehicleLabel,
      contractPdf: contractPdfBuffer,
      protocolPdf: protocolPdfBuffer,
    }),
    sendSignedContractDocumentsEmail({
      to: getOwnerEmail(),
      recipientName: "Owner",
      vehicleLabel,
      contractPdf: contractPdfBuffer,
      protocolPdf: protocolPdfBuffer,
    }),
  ]);
}
