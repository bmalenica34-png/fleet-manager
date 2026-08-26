import { NextResponse } from "next/server";
import {
  runIncompleteClientDataCheck,
  runIncompleteVehicleDataCheck,
  runPeriodicReportCheck,
  runRegistrationExpiryCheck,
  runRentPaymentChecks,
} from "@rent-a-car/api/server";
import { isAuthorizedCronRequest } from "@/lib/verifyCronSecret";

export const runtime = "nodejs";

// Isti dnevni cron pokreće registracijske podsjetnike, "nepotpuni podaci"
// notifikaciju (vozila I klijenti), periodični izvještaj o floti, I
// RentPayment provjere (dospijeće danas/jučer + petkov standing podsjetnik)
// - namjerno NIJE dodan novi cron entry u vercel.json (rizik od probijanja
// Vercel plan limita broja cron poslova, vidi PROGRESS.md), sve se
// pokreće u jednom requestu.
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [registrationExpiry, incompleteVehicleData, incompleteClientData, periodicReport, rentPayments] =
    await Promise.all([
      runRegistrationExpiryCheck(),
      runIncompleteVehicleDataCheck(),
      runIncompleteClientDataCheck(),
      runPeriodicReportCheck(),
      runRentPaymentChecks(),
    ]);

  return NextResponse.json({
    registrationExpiry,
    incompleteVehicleData,
    incompleteClientData,
    periodicReport,
    rentPayments,
  });
}
