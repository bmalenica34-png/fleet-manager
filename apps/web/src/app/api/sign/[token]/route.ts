import { NextResponse } from "next/server";
import { completeSigning, resolveSigningContract } from "@rent-a-car/api/server";
import { vehiclePartSchema, type PhotoAngle, type VehiclePart } from "@rent-a-car/api";

export const runtime = "nodejs";

const REQUIRED_ANGLES: PhotoAngle[] = ["front", "back", "left", "right"];

export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  const resolution = await resolveSigningContract(params.token);

  if (resolution.status !== "ok") {
    const status = resolution.status === "invalid" ? 404 : 410;
    return NextResponse.json({ status: resolution.status }, { status });
  }

  const { contract } = resolution;
  return NextResponse.json({
    status: "ok",
    contract: {
      id: contract.id,
      dateFrom: contract.dateFrom,
      dateTo: contract.dateTo,
      vehicle: {
        make: contract.vehicle.make,
        model: contract.vehicle.model,
        licensePlate: contract.vehicle.licensePlate,
      },
      client: {
        firstName: contract.client.firstName,
        lastName: contract.client.lastName,
        email: contract.client.email,
        phone: contract.client.phone,
      },
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: { token: string } }
) {
  const formData = await request.formData();

  const phone = formData.get("phone");
  const address = formData.get("address");
  const termsAccepted = formData.get("termsAccepted");
  const termsVersion = formData.get("termsVersion");
  const driverLicenseFile = formData.get("driverLicense");
  const idDocumentFile = formData.get("idDocument");
  const signatureDataUrl = formData.get("signature");

  if (
    typeof phone !== "string" ||
    !phone.trim() ||
    !(driverLicenseFile instanceof File) ||
    !(idDocumentFile instanceof File) ||
    typeof signatureDataUrl !== "string"
  ) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  if (termsAccepted !== "true" || typeof termsVersion !== "string" || !termsVersion.trim()) {
    return NextResponse.json({ error: "terms_not_accepted" }, { status: 400 });
  }

  const photos: {
    angle: PhotoAngle;
    file: { buffer: Buffer; contentType: string; filename: string };
    damageDescription?: string;
    damagedPart?: VehiclePart;
  }[] = [];

  for (const angle of REQUIRED_ANGLES) {
    const file = formData.get(`photo_${angle}`);
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "missing_photo", angle }, { status: 400 });
    }
    const damage = formData.get(`damage_${angle}`);
    photos.push({
      angle,
      file: {
        buffer: Buffer.from(await file.arrayBuffer()),
        contentType: file.type || "image/jpeg",
        filename: file.name,
      },
      damageDescription: typeof damage === "string" && damage.trim() ? damage.trim() : undefined,
    });
  }

  // Dodatne slike prijavljenih oštećenja (odvojeno od 4 obavezna kuta) -
  // dinamički broj, indeksirani formData ključevi (damage_${i}_part/photo/
  // description) jer broj oštećenja nije fiksan.
  const damageCountRaw = formData.get("damageCount");
  const damageCount =
    typeof damageCountRaw === "string" && /^\d+$/.test(damageCountRaw)
      ? parseInt(damageCountRaw, 10)
      : 0;

  for (let i = 0; i < damageCount; i++) {
    const partRaw = formData.get(`damage_${i}_part`);
    const photoFile = formData.get(`damage_${i}_photo`);
    const description = formData.get(`damage_${i}_description`);

    const parsedPart = vehiclePartSchema.safeParse(partRaw);
    if (!parsedPart.success) {
      return NextResponse.json({ error: "invalid_damage_part", index: i }, { status: 400 });
    }
    if (!(photoFile instanceof File)) {
      return NextResponse.json({ error: "missing_damage_photo", index: i }, { status: 400 });
    }

    photos.push({
      angle: "other",
      file: {
        buffer: Buffer.from(await photoFile.arrayBuffer()),
        contentType: photoFile.type || "image/jpeg",
        filename: photoFile.name,
      },
      damageDescription: typeof description === "string" && description.trim() ? description.trim() : undefined,
      damagedPart: parsedPart.data,
    });
  }

  const base64 = signatureDataUrl.split(",")[1];
  if (!base64) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const result = await completeSigning(params.token, {
    phone: phone.trim(),
    address: typeof address === "string" && address.trim() ? address.trim() : undefined,
    termsVersion,
    driverLicense: {
      buffer: Buffer.from(await driverLicenseFile.arrayBuffer()),
      contentType: driverLicenseFile.type || "application/octet-stream",
      filename: driverLicenseFile.name,
    },
    idDocument: {
      buffer: Buffer.from(await idDocumentFile.arrayBuffer()),
      contentType: idDocumentFile.type || "application/octet-stream",
      filename: idDocumentFile.name,
    },
    photos,
    signaturePngBuffer: Buffer.from(base64, "base64"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
