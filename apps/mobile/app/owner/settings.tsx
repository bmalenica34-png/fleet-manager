import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { formatDateTimeHr } from "@rent-a-car/api";
import {
  getCompanyReportSettings,
  updateCompanyReportSettings,
  type CompanyReportSettingsDTO,
  type ReportFrequency,
} from "../../src/lib/api";

const FREQUENCY_OPTIONS: { value: ReportFrequency; label: string }[] = [
  { value: "off", label: "Isključeno" },
  { value: "daily", label: "Dnevno" },
  { value: "weekly", label: "Tjedno" },
  { value: "monthly", label: "Mjesečno" },
  { value: "custom", label: "Prilagođeno" },
];

// Jedini dio owner-web Settingsa portan na mobile (periodični izvještaji) -
// ostatak (podaci tvrtke/logo/uvjeti najma) ostaje web-only, izvan opsega.
export default function SettingsScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<CompanyReportSettingsDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const [frequency, setFrequency] = useState<ReportFrequency>("off");
  const [customDays, setCustomDays] = useState("7");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getCompanyReportSettings()
      .then((data) => {
        setSettings(data);
        setFrequency(data.reportFrequency);
        setCustomDays(data.reportCustomIntervalDays ? String(data.reportCustomIntervalDays) : "7");
        setEmailEnabled(data.reportEmailEnabled);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Greška"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setError(null);
    setSaved(false);

    if (frequency === "custom" && (!customDays || Number(customDays) < 1)) {
      setError("Upiši valjan broj dana (minimalno 1) za prilagođeni interval.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateCompanyReportSettings({
        reportFrequency: frequency,
        reportCustomIntervalDays: frequency === "custom" ? Number(customDays) : undefined,
        reportEmailEnabled: emailEnabled,
      });
      setSettings(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška prilikom spremanja");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>{"< Natrag"}</Text>
        </Pressable>
        <Text style={styles.title}>Postavke</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Periodični izvještaji</Text>
        <Text style={styles.muted}>
          Automatski izvještaj o profitabilnosti flote. Za pojedinačan izvještaj bilo kad, koristi
          &quot;Preuzmi PDF izvještaj&quot; na statistici flote.
        </Text>

        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Učestalost</Text>
        <View style={styles.chipWrap}>
          {FREQUENCY_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.chip, frequency === opt.value && styles.chipActive]}
              onPress={() => setFrequency(opt.value)}
            >
              <Text style={frequency === opt.value ? styles.chipTextActive : styles.chipText}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {frequency === "custom" && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.fieldLabel}>Interval (broj dana)</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={customDays}
              onChangeText={setCustomDays}
            />
          </View>
        )}

        {frequency !== "off" && (
          <Pressable
            style={[styles.chip, emailEnabled && styles.chipActive, { alignSelf: "flex-start", marginTop: 12 }]}
            onPress={() => setEmailEnabled((v) => !v)}
          >
            <Text style={emailEnabled ? styles.chipTextActive : styles.chipText}>
              {emailEnabled ? "✓ " : ""}Šalji izvještaj emailom
            </Text>
          </Pressable>
        )}

        {settings?.lastReportSentAt && (
          <Text style={[styles.muted, { marginTop: 8 }]}>
            Zadnji izvještaj poslan: {formatDateTimeHr(settings.lastReportSentAt)}
          </Text>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
        {saved && <Text style={styles.muted}>Spremljeno.</Text>}

        <Pressable
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.buttonText}>{saving ? "Spremanje..." : "Spremi postavke izvještaja"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backLink: { color: "#444", width: 60 },
  title: { fontSize: 20, fontWeight: "600" },
  section: { gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: "600" },
  fieldLabel: { fontSize: 13, color: "#444" },
  muted: { color: "#888", fontSize: 13 },
  error: { color: "#c00" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15, marginTop: 4 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  chip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: "#111", borderColor: "#111" },
  chipText: { color: "#111", fontSize: 13 },
  chipTextActive: { color: "#fff", fontSize: 13 },
  button: { backgroundColor: "#111", padding: 14, borderRadius: 8, alignItems: "center", marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600" },
});
