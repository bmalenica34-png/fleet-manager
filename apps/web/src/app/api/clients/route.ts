import { NextResponse } from "next/server";
import { clientCreateSchema } from "@rent-a-car/api";
import { createClient as createClientRecord, listClients } from "@rent-a-car/api/server";
import { zodErrorResponse } from "@/lib/handleZodError";
import { requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  return NextResponse.json(await listClients());
}

export async function POST(request: Request) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  const body = await request.json();
  const parsed = clientCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const client = await createClientRecord(parsed.data);
  return NextResponse.json(client, { status: 201 });
}
