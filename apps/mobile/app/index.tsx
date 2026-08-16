import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/lib/auth-context";

export default function Index() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (status === "signed-out") return <Redirect href="/login" />;
  if (status === "owner") return <Redirect href="/owner/home" />;
  return <Redirect href="/client/home" />;
}
