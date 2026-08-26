import { NextResponse } from "next/server";
import { getServiceRecordSuggestions } from "@rent-a-car/api/server";
import { requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  return NextResponse.json(await getServiceRecordSuggestions());
}
