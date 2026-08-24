import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { formatDateHr, parseHrDateToIso } from "@rent-a-car/api";
import {
  closeContract,
  createContract,
  getVehicleActiveContract,
  listClients,
  listVehicles,
  parseVehicleActiveContractConflict,
  type ActiveContractSummary,
  type ClientRecord,
  type VehicleDTO,
} from "../../../src/lib/api";

type DateFromMode = "today" | "tomorrow" | "custom";

function todayIso(): string {
  return offsetIso(0);
}

function offsetIso(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function NewContractScreen() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<VehicleDTO[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  const [vehicleActiveContract, setVehicleActiveContract] = useState<ActiveContractSummary | null>(null);
  const [checkingActiveContract, setCheckingActiveContract] = useState(false);
  const [closingActiveContract, setClosingActiveContract] = useState(false);

  const [dateFromMode, setDateFromMode] = useState<DateFromMode>("today");
  const [dateFrom, setDateFrom] = useState(todayIso());
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [days, setDays] = useState("7");

  const [pricePerDay, setPricePerDay] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [odometerStart, setOdometerStart] = useState("");
  const [excessAmount, setExcessAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([listVehicles(), listClients()])
      .then(([v, c]) => {
        setVehicles(v);
        setClients(c);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Greška pri učitavanju"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!vehicleId) {
      setVehicleActiveContract(null);
      return;
    }
    let cancelled = false;
    setCheckingActiveContract(true);
    getVehicleActiveContract(vehicleId)
      .then((contract) => {
        if (!cancelled) setVehicleActiveContract(contract);
      })
      .catch(() => {
        if (!cancelled) setVehicleActiveContract(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingActiveContract(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  async function handleCloseActiveContract() {
    if (!vehicleActiveContract) return;
    setClosingActiveContract(true);
    try {
      await closeContract(vehicleActiveContract.id);
      setVehicleActiveContract(null);
    } finally {
      setClosingActiveContract(false);
    }
  }

  function selectDateFromMode(mode: DateFromMode) {
    setDateFromMode(mode);
    if (mode === "today") setDateFrom(todayIso());
    if (mode === "tomorrow") setDateFrom(offsetIso(1));
    if (mode === "custom") {
      setCustomDateFrom(dateFrom ? formatDateHr(dateFrom) : "");
      setDateFrom("");
    }
  }

  function handleCustomDateFromChange(value: string) {
    setCustomDateFrom(value);
    const parsed = parseHrDateToIso(value);
    setDateFrom(parsed ?? "");
  }

  const dayCount = Number(days);
  const dateTo = dateFrom && dayCount > 0 ? addDaysIso(dateFrom, dayCount) : null;
  const pricePerDayValid = Number(pricePerDay) > 0;
  const canSubmit = Boolean(
    vehicleId && clientId && dateFrom && dateTo && pricePerDayValid && !vehicleActiveContract
  );

  async function handleSubmit() {
    if (!vehicleId || !clientId || !dateFrom || !dateTo || !pricePerDayValid) return;
    setError(null);
    setSubmitting(true);
    try {
      await createContract({
        vehicleId,
        clientId,
        dateFrom,
        dateTo,
        pricePerDay: Number(pricePerDay),
        pickupLocation: pickupLocation || undefined,
        odometerStart: odometerStart ? Number(odometerStart) : undefined,
        excessAmount: excessAmount ? Number(excessAmount) : undefined,
        paymentMethod: paymentMethod || undefined,
      });
      router.replace("/owner/contracts");
    } catch (err) {
      const conflict = parseVehicleActiveContractConflict(err);
      if (conflict) {
        setVehicleActiveContract(conflict);
        setError("Ovo vozilo već ima tekući ugovor - zatvori ga prije nastavka.");
      } else {
        setError(err instanceof Error ? err.message : "Greška prilikom kreiranja ugovora. Provjeri datume i odabir.");
      }
    } finally {
      setSubmitting(false);
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 24, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backLink}>{"< Natrag"}</Text>
          </Pressable>
          <Text style={styles.title}>Novi ugovor</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vozilo</Text>
          {vehicles.length === 0 ? (
            <Text style={styles.muted}>Nema unesenih vozila.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {vehicles.map((v) => (
                <Pressable
                  key={v.id}
                  style={[styles.option, vehicleId === v.id && styles.optionActive]}
                  onPress={() => setVehicleId(v.id)}
                >
                  <Text style={vehicleId === v.id ? styles.optionTextActive : styles.optionText}>
                    {v.make} {v.model} ({v.licensePlate})
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {checkingActiveContract && <Text style={styles.muted}>Provjera dostupnosti vozila...</Text>}

          {vehicleActiveContract && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                ⚠️ Ovo vozilo već ima tekući ugovor br. {vehicleActiveContract.number} (
                {vehicleActiveContract.client.firstName} {vehicleActiveContract.client.lastName}, do{" "}
                {formatDateHr(vehicleActiveContract.dateTo)}). Izdavanje novog ugovora nije moguće dok se
                postojeći ne zatvori.
              </Text>
              <Pressable
                style={[styles.buttonSecondary, closingActiveContract && styles.buttonDisabled]}
                onPress={handleCloseActiveContract}
                disabled={closingActiveContract}
              >
                <Text style={styles.buttonSecondaryText}>
                  {closingActiveContract ? "Zatvaranje..." : "Zatvori postojeći ugovor"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Klijent</Text>
          {clients.length === 0 ? (
            <Text style={styles.muted}>Nema unesenih klijenata - prvo dodaj klijenta.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {clients.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.option, clientId === c.id && styles.optionActive]}
                  onPress={() => setClientId(c.id)}
                >
                  <Text style={clientId === c.id ? styles.optionTextActive : styles.optionText}>
                    {c.firstName} {c.lastName} ({c.email})
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Početak najma</Text>
          <View style={styles.quickRow}>
            <Pressable
              style={[styles.quickButton, dateFromMode === "today" && styles.optionActive]}
              onPress={() => selectDateFromMode("today")}
            >
              <Text style={dateFromMode === "today" ? styles.optionTextActive : styles.optionText}>
                Danas
              </Text>
            </Pressable>
            <Pressable
              style={[styles.quickButton, dateFromMode === "tomorrow" && styles.optionActive]}
              onPress={() => selectDateFromMode("tomorrow")}
            >
              <Text style={dateFromMode === "tomorrow" ? styles.optionTextActive : styles.optionText}>
                Sutra
              </Text>
            </Pressable>
            <Pressable
              style={[styles.quickButton, dateFromMode === "custom" && styles.optionActive]}
              onPress={() => selectDateFromMode("custom")}
            >
              <Text style={dateFromMode === "custom" ? styles.optionTextActive : styles.optionText}>
                Custom
              </Text>
            </Pressable>
          </View>
          {dateFromMode === "custom" ? (
            <TextInput
              style={styles.input}
              placeholder="DD.MM.GGGG."
              value={customDateFrom}
              onChangeText={handleCustomDateFromChange}
            />
          ) : (
            <Text style={styles.muted}>{formatDateHr(dateFrom)}</Text>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Trajanje najma (broj dana)</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={days}
            onChangeText={setDays}
          />
          {dateTo && <Text style={styles.muted}>Datum povrata: {formatDateHr(dateTo)}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cijena/dan (EUR)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="npr. 45"
            value={pricePerDay}
            onChangeText={setPricePerDay}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dodatni podaci (opcionalno)</Text>
          <Text style={styles.muted}>
            Prikazuju se na ugovoru ako su popunjeni - nisu obavezni za slanje na potpis.
          </Text>
          <Text style={[styles.sectionTitle, { fontSize: 14, marginTop: 4 }]}>Mjesto preuzimanja</Text>
          <TextInput style={styles.input} value={pickupLocation} onChangeText={setPickupLocation} />
          <Text style={[styles.sectionTitle, { fontSize: 14, marginTop: 4 }]}>Kilometraža pri preuzimanju</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={odometerStart}
            onChangeText={setOdometerStart}
          />
          <Text style={[styles.sectionTitle, { fontSize: 14, marginTop: 4 }]}>Učešće u šteti (EUR)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={excessAmount}
            onChangeText={setExcessAmount}
          />
          <Text style={[styles.sectionTitle, { fontSize: 14, marginTop: 4 }]}>Način plaćanja</Text>
          <TextInput
            style={styles.input}
            placeholder="npr. Gotovina, Kartica, Transakcijski račun"
            value={paymentMethod}
            onChangeText={setPaymentMethod}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.button, (!canSubmit || submitting) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          <Text style={styles.buttonText}>{submitting ? "Slanje..." : "Kreiraj i pošalji na potpis"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { gap: 4 },
  backLink: { color: "#444" },
  title: { fontSize: 22, fontWeight: "600" },
  section: { gap: 8, borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "600" },
  muted: { color: "#888" },
  error: { color: "#c00" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 15 },
  option: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 },
  optionActive: { backgroundColor: "#111", borderColor: "#111" },
  optionText: { color: "#111" },
  optionTextActive: { color: "#fff" },
  quickRow: { flexDirection: "row", gap: 8 },
  quickButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
  },
  button: { backgroundColor: "#111", padding: 14, borderRadius: 8, alignItems: "center" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600" },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: "#111",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonSecondaryText: { color: "#111", fontWeight: "600" },
  warningBox: {
    borderWidth: 1,
    borderColor: "#d97706",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#fffbeb",
    gap: 10,
  },
  warningText: { color: "#92400e", fontSize: 13, lineHeight: 18 },
});
