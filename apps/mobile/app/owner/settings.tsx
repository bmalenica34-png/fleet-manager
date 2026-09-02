import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { formatDateTimeHr } from "@rent-a-car/api";
import {
  getCompanyReportSettings,
  getFiscalSettings,
  registerFiscalPremise,
  updateCompanyReportSettings,
  updateFiscalSettings,
  type CompanyReportSettingsDTO,
  type FiscalSettingsDTO,
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

  // Fiskalizacija
  const [fiscal, setFiscal] = useState<FiscalSettingsDTO | null>(null);
  const [vatRegistered, setVatRegistered] = useState(true);
  const [finaOib, setFinaOib] = useState("");
  const [premiseLabel, setPremiseLabel] = useState("1");
  const [deviceLabel, setDeviceLabel] = useState("1");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [workHours, setWorkHours] = useState("Pon-Pet 08:00-16:00");
  const [fiscalSaving, setFiscalSaving] = useState(false);
  const [registering, setRegistering] = useState(false);

  function applyFiscal(data: FiscalSettingsDTO) {
    setFiscal(data);
    setVatRegistered(data.vatRegistered);
    setFinaOib(data.finaOib ?? "");
    setPremiseLabel(data.finaPremiseLabel ?? "1");
    setDeviceLabel(data.finaDeviceLabel ?? "1");
    setStreet(data.finaPremiseStreet ?? "");
    setHouseNumber(data.finaPremiseHouseNumber ?? "");
    setCity(data.finaPremiseCity ?? "");
    setPostalCode(data.finaPremisePostalCode ?? "");
    setWorkHours(data.finaPremiseWorkHours ?? "Pon-Pet 08:00-16:00");
  }

  useEffect(() => {
    Promise.all([getCompanyReportSettings(), getFiscalSettings()])
      .then(([reports, fisc]) => {
        setSettings(reports);
        setFrequency(reports.reportFrequency);
        setCustomDays(reports.reportCustomIntervalDays ? String(reports.reportCustomIntervalDays) : "7");
        setEmailEnabled(reports.reportEmailEnabled);
        applyFiscal(fisc);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Greška"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveFiscal() {
    if (finaOib && !/^\d{11}$/.test(finaOib)) {
      Alert.alert("Greška", "FINA OIB mora imati 11 znamenki.");
      return;
    }
    setFiscalSaving(true);
    try {
      const updated = await updateFiscalSettings({
        vatRegistered,
        finaOib: finaOib || undefined,
        finaPremiseLabel: premiseLabel || undefined,
        finaDeviceLabel: deviceLabel || undefined,
        finaPremiseStreet: street || undefined,
        finaPremiseHouseNumber: houseNumber || undefined,
        finaPremiseCity: city || undefined,
        finaPremisePostalCode: postalCode || undefined,
        finaPremiseWorkHours: workHours || undefined,
      });
      applyFiscal(updated);
      Alert.alert("Spremljeno", "Postavke fiskalizacije spremljene.");
    } catch (err) {
      Alert.alert("Greška", err instanceof Error ? err.message : "Nije spremljeno");
    } finally {
      setFiscalSaving(false);
    }
  }

  async function handleRegisterPremise() {
    setRegistering(true);
    try {
      applyFiscal(await registerFiscalPremise());
      Alert.alert("CIS", "Poslovni prostor registriran.");
    } catch (err) {
      Alert.alert("CIS greška", err instanceof Error ? err.message : "Nije uspjelo");
    } finally {
      setRegistering(false);
    }
  }

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
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container}>
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fiskalizacija (R1 / R2)</Text>
        <Text style={styles.muted}>
          PROBNA faza — FINA testni certifikat, cistest CIS. Certifikat se postavlja na webu;
          ovdje se uređuje konfiguracija i registrira poslovni prostor.
        </Text>

        <Pressable
          style={[styles.chip, vatRegistered && styles.chipActive, { alignSelf: "flex-start", marginTop: 12 }]}
          onPress={() => setVatRegistered((v) => !v)}
        >
          <Text style={vatRegistered ? styles.chipTextActive : styles.chipText}>
            {vatRegistered ? "✓ " : ""}U sustavu PDV-a (25%)
          </Text>
        </Pressable>

        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>FINA OIB</Text>
        <TextInput style={styles.input} keyboardType="number-pad" maxLength={11} value={finaOib} onChangeText={setFinaOib} />

        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Ozn. prostora</Text>
            <TextInput style={styles.input} value={premiseLabel} onChangeText={setPremiseLabel} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Ozn. uređaja</Text>
            <TextInput style={styles.input} value={deviceLabel} onChangeText={setDeviceLabel} />
          </View>
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Ulica i kućni broj</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput style={[styles.input, { flex: 2 }]} value={street} onChangeText={setStreet} placeholder="Ulica" />
          <TextInput style={[styles.input, { flex: 1 }]} value={houseNumber} onChangeText={setHouseNumber} placeholder="Kbr" />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput style={[styles.input, { flex: 1 }]} value={postalCode} onChangeText={setPostalCode} placeholder="Pošt. br." keyboardType="number-pad" />
          <TextInput style={[styles.input, { flex: 2 }]} value={city} onChangeText={setCity} placeholder="Naselje / grad" />
        </View>
        <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Radno vrijeme</Text>
        <TextInput style={styles.input} value={workHours} onChangeText={setWorkHours} />

        <Pressable
          style={[styles.button, fiscalSaving && styles.buttonDisabled]}
          onPress={handleSaveFiscal}
          disabled={fiscalSaving}
        >
          <Text style={styles.buttonText}>{fiscalSaving ? "Spremanje..." : "Spremi fiskalizaciju"}</Text>
        </Pressable>

        <Text style={[styles.muted, { marginTop: 12 }]}>
          Certifikat: {fiscal?.hasFinaCert ? "✓ postavljen" : "nije postavljen (postavi na webu)"}
        </Text>
        <Text style={styles.muted}>
          Poslovni prostor:{" "}
          {fiscal?.finaPremiseRegisteredAt
            ? `✓ registriran ${formatDateTimeHr(fiscal.finaPremiseRegisteredAt)}`
            : "nije registriran"}
        </Text>
        <Pressable
          style={[styles.button, (registering || !fiscal?.hasFinaCert) && styles.buttonDisabled]}
          onPress={handleRegisterPremise}
          disabled={registering || !fiscal?.hasFinaCert}
        >
          <Text style={styles.buttonText}>
            {registering ? "Registracija..." : "Registriraj poslovni prostor"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
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
