import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";

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

      const { error: sessionError } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      if (sessionError) {
        setError(sessionError.message);
        return;
      }

      router.replace("/");
    }

    Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, [router]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Prijava nije uspjela ({error})</Text>
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
});
