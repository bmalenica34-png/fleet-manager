import { NextResponse } from "next/server";
import { companySettingsUpdateSchema } from "@rent-a-car/api";
import { getCompanySettings, updateCompanySettings } from "@rent-a-car/api/server";
import { zodErrorResponse } from "@/lib/handleZodError";
import { requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  return NextResponse.json(await getCompanySettings());
}

export async function PATCH(request: Request) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  const body = await request.json();
  const parsed = companySettingsUpdateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  return NextResponse.json(await updateCompanySettings(parsed.data));
}
