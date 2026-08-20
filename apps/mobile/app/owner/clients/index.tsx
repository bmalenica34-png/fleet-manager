import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { createClient, listClients, type ClientRecord } from "../../../src/lib/api";

export default function ClientsScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [oib, setOib] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    listClients()
      .then(setClients)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Greška"))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  const canSubmit =
    firstName.trim() && lastName.trim() && /^\d{11}$/.test(oib.trim()) && email.trim() && phone.trim();

  async function handleSubmit() {
    setFormError(null);
    setSubmitting(true);
    try {
      await createClient({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        oib: oib.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
      setFirstName("");
      setLastName("");
      setOib("");
      setEmail("");
      setPhone("");
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Provjeri unesene podatke (OIB mora imati 11 znamenki).");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <FlatList
        style={styles.container}
        contentContainerStyle={{ padding: 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
        data={clients}
        keyExtractor={(c) => c.id}
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.backLink}>{"< Natrag"}</Text>
            </Pressable>
            <Text style={styles.title}>Klijenti</Text>
            <View style={{ width: 60 }} />
          </View>

          {loading ? (
            <ActivityIndicator />
          ) : loadError ? (
            <Text style={styles.error}>{loadError}</Text>
          ) : clients.length === 0 ? (
            <Text style={styles.muted}>Nema unesenih klijenata.</Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.rowTitle}>
            {item.firstName} {item.lastName}
          </Text>
          <Text style={styles.rowBody}>{item.email}</Text>
          <Text style={styles.rowMuted}>
            OIB {item.oib} · {item.phone}
          </Text>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      ListFooterComponent={
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Novi klijent</Text>
          <TextInput style={styles.input} placeholder="Ime" value={firstName} onChangeText={setFirstName} />
          <TextInput style={styles.input} placeholder="Prezime" value={lastName} onChangeText={setLastName} />
          <TextInput
            style={styles.input}
            placeholder="OIB (11 znamenki)"
            value={oib}
            onChangeText={setOib}
            keyboardType="number-pad"
            maxLength={11}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput style={styles.input} placeholder="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

          {formError && <Text style={styles.error}>{formError}</Text>}

          <Pressable
            style={[styles.button, (!canSubmit || submitting) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            <Text style={styles.buttonText}>{submitting ? "Spremanje..." : "Dodaj klijenta"}</Text>
          </Pressable>
        </View>
      }
    />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backLink: { color: "#444", width: 60 },
  title: { fontSize: 20, fontWeight: "600" },
  muted: { color: "#888" },
  error: { color: "#c00" },
  row: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 14, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowBody: { fontSize: 14, color: "#444" },
  rowMuted: { fontSize: 13, color: "#888" },
  form: { gap: 10, marginTop: 24, borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 15 },
  button: { backgroundColor: "#111", padding: 14, borderRadius: 8, alignItems: "center", marginTop: 6 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600" },
});
