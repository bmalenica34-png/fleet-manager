import { NextResponse } from "next/server";
import { runIncompleteVehicleDataCheck, runRegistrationExpiryCheck } from "@rent-a-car/api/server";
import { isAuthorizedCronRequest } from "@/lib/verifyCronSecret";

export const runtime = "nodejs";

// Isti dnevni cron pokreće i registracijske podsjetnike i "nepotpuni
// podaci" notifikaciju - namjerno NIJE dodan novi cron entry u
// vercel.json (rizik od probijanja Vercel plan limita broja cron poslova,
// vidi PROGRESS.md), oba se pokreću u jednom requestu.
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [registrationExpiry, incompleteData] = await Promise.all([
    runRegistrationExpiryCheck(),
    runIncompleteVehicleDataCheck(),
  ]);

  return NextResponse.json({ registrationExpiry, incompleteData });
}
