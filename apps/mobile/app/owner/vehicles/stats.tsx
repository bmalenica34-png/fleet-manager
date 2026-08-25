import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { isoToHrDate, parseHrDateToIso } from "@rent-a-car/api";
import {
  downloadReportPdf,
  getFleetStats,
  listVehicles,
  type VehicleDTO,
  type VehicleStatsDTO,
  type VehicleStatsStatus,
} from "../../../src/lib/api";

const STATUS_BADGE: Record<VehicleStatsStatus, { label: string; bg: string; fg: string }> = {
  good: { label: "Dobro", bg: "#f0fdf4", fg: "#166534" },
  ok: { label: "Prosječno", bg: "#fefce8", fg: "#854d0e" },
  bad: { label: "Loše", bg: "#fef2f2", fg: "#b91c1c" },
  no_activity: { label: "Bez aktivnosti", bg: "#f3f4f6", fg: "#374151" },
};

function StatusBadge({ status }: { status: VehicleStatsStatus }) {
  const { label, bg, fg } = STATUS_BADGE[status];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const RANGE_PRESETS = [7, 30, 90] as const;

function isoDateNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function FleetStatsScreen() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<VehicleDTO[]>([]);
  const [stats, setStats] = useState<VehicleStatsDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const [rangeDays, setRangeDays] = useState<number | null>(30);
  const [from, setFrom] = useState(() => isoDateNDaysAgo(29));
  const [to, setTo] = useState(() => todayIsoDate());
  const [fromHr, setFromHr] = useState("");
  const [toHr, setToHr] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const loadVehicles = useCallback(() => {
    listVehicles()
      .then(setVehicles)
      .catch(() => setVehicles([]));
  }, []);

  useFocusEffect(loadVehicles);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    getFleetStats(from, to)
      .then(setStats)
      .catch(() => setStats([]))
      .finally(() => setLoading(false));
  }, [from, to]);

  function selectPreset(days: number) {
    setRangeDays(days);
    setFrom(isoDateNDaysAgo(days - 1));
    setTo(todayIsoDate());
  }

  function selectCustomRange() {
    setRangeDays(null);
    setFromHr(isoToHrDate(from));
    setToHr(isoToHrDate(to));
  }

  function handleFromHrChange(value: string) {
    setFromHr(value);
    const parsed = parseHrDateToIso(value);
    if (parsed) setFrom(parsed);
  }

  function handleToHrChange(value: string) {
    setToHr(value);
    const parsed = parseHrDateToIso(value);
    if (parsed) setTo(parsed);
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const file = await downloadReportPdf(from, to);
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/pdf" });
      } else {
        Alert.alert("PDF preuzet", `Dijeljenje nije dostupno na ovom uređaju. Fajl je spremljen na: ${file.uri}`);
      }
    } catch (err) {
      Alert.alert("Greška", err instanceof Error ? err.message : "Preuzimanje izvještaja nije uspjelo");
    } finally {
      setDownloadingPdf(false);
    }
  }

  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  // Sortirano po profitu opadajuće - isti obrazac kao web.
  const sortedStats = [...stats].sort((a, b) => b.profit - a.profit);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>{"< Natrag"}</Text>
        </Pressable>
        <Text style={styles.title}>Statistika flote</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.chipWrap}>
        {RANGE_PRESETS.map((days) => (
          <Pressable
            key={days}
            style={[styles.chip, rangeDays === days && styles.chipActive]}
            onPress={() => selectPreset(days)}
          >
            <Text style={rangeDays === days ? styles.chipTextActive : styles.chipText}>
              Zadnjih {days} dana
            </Text>
          </Pressable>
        ))}
        <Pressable style={[styles.chip, rangeDays === null && styles.chipActive]} onPress={selectCustomRange}>
          <Text style={rangeDays === null ? styles.chipTextActive : styles.chipText}>Prilagodi</Text>
        </Pressable>
      </View>

      {rangeDays === null && (
        <View style={{ gap: 8 }}>
          <Text style={styles.fieldLabel}>Od (DD.MM.GGGG.)</Text>
          <TextInput
            style={styles.input}
            value={fromHr}
            onChangeText={handleFromHrChange}
            placeholder="DD.MM.GGGG."
            autoCapitalize="none"
          />
          <Text style={styles.fieldLabel}>Do (DD.MM.GGGG.)</Text>
          <TextInput
            style={styles.input}
            value={toHr}
            onChangeText={handleToHrChange}
            placeholder="DD.MM.GGGG."
            autoCapitalize="none"
          />
        </View>
      )}

      <Pressable
        style={[styles.downloadButton, downloadingPdf && styles.buttonDisabled]}
        onPress={handleDownloadPdf}
        disabled={downloadingPdf}
      >
        <Text style={styles.downloadButtonText}>
          {downloadingPdf ? "Preuzimanje..." : "Preuzmi PDF izvještaj"}
        </Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : sortedStats.length === 0 ? (
        <Text style={styles.body}>Nema unesenih vozila.</Text>
      ) : (
        <FlatList
          data={sortedStats}
          keyExtractor={(s) => s.vehicleId}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const vehicle = vehicleById.get(item.vehicleId);
            return (
              <Pressable
                style={styles.row}
                onPress={() =>
                  router.push({ pathname: "/owner/vehicles/[id]", params: { id: item.vehicleId } })
                }
              >
                <View style={styles.rowTitleRow}>
                  <Text style={styles.rowTitle}>
                    {vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.licensePlate})` : item.vehicleId}
                  </Text>
                  <StatusBadge status={item.status} />
                </View>
                <Text style={styles.rowBody}>
                  {item.rentedDays} / {item.totalDays} dana pod ugovorom
                </Text>
                <Text style={styles.rowMuted}>
                  Prihod {item.revenue.toFixed(2)} € · Servis {item.serviceCost.toFixed(2)} € · Dodatni{" "}
                  {item.additionalCosts.toFixed(2)} € · Profit {item.profit.toFixed(2)} €
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backLink: { color: "#444", width: 60 },
  title: { fontSize: 20, fontWeight: "600" },
  body: { fontSize: 16, color: "#444", textAlign: "center", marginTop: 24 },
  fieldLabel: { fontSize: 13, color: "#444" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  row: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 14,
    gap: 4,
  },
  rowTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowTitle: { fontSize: 16, fontWeight: "600", flexShrink: 1 },
  rowBody: { fontSize: 14, color: "#444" },
  rowMuted: { fontSize: 13, color: "#888" },
  badge: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  downloadButton: {
    borderWidth: 1,
    borderColor: "#111",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  downloadButtonText: { color: "#111", fontWeight: "600" },
  buttonDisabled: { opacity: 0.5 },
});
