import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();

  const url = new URL(request.url);
  const to = url.searchParams.get("to") === "portal" ? "/portal/login" : "/login";
  return NextResponse.redirect(new URL(to, url.origin));
}
