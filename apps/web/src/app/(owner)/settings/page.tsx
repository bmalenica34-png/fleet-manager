import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { principalHasPermission, resolveOwnerAppPrincipal } from "@rent-a-car/api/server";
import SettingsForm from "./SettingsForm";
import TermsSection from "./TermsSection";
import PeriodicReportsSection from "./PeriodicReportsSection";
import FiscalizationSection from "./FiscalizationSection";

// Settings je jedina stranica gdje se i sam PRISTUP (ne samo submit) gatea
// server-side - (owner) layout već skriva "Postavke" link za employeeje bez
// te permisije, ali ovo sprječava direktnu navigaciju na URL. Isti obrazac
// resolvea kao (owner)/layout.tsx (svaka zaštićena stranica sam radi svoj
// resolve, nema dijeljenog konteksta - postojeća konvencija u ovom appu).
export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const principal = await resolveOwnerAppPrincipal(user.id);
  if (!principal || !principalHasPermission(principal, "settings")) {
    redirect("/vehicles");
  }

  return (
    <>
      <SettingsForm />
      <PeriodicReportsSection />
      <FiscalizationSection />
      <TermsSection />
    </>
  );
}
