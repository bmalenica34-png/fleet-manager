import { NextResponse } from "next/server";
import { registerFiscalPremise, getCompanySettings } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

// Registrira poslovni prostor kod CIS-a (PoslovniProstorZahtjev) - zakonski
// preduvjet prije izdavanja prvog fiskaliziranog računa.
export async function POST(request: Request) {
  const auth = await requireModulePermission(request, "settings");
  if (!auth.authorized) return auth.response;

  try {
    await registerFiscalPremise();
    return NextResponse.json(await getCompanySettings());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Greška pri registraciji poslovnog prostora";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
