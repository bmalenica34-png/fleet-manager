/**
 * Mobile appovi šalju vlastiti redirectTo (custom URL scheme, npr.
 * "rentacarmanager://auth-callback") u request-link pozivu, jer ne mogu
 * koristiti web-ov /api/auth/callback (nema cookie jara). Validira se protiv
 * MOBILE_APP_SCHEME prefiksa da nasumični redirectTo ne otvori
 * open-redirect rupu u Supabase magic-link mailu.
 */
export function resolveEmailRedirectTo(requestedRedirectTo: unknown, fallback: string): string {
  const scheme = process.env.MOBILE_APP_SCHEME;
  if (
    scheme &&
    typeof requestedRedirectTo === "string" &&
    requestedRedirectTo.startsWith(scheme)
  ) {
    return requestedRedirectTo;
  }
  return fallback;
}
