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
import {
  createClient,
  listClients,
  lookupSudreg,
  type ClientRecord,
  type ClientType,
} from "../../../src/lib/api";

export default function ClientsScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [type, setType] = useState<ClientType>("fizicka");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [oib, setOib] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
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
    firstName.trim() &&
    lastName.trim() &&
    /^\d{11}$/.test(oib.trim()) &&
    email.trim() &&
    phone.trim() &&
    (type === "fizicka" || companyName.trim());

  async function handleLookup() {
    if (!/^\d{11}$/.test(oib.trim())) {
      setLookupMessage("OIB firme mora imati 11 znamenki.");
      return;
    }
    setLookupLoading(true);
    setLookupMessage(null);
    try {
      const data = await lookupSudreg(oib.trim());
      if (data.status === "pronadjen" && data.naziv) {
        setCompanyName(data.naziv);
        if (data.adresa) setCompanyAddress(data.adresa);
        setLookupMessage("Podaci dohvaćeni iz sudskog registra.");
      } else if (data.status === "neispravan_oib") {
        setLookupMessage("Neispravan OIB (kontrolna znamenka).");
      } else {
        setLookupMessage("Nije pronađeno u sudskom registru — upiši ručno.");
      }
    } catch {
      setLookupMessage("Sudski registar nedostupan — upiši ručno.");
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSubmit() {
    setFormError(null);
    setSubmitting(true);
    try {
      await createClient({
        type,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        oib: oib.trim(),
        email: email.trim(),
        phone: phone.trim(),
        ...(type === "pravna"
          ? {
              companyName: companyName.trim() || undefined,
              companyAddress: companyAddress.trim() || undefined,
            }
          : {}),
      });
      setType("fizicka");
      setFirstName("");
      setLastName("");
      setOib("");
      setCompanyName("");
      setCompanyAddress("");
      setLookupMessage(null);
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

          <Pressable style={styles.importButton} onPress={() => router.push("/owner/clients/import")}>
            <Text style={styles.importButtonText}>Uvoz klijenata (CSV)</Text>
          </Pressable>

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
            {item.type === "pravna" && item.companyName
              ? item.companyName
              : `${item.firstName} ${item.lastName}`}
            {item.hasIncompleteData ? " ⚠️" : ""}
          </Text>
          <Text style={styles.rowMuted}>
            {item.type === "pravna" ? "Pravna osoba" : "Fizička osoba"}
            {item.type === "pravna" ? ` · ${item.firstName} ${item.lastName}` : ""}
          </Text>
          <Text style={styles.rowBody}>{item.email}</Text>
          <Text style={styles.rowMuted}>
            {item.type === "pravna" ? "OIB firme" : "OIB"} {item.oib} · {item.phone}
          </Text>
          {item.hasIncompleteData && (
            <Text style={styles.rowMuted}>Nedostaje: {item.incompleteReasons.join(", ")}</Text>
          )}
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      ListFooterComponent={
        <View style={styles.form}>
          <Text style={styles.sectionTitle}>Novi klijent</Text>

          <View style={styles.segment}>
            <Pressable
              style={[styles.segmentBtn, type === "fizicka" && styles.segmentBtnActive]}
              onPress={() => {
                setType("fizicka");
                setLookupMessage(null);
              }}
            >
              <Text style={[styles.segmentText, type === "fizicka" && styles.segmentTextActive]}>
                Fizička osoba
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, type === "pravna" && styles.segmentBtnActive]}
              onPress={() => setType("pravna")}
            >
              <Text style={[styles.segmentText, type === "pravna" && styles.segmentTextActive]}>
                Pravna osoba
              </Text>
            </Pressable>
          </View>

          {type === "pravna" && (
            <>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="OIB firme (11 znamenki)"
                  value={oib}
                  onChangeText={setOib}
                  keyboardType="number-pad"
                  maxLength={11}
                />
                <Pressable
                  style={[styles.lookupBtn, lookupLoading && styles.buttonDisabled]}
                  onPress={handleLookup}
                  disabled={lookupLoading}
                >
                  {lookupLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.buttonText}>Pretraži</Text>
                  )}
                </Pressable>
              </View>
              {lookupMessage && <Text style={styles.muted}>{lookupMessage}</Text>}
              <TextInput
                style={styles.input}
                placeholder="Naziv firme"
                value={companyName}
                onChangeText={setCompanyName}
              />
              <TextInput
                style={styles.input}
                placeholder="Adresa sjedišta"
                value={companyAddress}
                onChangeText={setCompanyAddress}
              />
            </>
          )}

          <TextInput
            style={styles.input}
            placeholder={type === "pravna" ? "Ime (odgovorna osoba)" : "Ime"}
            value={firstName}
            onChangeText={setFirstName}
          />
          <TextInput
            style={styles.input}
            placeholder={type === "pravna" ? "Prezime (odgovorna osoba)" : "Prezime"}
            value={lastName}
            onChangeText={setLastName}
          />
          {type === "fizicka" && (
            <TextInput
              style={styles.input}
              placeholder="OIB (11 znamenki)"
              value={oib}
              onChangeText={setOib}
              keyboardType="number-pad"
              maxLength={11}
            />
          )}
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
  importButton: {
    borderWidth: 1,
    borderColor: "#111",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  importButtonText: { color: "#111", fontWeight: "600" },
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
  segment: { flexDirection: "row", borderWidth: 1, borderColor: "#111", borderRadius: 8, overflow: "hidden" },
  segmentBtn: { flex: 1, padding: 12, alignItems: "center", backgroundColor: "#fff" },
  segmentBtnActive: { backgroundColor: "#111" },
  segmentText: { color: "#111", fontWeight: "600", fontSize: 14 },
  segmentTextActive: { color: "#fff" },
  lookupBtn: {
    backgroundColor: "#111",
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
  },
});
