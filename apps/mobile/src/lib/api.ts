import { supabase } from "./supabase";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!;

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    // Naša API vraća { error: "neki_string" }, ali npr. Vercel Deployment
    // Protection vraća { error: { code, message } } - ne pretpostavljati
    // da je body.error uvijek string, inače new Error(objekt) postane
    // doslovno "[object Object]".
    const message =
      typeof body?.error === "string"
        ? body.error
        : typeof body?.error?.message === "string"
          ? body.error.message
          : `request_failed_${response.status}`;
    throw new Error(message);
  }

  return response.json();
}

export type MobileRole = "owner" | "client";

export function resolveMobileRole(): Promise<{ role: MobileRole; email: string }> {
  return apiFetch("/api/auth/mobile/resolve", { method: "POST" });
}

export function requestMagicLink(role: MobileRole, email: string): Promise<{ ok: true }> {
  return apiFetch(`/api/auth/${role}/request-link`, {
    method: "POST",
    body: JSON.stringify({ email, redirectTo: "rentacarmanager://auth-callback" }),
  });
}
