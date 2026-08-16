import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { requestMagicLink, type MobileRole } from "../src/lib/api";

export default function Login() {
  const router = useRouter();
  const [role, setRole] = useState<MobileRole>("owner");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSending(true);
    try {
      await requestMagicLink(role, email.trim());
      router.push("/check-email");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Slanje nije uspjelo");
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Rent-a-Car Manager</Text>

      <View style={styles.roleToggle}>
        <Pressable
          style={[styles.roleButton, role === "owner" && styles.roleButtonActive]}
          onPress={() => setRole("owner")}
        >
          <Text style={role === "owner" ? styles.roleTextActive : styles.roleText}>Vlasnik</Text>
        </Pressable>
        <Pressable
          style={[styles.roleButton, role === "client" && styles.roleButtonActive]}
          onPress={() => setRole("client")}
        >
          <Text style={role === "client" ? styles.roleTextActive : styles.roleText}>Klijent</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.input}
        placeholder="email@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.submitButton, (sending || !email.trim()) && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={sending || !email.trim()}
      >
        <Text style={styles.submitText}>{sending ? "Šaljem..." : "Pošalji link za prijavu"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: "600", textAlign: "center", marginBottom: 8 },
  roleToggle: { flexDirection: "row", gap: 8 },
  roleButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    alignItems: "center",
  },
  roleButtonActive: { backgroundColor: "#111", borderColor: "#111" },
  roleText: { color: "#111" },
  roleTextActive: { color: "#fff" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  error: { color: "#c00" },
  submitButton: { backgroundColor: "#111", padding: 14, borderRadius: 8, alignItems: "center" },
  submitButtonDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontWeight: "600" },
});
