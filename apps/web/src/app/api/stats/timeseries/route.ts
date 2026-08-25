import { NextResponse } from "next/server";
import { getStatsTimeSeries } from "@rent-a-car/api/server";
import { parseStatsDateRange } from "@/lib/parseStatsDateRange";
import { requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

/**
 * `?vehicleId=` opcionalan - izostavljen/prazan znači "sva vozila zajedno"
 * (isti selektor kao dashboard/`/vehicles/[id]` statistika, vidi
 * getStatsTimeSeries u vehicleStats paketu).
 */
export async function GET(request: Request) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  const url = new URL(request.url);
  const range = parseStatsDateRange(url);
  if (!range) {
    return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
  }

  const vehicleId = url.searchParams.get("vehicleId") || null;
  const series = await getStatsTimeSeries(vehicleId, range.from, range.to);
  return NextResponse.json(series);
}
