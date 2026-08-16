import { NextResponse } from "next/server";
import { isEmailAllowedAsOwner } from "@rent-a-car/api/server";
import { createClient } from "@/lib/supabase/server";
import { resolveEmailRedirectTo } from "@/lib/mobileRedirect";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  // Allowlist provjera PRIJE slanja magic linka - nasumični email ne smije
  // moći uopće otvoriti Supabase auth sesiju na owner strani.
  const allowed = await isEmailAllowedAsOwner(email);
  if (!allowed) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  // Mora biti SSR-svjesni klijent (ne plain @supabase/supabase-js) - taj
  // koristi PKCE flow po defaultu i sprema code_verifier u cookie, što
  // /api/auth/callback (exchangeCodeForSession) očekuje. Plain klijent
  // defaulta na implicit flow, što bi bilo neusklađeno s callbackom.
  const supabase = createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: resolveEmailRedirectTo(
        body.redirectTo,
        `${process.env.NEXT_PUBLIC_OWNER_APP_URL}/api/auth/callback`
      ),
    },
  });

  if (error) {
    console.error("owner/request-link signInWithOtp failed:", error);
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
