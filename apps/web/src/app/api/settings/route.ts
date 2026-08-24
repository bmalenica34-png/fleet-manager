import { NextResponse } from "next/server";
import { companySettingsUpdateSchema } from "@rent-a-car/api";
import { getCompanySettings, updateCompanySettings } from "@rent-a-car/api/server";
import { zodErrorResponse } from "@/lib/handleZodError";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

// Settings je jedini modul gdje se i ČITANJE gatea (ne samo pisanje) - za
// razliku od vehicles/clients, nema legitiman cross-modul razlog da
// employee bez "settings" permisije uopće vidi podatke tvrtke.

export async function GET(request: Request) {
  const auth = await requireModulePermission(request, "settings");
  if (!auth.authorized) return auth.response;

  return NextResponse.json(await getCompanySettings());
}

export async function PATCH(request: Request) {
  const auth = await requireModulePermission(request, "settings");
  if (!auth.authorized) return auth.response;

  const body = await request.json();
  const parsed = companySettingsUpdateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  return NextResponse.json(await updateCompanySettings(parsed.data));
}
