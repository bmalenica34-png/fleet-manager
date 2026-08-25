import { NextResponse } from "next/server";
import { generateReportPdfBuffer } from "@rent-a-car/api/server";
import { parseStatsDateRange } from "@/lib/parseStatsDateRange";
import { requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

/**
 * On-demand PDF izvještaj za proizvoljan raspon (dashboard gumb "Preuzmi
 * PDF izvještaj") - streama se izravno kao download, NIJE spremljen na
 * Hetzner (isti razlog kao ostali ephemeralni izlazi - parametriziran po
 * pozivu, nema smisla trajno čuvati). Isti `?from=&to=` obrazac kao
 * `/api/vehicles/stats`.
 */
export async function GET(request: Request) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  const range = parseStatsDateRange(new URL(request.url));
  if (!range) {
    return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
  }

  const pdf = await generateReportPdfBuffer(range.from, range.to);
  const filename = `izvjestaj-flote_${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
