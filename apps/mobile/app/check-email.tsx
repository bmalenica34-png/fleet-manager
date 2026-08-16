import { StyleSheet, Text, View } from "react-native";

export default function CheckEmail() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Provjeri poštu</Text>
      <Text style={styles.body}>
        Poslali smo ti link za prijavu. Otvori mail NA OVOM UREĐAJU i klikni na link da se
        prijaviš.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: "600", textAlign: "center" },
  body: { fontSize: 16, textAlign: "center", color: "#444" },
});
