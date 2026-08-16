import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../src/lib/supabase";

/**
 * Zamjena za deep-link magic-link flow (auth-callback.tsx) - custom URL
 * scheme redirect (rentacarmanager://) se pouzdano ne otvara iz in-app
 * browsera mnogih mail aplikacija (Gmail app i sl. iz sigurnosnih razloga
 * blokiraju redirect na non-http(s) scheme, pa app "nikad ne primi link").
 * Kod se verificira izravno preko Supabase klijenta, bez ikakvog deep
 * linkinga - pouzdano radi bez obzira na mail klijent.
 *
 * Kod se šalje u istom mailu kao i link SAMO ako Supabase magic-link email
 * template sadrži {{ .Token }} (dashboard postavka, ne mijenja postojeći
 * {{ .ConfirmationURL }} link koji web i dalje koristi).
 */
export default function VerifyCode() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function handleVerify() {
    setError(null);
    setVerifying(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "email",
      });

      if (verifyError) {
        setError(verifyError.message);
        return;
      }

      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Provjera nije uspjela");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Unesi kod</Text>
      <Text style={styles.body}>Poslali smo kod za prijavu na {email}.</Text>

      <TextInput
        style={styles.input}
        placeholder="123456"
        keyboardType="number-pad"
        autoFocus
        maxLength={6}
        value={code}
        onChangeText={setCode}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, (verifying || code.trim().length < 6) && styles.buttonDisabled]}
        onPress={handleVerify}
        disabled={verifying || code.trim().length < 6}
      >
        <Text style={styles.buttonText}>{verifying ? "Provjeravam..." : "Potvrdi"}</Text>
      </Pressable>

      <Pressable onPress={() => router.replace("/login")}>
        <Text style={styles.backLink}>Natrag na prijavu</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: "600", textAlign: "center" },
  body: { fontSize: 16, textAlign: "center", color: "#444" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 24,
    textAlign: "center",
    letterSpacing: 8,
  },
  error: { color: "#c00", textAlign: "center" },
  button: { backgroundColor: "#111", padding: 14, borderRadius: 8, alignItems: "center" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600" },
  backLink: { textAlign: "center", color: "#444", marginTop: 8 },
});
