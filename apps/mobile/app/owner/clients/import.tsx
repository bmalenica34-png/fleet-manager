import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { importClientsCsv, type ClientCsvImportResult, type PickedFile } from "../../../src/lib/api";

const CSV_TEMPLATE_TYPES = [
  "text/csv",
  "text/comma-separated-values",
  "application/vnd.ms-excel",
  "text/plain",
];

export default function ClientsImportScreen() {
  const router = useRouter();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClientCsvImportResult | null>(null);

  async function handlePickFile() {
    const picked = await DocumentPicker.getDocumentAsync({ type: CSV_TEMPLATE_TYPES });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    setFile({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? "text/csv" });
    setResult(null);
    setError(null);
  }

  async function handleImport() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const importResult = await importClientsCsv(file);
      setResult(importResult);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška prilikom uvoza. Provjeri format CSV datoteke.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, gap: 16 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>{"< Natrag"}</Text>
        </Pressable>
        <Text style={styles.title}>Uvoz klijenata (CSV)</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text style={styles.body}>
        OIB je obavezan (klijent se ne može uvesti bez njega - koristi se i za provjeru duplikata).
        Ostala polja (ime, prezime, broj osobne, broj vozačke, adresa, telefon, email, datum rođenja)
        su opcionalna - ako nedostaju ili su u krivom formatu, klijent se svejedno uveze, samo označen
        kao nepotpun. Klijenti čiji OIB ili broj osobne već postoje u bazi se preskaču. CSV uvoz ne
        uključuje dokumente (osobnu, vozačku) - te se slike dodaju naknadno na stranici klijenta.
      </Text>

      <Pressable style={styles.button} onPress={handlePickFile}>
        <Text style={styles.buttonText}>{file ? `Odabrano: ${file.name}` : "Odaberi CSV datoteku"}</Text>
      </Pressable>

      {file && (
        <Pressable
          style={[styles.button, styles.buttonPrimary, uploading && styles.buttonDisabled]}
          onPress={handleImport}
          disabled={uploading}
        >
          {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonTextPrimary}>Uvezi</Text>}
        </Pressable>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {result && (
        <View style={{ gap: 12 }}>
          <Text style={styles.body}>
            <Text style={{ fontWeight: "600" }}>
              {result.importedCount} klijenata uvezeno
              {result.incompleteCount > 0 ? ` (od toga ${result.incompleteCount} nepotpunih)` : ""}
            </Text>
            {result.skippedCount > 0 ? `, ${result.skippedCount} redova preskočeno zbog duplikata/grešaka` : ""}.
          </Text>

          {result.imported.some((r) => r.incomplete) && (
            <View style={{ gap: 8 }}>
              <Text style={styles.sectionTitle}>Nepotpuni klijenti</Text>
              {result.imported
                .filter((r) => r.incomplete)
                .map((r) => (
                  <View key={r.clientId} style={styles.row}>
                    <Text style={styles.rowTitle}>
                      ⚠️ {r.firstName} {r.lastName} ({r.oib})
                    </Text>
                    <Text style={styles.rowMuted}>Redak {r.rowNumber}: {r.reasons.join(", ")}</Text>
                  </View>
                ))}
            </View>
          )}

          {result.skipped.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text style={styles.sectionTitle}>Preskočeni redovi</Text>
              {result.skipped.map((s) => (
                <View key={s.rowNumber} style={styles.row}>
                  <Text style={styles.rowMuted}>Redak {s.rowNumber}: {s.reason}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backLink: { color: "#444", width: 60 },
  title: { fontSize: 20, fontWeight: "600" },
  body: { fontSize: 14, color: "#444", lineHeight: 20 },
  error: { color: "#c00" },
  sectionTitle: { fontSize: 16, fontWeight: "600" },
  button: {
    borderWidth: 1,
    borderColor: "#111",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: { color: "#111", fontWeight: "600" },
  buttonPrimary: { backgroundColor: "#111", borderColor: "#111" },
  buttonTextPrimary: { color: "#fff", fontWeight: "600" },
  buttonDisabled: { opacity: 0.5 },
  row: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowMuted: { fontSize: 13, color: "#888" },
});
