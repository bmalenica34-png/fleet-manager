import { NextResponse } from "next/server";
import {
  runIncompleteVehicleDataCheck,
  runPeriodicReportCheck,
  runRegistrationExpiryCheck,
} from "@rent-a-car/api/server";
import { isAuthorizedCronRequest } from "@/lib/verifyCronSecret";

export const runtime = "nodejs";

// Isti dnevni cron pokreće registracijske podsjetnike, "nepotpuni podaci"
// notifikaciju, I periodični izvještaj o floti - namjerno NIJE dodan novi
// cron entry u vercel.json (rizik od probijanja Vercel plan limita broja
// cron poslova, vidi PROGRESS.md), sve tri se pokreću u jednom requestu.
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [registrationExpiry, incompleteData, periodicReport] = await Promise.all([
    runRegistrationExpiryCheck(),
    runIncompleteVehicleDataCheck(),
    runPeriodicReportCheck(),
  ]);

  return NextResponse.json({ registrationExpiry, incompleteData, periodicReport });
}
