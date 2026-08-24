import { NextResponse } from "next/server";
import { getVehicleStats } from "@rent-a-car/api/server";
import { parseStatsDateRange } from "@/lib/parseStatsDateRange";
import { requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  const range = parseStatsDateRange(new URL(request.url));
  if (!range) {
    return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
  }

  const stats = await getVehicleStats(params.id, range.from, range.to);
  return NextResponse.json(stats);
}
