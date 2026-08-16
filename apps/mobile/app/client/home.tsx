import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../src/lib/auth-context";

export default function ClientHome() {
  const { session, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dobrodošao/la</Text>
      <Text style={styles.body}>{session?.user.email}</Text>
      <Text style={styles.body}>Pregled ugovora dolazi u sljedećoj fazi.</Text>

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
  button: { backgroundColor: "#111", padding: 14, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
});
