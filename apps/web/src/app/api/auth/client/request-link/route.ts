import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveEmailRedirectTo } from "@/lib/mobileRedirect";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  const supabase = createClient();

  // Vidi identičan komentar u owner/request-link/route.ts - fallback mora
  // pratiti stvarni request origin (Vercel multi-alias + Host-only PKCE
  // cookie), ne fiksnu env varijablu.
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
    console.error("client/request-link signInWithOtp failed:", error);
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
