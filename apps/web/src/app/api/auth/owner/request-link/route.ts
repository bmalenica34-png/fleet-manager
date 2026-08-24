import { NextResponse } from "next/server";
import { isEmailAllowedForOwnerApp } from "@rent-a-car/api/server";
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
  // moći uopće otvoriti Supabase auth sesiju na owner strani. Provjerava
  // Owner ILI aktivan Employee - ista login stranica se dijeli između oba
  // (uloga se odredi nakon logina, vidi requireOwnerSession).
  const allowed = await isEmailAllowedForOwnerApp(email);
  if (!allowed) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  // Mora biti SSR-svjesni klijent (ne plain @supabase/supabase-js) - taj
  // koristi PKCE flow po defaultu i sprema code_verifier u cookie, što
  // /api/auth/callback (exchangeCodeForSession) očekuje. Plain klijent
  // defaulta na implicit flow, što bi bilo neusklađeno s callbackom.
  const supabase = createClient();

  // Fallback (web, bez mobile redirectTo) MORA biti isto porijeklo (origin)
  // s kojeg je ovaj zahtjev stigao, ne fiksna env varijabla - Vercel
  // aliasira više domena na isti deployment (npr. *-ten.vercel.app i
  // *-branimir-s-projects1.vercel.app), a PKCE code_verifier cookie je
  // Host-only (vezan striktno na domenu koja ga je postavila). Fiksni
  // fallback bi značio da magic link uvijek vodi na JEDNU domenu, pa bi
  // exchangeCodeForSession tiho pucao (cookie nedostupan) čim korisnik
  // zatraži link s BILO KOJE druge važeće domene - potvrđeno kao stvaran
  // uzrok bug #40 (owner login), vidi PROGRESS.md.
  const requestOrigin = new URL(request.url).origin;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: resolveEmailRedirectTo(
        body.redirectTo,
        `${requestOrigin}/api/auth/callback`
      ),
    },
  });

  if (error) {
    console.error("owner/request-link signInWithOtp failed:", error);
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
