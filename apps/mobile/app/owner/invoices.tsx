import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { formatDateHr } from "@rent-a-car/api";
import { getInvoicePdfUrl, listInvoices, retryInvoice, type InvoiceDTO } from "../../src/lib/api";

export default function InvoicesScreen() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    listInvoices()
      .then(setInvoices)
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(load);

  async function openPdf(id: string) {
    try {
      const { url } = await getInvoicePdfUrl(id);
      await Linking.openURL(url);
    } catch {
      Alert.alert("Greška", "PDF nije dostupan.");
    }
  }

  async function handleRetry(id: string) {
    setBusyId(id);
    try {
      await retryInvoice(id);
      load();
    } catch (err) {
      Alert.alert("Fiskalizacija", err instanceof Error ? err.message : "Nije uspjelo");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>{"< Natrag"}</Text>
        </Pressable>
        <Text style={styles.title}>Izdani računi</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : invoices.length === 0 ? (
        <Text style={styles.muted}>Još nema izdanih računa.</Text>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowTitle}>
                {item.type} · br. {item.number}
              </Text>
              <Text style={styles.rowBody}>
                {item.recipientName}
                {item.recipientOib ? ` · ${item.recipientOib}` : ""}
              </Text>
              {item.vehicleLabel ? <Text style={styles.rowMuted}>{item.vehicleLabel}</Text> : null}
              <Text style={styles.rowMuted}>
                {formatDateHr(item.issuedAt)} · {item.totalAmount.toFixed(2)} €
                {item.vatRate > 0 ? ` (PDV ${item.vatAmount.toFixed(2)})` : ""}
              </Text>
              {item.status === "fiscalized" ? (
                <Text style={styles.ok}>✓ JIR {item.jir}</Text>
              ) : (
                <Text style={styles.fail}>✗ {item.errorMessage ?? "fiskalizacija neuspješna"}</Text>
              )}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                {item.hasPdf && (
                  <Pressable style={styles.smallBtn} onPress={() => openPdf(item.id)}>
                    <Text style={styles.smallBtnText}>Otvori PDF</Text>
                  </Pressable>
                )}
                {item.status === "failed" && (
                  <Pressable
                    style={[styles.smallBtn, busyId === item.id && styles.disabled]}
                    onPress={() => handleRetry(item.id)}
                    disabled={busyId === item.id}
                  >
                    <Text style={styles.smallBtnText}>
                      {busyId === item.id ? "..." : "Pokušaj ponovno"}
                    </Text>
                  </Pressable>
                )}
              </View>
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
  muted: { color: "#888", textAlign: "center", marginTop: 24 },
  row: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 14, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowBody: { fontSize: 14, color: "#444" },
  rowMuted: { fontSize: 13, color: "#888" },
  ok: { color: "#166534", fontSize: 12, marginTop: 2 },
  fail: { color: "#b91c1c", fontSize: 12, marginTop: 2 },
  smallBtn: { backgroundColor: "#111", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  smallBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
