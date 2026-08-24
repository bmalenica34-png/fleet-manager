import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveOwnerAppPrincipal } from "@rent-a-car/api/server";
import EmployeesManager from "./EmployeesManager";

// Owner-only stranica - isti gate kao requireOwnerOnlySession na API strani
// (vidi apps/web/src/lib/requireOwnerSession.ts), ovdje server-side za samu
// stranicu (owner) layout već skriva "Zaposlenici" link za employeeje.
export default async function EmployeesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const principal = await resolveOwnerAppPrincipal(user.id);
  if (!principal || principal.kind !== "owner") {
    redirect("/vehicles");
  }

  return <EmployeesManager />;
}
