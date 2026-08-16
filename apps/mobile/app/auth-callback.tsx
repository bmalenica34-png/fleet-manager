import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";

const HANDLE_URL_TIMEOUT_MS = 20000;

type Stage = "waiting_for_url" | "url_captured" | "setting_session";

type ErrorState = { code: string; stage: Stage };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Landing ekran za magic-link deep link (rentacarmanager://auth-callback).
 * Supabase redirect nosi access_token/refresh_token izravno u URL-u (ne
 * PKCE code) - vidi Supabase Native Mobile Deep Linking docs. setSession()
 * je dovoljan, nema potrebe za pozivom na web-ov /api/auth/callback.
 *
 * `stage` prati gdje smo stali kad nešto visi/pukne - "waiting_for_url" i
 * "setting_session" oba istječu nakon HANDLE_URL_TIMEOUT_MS, ali su prije
 * davali IDENTIČNU poruku ("timeout") pa se nije moglo razaznati je li
 * deep link uopće stigao do appa ili je setSession() bio taj koji visi.
 * console.log ostavljen namjerno - jedini uvid u ponašanje na fizičkom
 * uređaju je Metro log dok je telefon spojen na dev server.
 */
export default function AuthCallback() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("waiting_for_url");
  const [error, setError] = useState<ErrorState | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    async function handleUrl(url: string | null) {
      console.log("[auth-callback] handleUrl called, has url:", !!url, "already handled:", handled.current);
      if (!url || handled.current) return;
      handled.current = true;
      setStage("url_captured");

      const { params, errorCode } = QueryParams.getQueryParams(url);
      if (errorCode) {
        console.log("[auth-callback] QueryParams errorCode:", errorCode);
        setError({ code: errorCode, stage: "url_captured" });
        return;
      }

      const { access_token, refresh_token } = params;
      if (!access_token || !refresh_token) {
        console.log("[auth-callback] missing tokens in URL, params keys:", Object.keys(params));
        setError({ code: "invalid_link", stage: "url_captured" });
        return;
      }

      setStage("setting_session");
      console.log("[auth-callback] calling supabase.auth.setSession()");
      try {
        const { error: sessionError } = await withTimeout(
          supabase.auth.setSession({ access_token, refresh_token }),
          HANDLE_URL_TIMEOUT_MS
        );

        if (sessionError) {
          console.log("[auth-callback] setSession error:", sessionError.message);
          setError({ code: sessionError.message, stage: "setting_session" });
          return;
        }

        console.log("[auth-callback] setSession succeeded, navigating to /");
        router.replace("/");
      } catch {
        console.log("[auth-callback] setSession timed out after", HANDLE_URL_TIMEOUT_MS, "ms");
        setError({ code: "timeout", stage: "setting_session" });
      }
    }

    // Ako se deep link uopće ne uhvati (getInitialURL nikad ne resolva
    // korisnim URL-om, 'url' event ne stigne), handled.current ostaje
    // false zauvijek i ekran bi inače visio na spinneru bez ikakve
    // povratne informacije - ovaj timer to presiječe.
    const stuckTimer = setTimeout(() => {
      if (!handled.current) {
        console.log("[auth-callback] stuck timer fired - no URL ever captured");
        handled.current = true;
        setError({ code: "timeout", stage: "waiting_for_url" });
      }
    }, HANDLE_URL_TIMEOUT_MS);

    Linking.getInitialURL().then((url) => {
      console.log("[auth-callback] getInitialURL resolved:", url ? "has url" : "null");
      handleUrl(url);
    });
    const subscription = Linking.addEventListener("url", ({ url }) => {
      console.log("[auth-callback] 'url' event fired");
      handleUrl(url);
    });
    return () => {
      clearTimeout(stuckTimer);
      subscription.remove();
    };
  }, [router]);

  if (error) {
    const message =
      error.code === "timeout" && error.stage === "waiting_for_url"
        ? "App nije primio link iz maila - pokušaj ponovno kliknuti link, ili provjeri da ga otvaraš na istom uređaju."
        : error.code === "timeout" && error.stage === "setting_session"
          ? "Prijava se predugo obrađuje - poveznica je stigla, ali potvrda nije uspjela na vrijeme."
          : `Prijava nije uspjela (${error.code})`;

    return (
      <View style={styles.container}>
        <Text style={styles.error}>{message}</Text>
        <Pressable style={styles.button} onPress={() => router.replace("/login")}>
          <Text style={styles.buttonText}>Natrag na prijavu</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator />
      <Text style={styles.body}>
        {stage === "setting_session" ? "Potvrđujem sesiju..." : "Prijavljujem te..."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  body: { fontSize: 16, color: "#444" },
  error: { fontSize: 16, color: "#c00", textAlign: "center" },
  button: { backgroundColor: "#111", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8 },
  buttonText: { color: "#fff", fontWeight: "600" },
});
