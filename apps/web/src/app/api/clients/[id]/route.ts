import { NextResponse } from "next/server";
import { getClientWithDocuments } from "@rent-a-car/api/server";
import { requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  const client = await getClientWithDocuments(params.id);
  if (!client) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(client);
}
