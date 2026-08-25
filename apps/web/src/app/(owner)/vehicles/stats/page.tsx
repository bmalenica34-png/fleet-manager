import { redirect } from "next/navigation";

// Zamijenjeno dashboardom na "/" (vidi (owner)/page.tsx) - selektor "sva
// vozila/jedno vozilo" tamo pokriva ono što je ova stranica prije radila
// (samo "sva vozila" tablica). Redirect čuva stare linkove/emailove koji
// još pokazuju na ovu rutu.
export default function VehicleStatsRedirect() {
  redirect("/");
}
