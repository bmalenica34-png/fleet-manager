import { NextResponse } from "next/server";
import { contractCreateSchema } from "@rent-a-car/api";
import { createContractAndSendSigningEmail, listContractsWithDocumentUrls } from "@rent-a-car/api/server";
import { zodErrorResponse } from "@/lib/handleZodError";
import { requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  return NextResponse.json(await listContractsWithDocumentUrls());
}

export async function POST(request: Request) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  const body = await request.json();
  const parsed = contractCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const contract = await createContractAndSendSigningEmail(parsed.data);
  return NextResponse.json(contract, { status: 201 });
}
