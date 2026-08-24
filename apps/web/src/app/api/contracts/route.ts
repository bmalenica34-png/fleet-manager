import { NextResponse } from "next/server";
import { contractCreateSchema } from "@rent-a-car/api";
import {
  createContractAndSendSigningEmail,
  listContractsWithDocumentUrls,
  VehicleHasActiveContractError,
} from "@rent-a-car/api/server";
import { zodErrorResponse } from "@/lib/handleZodError";
import { requireModulePermission, requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  return NextResponse.json(await listContractsWithDocumentUrls());
}

export async function POST(request: Request) {
  const auth = await requireModulePermission(request, "contracts");
  if (!auth.authorized) return auth.response;

  const body = await request.json();
  const parsed = contractCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  try {
    const contract = await createContractAndSendSigningEmail(parsed.data, {
      kind: auth.principal.kind,
      id: auth.principal.id,
    });
    return NextResponse.json(contract, { status: 201 });
  } catch (err) {
    if (err instanceof VehicleHasActiveContractError) {
      return NextResponse.json(
        {
          error: "vehicle_has_active_contract",
          activeContract: {
            id: err.contract.id,
            number: err.contract.number,
            dateTo: err.contract.dateTo,
            client: {
              firstName: err.contract.client.firstName,
              lastName: err.contract.client.lastName,
            },
          },
        },
        { status: 409 }
      );
    }
    throw err;
  }
}
