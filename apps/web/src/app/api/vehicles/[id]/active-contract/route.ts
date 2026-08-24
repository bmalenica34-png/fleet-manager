import { NextResponse } from "next/server";
import { findCurrentContractForVehicle } from "@rent-a-car/api/server";
import { requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

/**
 * Vraća tekući (aktivni, nezatvoreni) ugovor za vozilo, ili null. Koristi ga
 * "Novi ugovor" forma (apps/web/src/app/(owner)/contracts/new/page.tsx) da
 * upozori/blokira prije izdavanja duplog ugovora za isto vozilo, s izravnim
 * gumbom za zatvaranje postojećeg (POST /api/contracts/[id]/close).
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  const contract = await findCurrentContractForVehicle(params.id);
  if (!contract) return NextResponse.json(null);

  return NextResponse.json({
    id: contract.id,
    number: contract.number,
    dateTo: contract.dateTo,
    client: { firstName: contract.client.firstName, lastName: contract.client.lastName },
  });
}
