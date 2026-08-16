import { supabase } from "./supabase";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!;
const DEFAULT_TIMEOUT_MS = 15000;

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

  // Goli fetch() nema default timeout - bez ovoga, spor/mrtav mrežni put
  // (loš signal, DNS problem, server koji ne odgovara) ostavlja pozivatelja
  // zauvijek u "loading" stanju bez ikakve povratne informacije.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("request_timeout");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

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
