import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { resolveMobileRole } from "./api";

export type AuthStatus = "loading" | "signed-out" | "owner" | "client";

type AuthContextValue = {
  session: Session | null;
  status: AuthStatus;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    async function resolveForSession(nextSession: Session | null) {
      setSession(nextSession);
      if (!nextSession) {
        setStatus("signed-out");
        return;
      }
      setStatus("loading");
      try {
        const { role } = await resolveMobileRole();
        setStatus(role);
      } catch {
        setStatus("signed-out");
      }
    }

    supabase.auth.getSession().then(({ data: { session: initial } }) => {
      resolveForSession(initial);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      resolveForSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, status, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
