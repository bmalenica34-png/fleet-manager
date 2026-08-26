import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../src/lib/auth-context";
import StatsChart from "../../src/components/StatsChart";
import {
  getFleetStats,
  getStatsTimeSeries,
  getVehicleStats,
  listVehicles,
  type StatsTimeSeriesPoint,
  type VehicleDTO,
  type VehicleStatsDTO,
} from "../../src/lib/api";

const RANGE_PRESETS = [7, 30, 90] as const;

function isoDateNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// "" = "Sva vozila" - isti obrazac kao web dashboard (`(owner)/page.tsx`).
const ALL_VEHICLES = "";

function StatRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.statRow}>
      <Text style={bold ? styles.statLabelBold : styles.statLabel}>{label}</Text>
      <Text style={bold ? styles.statLabelBold : styles.statValue}>{value}</Text>
    </View>
  );
}

// Owner-appov ulazni ekran je od ovog nastavka pravi dashboard (korisnikov
// eksplicitan zahtjev) - default "sva vozila", zadnjih 30 dana. Nav
// izbornik ostaje na vrhu, samo kompaktniji (isti gumbi kao prije).
export default function OwnerHome() {
  const router = useRouter();
  const { session, signOut } = useAuth();

  const [vehicles, setVehicles] = useState<VehicleDTO[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(ALL_VEHICLES);
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [from, setFrom] = useState(() => isoDateNDaysAgo(29));
  const [to, setTo] = useState(() => todayIsoDate());

  const [fleetStats, setFleetStats] = useState<VehicleStatsDTO[]>([]);
  const [vehicleStats, setVehicleStats] = useState<VehicleStatsDTO | null>(null);
  const [chartPoints, setChartPoints] = useState<StatsTimeSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const loadVehicles = useCallback(() => {
    listVehicles()
      .then(setVehicles)
      .catch(() => setVehicles([]));
  }, []);

  useFocusEffect(loadVehicles);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);

    const statsPromise =
      selectedVehicleId === ALL_VEHICLES ? getFleetStats(from, to) : getVehicleStats(selectedVehicleId, from, to);

    Promise.all([statsPromise, getStatsTimeSeries(selectedVehicleId || null, from, to)])
      .then(([stats, series]) => {
        if (selectedVehicleId === ALL_VEHICLES) {
          setFleetStats(stats as VehicleStatsDTO[]);
          setVehicleStats(null);
        } else {
          setVehicleStats(stats as VehicleStatsDTO);
          setFleetStats([]);
        }
        setChartPoints(series);
      })
      .catch(() => {
        setFleetStats([]);
        setVehicleStats(null);
        setChartPoints([]);
      })
      .finally(() => setLoading(false));
  }, [selectedVehicleId, from, to]);

  function selectPreset(days: number) {
    setRangeDays(days);
    setFrom(isoDateNDaysAgo(days - 1));
    setTo(todayIsoDate());
  }

  const totals =
    selectedVehicleId === ALL_VEHICLES
      ? fleetStats.reduce(
          (acc, s) => ({
            revenue: acc.revenue + s.revenue,
            serviceCost: acc.serviceCost + s.serviceCost,
            additionalCosts: acc.additionalCosts + s.additionalCosts,
            profit: acc.profit + s.profit,
            rentedDays: acc.rentedDays + s.rentedDays,
            totalDays: acc.totalDays + s.totalDays,
          }),
          { revenue: 0, serviceCost: 0, additionalCosts: 0, profit: 0, rentedDays: 0, totalDays: 0 }
        )
      : vehicleStats;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, gap: 20 }}>
      <View>
        <Text style={styles.title}>Rent-a-Car Manager</Text>
        <Text style={styles.body}>{session?.user.email}</Text>
      </View>

      <View style={styles.menu}>
        <Pressable style={styles.menuButton} onPress={() => router.push("/owner/vehicles")}>
          <Text style={styles.menuText}>Vozila</Text>
        </Pressable>
        <Pressable style={styles.menuButton} onPress={() => router.push("/owner/clients")}>
          <Text style={styles.menuText}>Klijenti</Text>
        </Pressable>
        <Pressable style={styles.menuButton} onPress={() => router.push("/owner/contracts")}>
          <Text style={styles.menuText}>Ugovori</Text>
        </Pressable>
        <Pressable style={styles.menuButton} onPress={() => router.push("/owner/najmovi")}>
          <Text style={styles.menuText}>Najmovi</Text>
        </Pressable>
        <Pressable style={styles.menuButton} onPress={() => router.push("/owner/settings")}>
          <Text style={styles.menuText}>Postavke</Text>
        </Pressable>
      </View>

      <View>
        <Text style={styles.sectionTitle}>Dashboard</Text>

        <View style={styles.chipWrap}>
          <Pressable
            style={[styles.chip, selectedVehicleId === ALL_VEHICLES && styles.chipActive]}
            onPress={() => setSelectedVehicleId(ALL_VEHICLES)}
          >
            <Text style={selectedVehicleId === ALL_VEHICLES ? styles.chipTextActive : styles.chipText}>
              Sva vozila
            </Text>
          </Pressable>
          {vehicles.map((v) => (
            <Pressable
              key={v.id}
              style={[styles.chip, selectedVehicleId === v.id && styles.chipActive]}
              onPress={() => setSelectedVehicleId(v.id)}
            >
              <Text style={selectedVehicleId === v.id ? styles.chipTextActive : styles.chipText}>
                {v.make} {v.model}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.chipWrap}>
          {RANGE_PRESETS.map((days) => (
            <Pressable
              key={days}
              style={[styles.chip, rangeDays === days && styles.chipActive]}
              onPress={() => selectPreset(days)}
            >
              <Text style={rangeDays === days ? styles.chipTextActive : styles.chipText}>Zadnjih {days} dana</Text>
            </Pressable>
          ))}
        </View>

        {loading || !totals ? (
          <ActivityIndicator style={{ marginTop: 12 }} />
        ) : (
          <View style={{ gap: 4, marginTop: 8 }}>
            <StatRow label="Prihod" value={`${totals.revenue.toFixed(2)} €`} />
            <StatRow label="Trošak servisa" value={`${totals.serviceCost.toFixed(2)} €`} />
            <StatRow label="Dodatni troškovi" value={`${totals.additionalCosts.toFixed(2)} €`} />
            <StatRow label="Profit" value={`${totals.profit.toFixed(2)} €`} bold />
            <StatRow label="Dana pod ugovorom" value={`${totals.rentedDays}/${totals.totalDays}`} />

            <Text style={[styles.sectionTitle, { marginTop: 12, marginBottom: 4 }]}>Kretanje kroz vrijeme</Text>
            <StatsChart points={chartPoints} />
          </View>
        )}
      </View>

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Odjava</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 22, fontWeight: "600" },
  body: { fontSize: 16, color: "#444", marginTop: 4 },
  menu: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  menuButton: {
    backgroundColor: "#111",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  menuText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  sectionTitle: { fontSize: 17, fontWeight: "600", marginBottom: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
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
  statRow: { flexDirection: "row", justifyContent: "space-between" },
  statLabel: { color: "#666", fontSize: 14 },
  statValue: { fontSize: 14 },
  statLabelBold: { fontWeight: "600", fontSize: 15 },
  signOutButton: { padding: 12, alignItems: "center" },
  signOutText: { color: "#444" },
});
