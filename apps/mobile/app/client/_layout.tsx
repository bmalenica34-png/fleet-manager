import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../src/lib/auth-context";

export default function ClientLayout() {
  const { status } = useAuth();

  if (status === "loading") return null;
  if (status !== "client") return <Redirect href="/login" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
