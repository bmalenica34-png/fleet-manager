import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/lib/auth-context";
import { apiFetch } from "../../src/lib/api";

export default function OwnerHome() {
  const { session, signOut } = useAuth();
  const [vehicleCount, setVehicleCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<unknown[]>("/api/vehicles")
      .then((vehicles) => setVehicleCount(vehicles.length))
      .catch((err) => setError(err instanceof Error ? err.message : "Greška"));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dobrodošao/la, vlasniče</Text>
      <Text style={styles.body}>{session?.user.email}</Text>

      {error ? (
        <Text style={styles.error}>Vozila: greška ({error})</Text>
      ) : vehicleCount === null ? (
        <ActivityIndicator />
      ) : (
        <Text style={styles.body}>Vozila u floti: {vehicleCount}</Text>
      )}

      <Pressable style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Odjava</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: "600", textAlign: "center" },
  body: { fontSize: 16, textAlign: "center", color: "#444" },
  error: { fontSize: 16, textAlign: "center", color: "#c00" },
  button: { backgroundColor: "#111", padding: 14, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
});
