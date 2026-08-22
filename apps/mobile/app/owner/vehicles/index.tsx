import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { formatDateHr } from "@rent-a-car/api";
import { listVehicles, type VehicleDTO } from "../../../src/lib/api";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return formatDateHr(value);
}

export default function VehiclesList() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<VehicleDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    listVehicles()
      .then(setVehicles)
      .catch((err) => setError(err instanceof Error ? err.message : "Greška"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Ponovno učitaj svaki put kad se ekran vrati u fokus (npr. povratak s
  // detalja vozila nakon uređivanja) - useEffect s [] bi to propustio.
  useFocusEffect(load);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>{"< Natrag"}</Text>
        </Pressable>
        <Text style={styles.title}>Vozila</Text>
        <View style={{ width: 60 }} />
      </View>

      <Pressable style={styles.newButton} onPress={() => router.push("/owner/vehicles/new")}>
        <Text style={styles.newButtonText}>+ Dodaj vozilo</Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : vehicles.length === 0 ? (
        <Text style={styles.body}>Nema unesenih vozila.</Text>
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(v) => v.id}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push({ pathname: "/owner/vehicles/[id]", params: { id: item.id } })}
            >
              <Text style={styles.rowTitle}>
                {item.make} {item.model}
              </Text>
              <Text style={styles.rowBody}>{item.licensePlate}</Text>
              <Text style={styles.rowMuted}>Registracija ističe: {formatDate(item.registrationExpiresAt)}</Text>
            </Pressable>
          )}
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
  error: { color: "#c00", textAlign: "center", marginTop: 24 },
  newButton: {
    borderWidth: 1,
    borderColor: "#111",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  newButtonText: { color: "#111", fontWeight: "600" },
  row: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 14,
    gap: 4,
  },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowBody: { fontSize: 14, color: "#444" },
  rowMuted: { fontSize: 13, color: "#888" },
});
