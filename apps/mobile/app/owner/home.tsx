import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../src/lib/auth-context";

export default function OwnerHome() {
  const router = useRouter();
  const { session, signOut } = useAuth();

  return (
    <View style={styles.container}>
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
      </View>

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Odjava</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 24 },
  title: { fontSize: 22, fontWeight: "600", textAlign: "center" },
  body: { fontSize: 16, textAlign: "center", color: "#444", marginTop: 4 },
  menu: { gap: 12 },
  menuButton: {
    backgroundColor: "#111",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  menuText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  signOutButton: { padding: 12, alignItems: "center" },
  signOutText: { color: "#444" },
});
