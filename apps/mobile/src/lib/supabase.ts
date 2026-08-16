import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Deep link tokene hvatamo ručno u auth-callback.tsx preko expo-linking,
      // ne kroz Supabaseov ugrađeni URL detector (koji je pisan za web).
      detectSessionInUrl: false,
    },
  }
);
