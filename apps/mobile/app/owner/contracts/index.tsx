import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { formatDateHr } from "@rent-a-car/api";
import { listContracts, requestContractPhotos, type ContractListItem } from "../../../src/lib/api";

function formatDate(value: string): string {
  return formatDateHr(value);
}

function isActive(c: ContractListItem): boolean {
  const now = new Date();
  return c.status === "signed" && new Date(c.dateFrom) <= now && new Date(c.dateTo) >= now;
}

export default function ContractsScreen() {
  const router = useRouter();
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    listContracts()
      .then(setContracts)
      .catch((err) => setError(err instanceof Error ? err.message : "Greška"))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  async function handleRequestPhotos(id: string) {
    setRequestingId(id);
    try {
      await requestContractPhotos(id);
      load();
    } finally {
      setRequestingId(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>{"< Natrag"}</Text>
        </Pressable>
        <Text style={styles.title}>Ugovori</Text>
        <View style={{ width: 60 }} />
      </View>

      <Pressable style={styles.newButton} onPress={() => router.push("/owner/contracts/new")}>
        <Text style={styles.newButtonText}>+ Novi ugovor</Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : contracts.length === 0 ? (
        <Text style={styles.muted}>Nema kreiranih ugovora.</Text>
      ) : (
        <FlatList
          data={contracts}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const hasPendingPhotoRequest = item.latestPhotoRequest && !item.latestPhotoRequest.fulfilledAt;
            return (
              <View style={styles.row}>
                <Text style={styles.rowTitle}>
                  #{item.number} · {item.vehicle.make} {item.vehicle.model} ({item.vehicle.licensePlate})
                </Text>
                <Text style={styles.rowBody}>
                  {item.client.firstName} {item.client.lastName}
                </Text>
                <Text style={styles.rowMuted}>
                  {formatDate(item.dateFrom)} – {formatDate(item.dateTo)} · {item.status}
                </Text>
                {item.latestAnnex && (
                  <Text style={styles.rowMuted}>
                    {item.latestAnnex.status === "signed"
                      ? `Produženo do ${formatDate(item.latestAnnex.newDateTo)}`
                      : item.latestAnnex.status === "sent"
                        ? `Zahtjev za produženje poslan (do ${formatDate(item.latestAnnex.newDateTo)})`
                        : item.latestAnnex.status}
                  </Text>
                )}

                {hasPendingPhotoRequest ? (
                  <Text style={styles.rowMuted}>
                    Zahtjev za slike poslan {formatDate(item.latestPhotoRequest!.requestedAt)}
                  </Text>
                ) : isActive(item) ? (
                  <Pressable
                    style={styles.photoButton}
                    onPress={() => handleRequestPhotos(item.id)}
                    disabled={requestingId === item.id}
                  >
                    <Text style={styles.photoButtonText}>
                      {requestingId === item.id ? "Slanje..." : "Zatraži slike"}
                    </Text>
                  </Pressable>
                ) : item.latestPhotoRequest?.fulfilledAt ? (
                  <Text style={styles.rowMuted}>
                    Slike primljene {formatDate(item.latestPhotoRequest.fulfilledAt)}
                  </Text>
                ) : null}
              </View>
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
  muted: { color: "#888", textAlign: "center", marginTop: 24 },
  error: { color: "#c00", textAlign: "center", marginTop: 24 },
  newButton: {
    borderWidth: 1,
    borderColor: "#111",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  newButtonText: { color: "#111", fontWeight: "600" },
  row: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 14, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowBody: { fontSize: 14, color: "#444" },
  rowMuted: { fontSize: 13, color: "#888" },
  photoButton: {
    backgroundColor: "#111",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
  },
  photoButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
});
