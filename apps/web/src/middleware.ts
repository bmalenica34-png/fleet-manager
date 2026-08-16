import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const OWNER_PREFIXES = ["/vehicles", "/clients", "/contracts"];

/**
 * Groba, brza provjera na Edge runtimeu - samo "postoji li sesija uopće"
 * (Supabase JWT iz cookieja, bez DB poziva). Stvarna provjera uloge
 * (Owner vs Client) ide u layout.tsx datotekama koje se izvršavaju u
 * Node runtimeu i mogu upitati Prisma/bazu.
 */
export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isOwnerRoute = pathname === "/" || OWNER_PREFIXES.some((p) => pathname.startsWith(p));
  const isPortalRoute = pathname.startsWith("/portal") && pathname !== "/portal/login";

  if (isOwnerRoute && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isPortalRoute && !user) {
    return NextResponse.redirect(new URL("/portal/login", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|sign|extend).*)"],
};
