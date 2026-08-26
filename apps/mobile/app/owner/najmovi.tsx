import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { formatDateHr } from "@rent-a-car/api";
import { listRentPayments, markRentPaymentPaid, type RentPaymentDTO } from "../../src/lib/api";

type StatusFilter = "unpaid" | "paid" | "all";

export default function NajmoviScreen() {
  const router = useRouter();
  const [payments, setPayments] = useState<RentPaymentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("unpaid");
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(() => {
    listRentPayments()
      .then(setPayments)
      .catch(() => setPayments([]))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  async function handleMarkPaid(id: string) {
    setMarkingId(id);
    try {
      await markRentPaymentPaid(id);
      load();
    } finally {
      setMarkingId(null);
    }
  }

  const filtered = useMemo(() => {
    if (filter === "unpaid") return payments.filter((p) => !p.paid);
    if (filter === "paid") return payments.filter((p) => p.paid);
    return payments;
  }, [payments, filter]);

  const totalUnpaid = payments.filter((p) => !p.paid).reduce((sum, p) => sum + p.amount, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>{"< Natrag"}</Text>
        </Pressable>
        <Text style={styles.title}>Najmovi</Text>
        <View style={{ width: 60 }} />
      </View>

      {!loading && <Text style={styles.sectionTitle}>Ukupno neplaćeno: {totalUnpaid.toFixed(2)} €</Text>}

      <View style={styles.chipWrap}>
        {(["unpaid", "paid", "all"] as StatusFilter[]).map((f) => (
          <Pressable key={f} style={[styles.chip, filter === f && styles.chipActive]} onPress={() => setFilter(f)}>
            <Text style={filter === f ? styles.chipTextActive : styles.chipText}>
              {f === "unpaid" ? "Neplaćeno" : f === "paid" ? "Plaćeno" : "Sve"}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : filtered.length === 0 ? (
        <Text style={styles.muted}>Nema redaka za odabrani filter.</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowTitle}>{item.clientName}</Text>
              <Text style={styles.rowBody}>{item.vehicleLabel}</Text>
              <Text style={styles.rowMuted}>
                {formatDateHr(item.periodStart)} – {formatDateHr(item.periodEnd)} · Dospijeće:{" "}
                {formatDateHr(item.dueDate)}
              </Text>
              <Text style={styles.rowBody}>{item.amount.toFixed(2)} €</Text>
              {item.paid ? (
                <Text style={styles.paidText}>
                  ✓ Plaćeno {item.paidAt ? formatDateHr(item.paidAt) : ""}
                </Text>
              ) : (
                <Pressable
                  style={[styles.button, markingId === item.id && styles.buttonDisabled]}
                  onPress={() => handleMarkPaid(item.id)}
                  disabled={markingId === item.id}
                >
                  <Text style={styles.buttonText}>{markingId === item.id ? "Spremanje..." : "Plaćeno"}</Text>
                </Pressable>
              )}
            </View>
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
  sectionTitle: { fontSize: 16, fontWeight: "600" },
  muted: { color: "#888", textAlign: "center", marginTop: 24 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { backgroundColor: "#111", borderColor: "#111" },
  chipText: { color: "#111", fontSize: 13 },
  chipTextActive: { color: "#fff", fontSize: 13 },
  row: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 14, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowBody: { fontSize: 14, color: "#444" },
  rowMuted: { fontSize: 13, color: "#888" },
  paidText: { color: "#166534", fontSize: 13, fontWeight: "600", marginTop: 4 },
  button: {
    backgroundColor: "#111",
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
});
