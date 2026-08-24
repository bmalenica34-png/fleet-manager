import { NextResponse } from "next/server";
import { employeeCreateSchema } from "@rent-a-car/api";
import { createEmployee, listEmployees } from "@rent-a-car/api/server";
import { zodErrorResponse } from "@/lib/handleZodError";
import { requireOwnerOnlySession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

// Employee management je namjerno IZVAN per-modul permission sustava -
// samo pravi Owner smije vidjeti/uređivati ovu rutu (vidi
// requireOwnerOnlySession - čak ni employee sa "settings" permisijom ne
// prolazi, da se izbjegne privilege escalation).

export async function GET(request: Request) {
  const auth = await requireOwnerOnlySession(request);
  if (!auth.authorized) return auth.response;

  return NextResponse.json(await listEmployees());
}

export async function POST(request: Request) {
  const auth = await requireOwnerOnlySession(request);
  if (!auth.authorized) return auth.response;

  const body = await request.json();
  const parsed = employeeCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const employee = await createEmployee(parsed.data);
  return NextResponse.json(employee, { status: 201 });
}
