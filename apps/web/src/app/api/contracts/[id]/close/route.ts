import { NextResponse } from "next/server";
import { closeContractEarly } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulePermission(request, "contracts");
  if (!auth.authorized) return auth.response;

  try {
    const contract = await closeContractEarly(params.id);
    return NextResponse.json(contract);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "failed" },
      { status: 400 }
    );
  }
}
