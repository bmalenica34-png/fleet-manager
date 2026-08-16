import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js";

/**
 * Mobile appovi nemaju cookie jar, pa šalju Supabase access token kroz
 * Authorization headera umjesto kolačića. Ovdje se koristi goli
 * @supabase/supabase-js (ne @supabase/ssr) jer se ne postavljaju kolačići -
 * samo se verificira token protiv Supabase Auth servera.
 */
export async function getUserFromBearerToken(request: Request): Promise<User | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  return data.user;
}
