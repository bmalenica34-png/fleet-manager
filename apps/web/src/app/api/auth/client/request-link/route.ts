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
    console.error("client/request-link signInWithOtp failed:", error);
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
