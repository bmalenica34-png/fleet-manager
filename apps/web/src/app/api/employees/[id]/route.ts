import { NextResponse } from "next/server";
import { employeeUpdateSchema } from "@rent-a-car/api";
import { updateEmployee } from "@rent-a-car/api/server";
import { zodErrorResponse } from "@/lib/handleZodError";
import { requireOwnerOnlySession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireOwnerOnlySession(request);
  if (!auth.authorized) return auth.response;

  const body = await request.json();
  const parsed = employeeUpdateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const employee = await updateEmployee(params.id, parsed.data);
  return NextResponse.json(employee);
}
