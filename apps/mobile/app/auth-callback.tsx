import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";

const HANDLE_URL_TIMEOUT_MS = 20000;

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
 */
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    async function handleUrl(url: string | null) {
      if (!url || handled.current) return;
      handled.current = true;

      const { params, errorCode } = QueryParams.getQueryParams(url);
      if (errorCode) {
        setError(errorCode);
        return;
      }

      const { access_token, refresh_token } = params;
      if (!access_token || !refresh_token) {
        setError("invalid_link");
        return;
      }

      try {
        const { error: sessionError } = await withTimeout(
          supabase.auth.setSession({ access_token, refresh_token }),
          HANDLE_URL_TIMEOUT_MS
        );

        if (sessionError) {
          setError(sessionError.message);
          return;
        }

        router.replace("/");
      } catch {
        setError("timeout");
      }
    }

    // Ako se deep link uopće ne uhvati (getInitialURL nikad ne resolva
    // korisnim URL-om, 'url' event ne stigne), handled.current ostaje
    // false zauvijek i ekran bi inače visio na spinneru bez ikakve
    // povratne informacije - ovaj timer to presiječe.
    const stuckTimer = setTimeout(() => {
      if (!handled.current) {
        handled.current = true;
        setError("timeout");
      }
    }, HANDLE_URL_TIMEOUT_MS);

    Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => {
      clearTimeout(stuckTimer);
      subscription.remove();
    };
  }, [router]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>
          {error === "timeout"
            ? "Prijava predugo traje - nešto nije stiglo na vrijeme."
            : `Prijava nije uspjela (${error})`}
        </Text>
        <Pressable style={styles.button} onPress={() => router.replace("/login")}>
          <Text style={styles.buttonText}>Natrag na prijavu</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator />
      <Text style={styles.body}>Prijavljujem te...</Text>
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
