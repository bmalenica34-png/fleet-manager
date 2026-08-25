import { ScrollView, StyleSheet, Text, View } from "react-native";

// Ručno napisan bar chart s plain View elementima - NEMA chart/SVG
// biblioteke u mobile appu (provjereno prije pisanja koda), a novu native
// ovisnost (react-native-svg ili sličan chart paket) treba pitati prije
// dodavanja (korisnikov eksplicitan zahtjev). Proporcionalna visina Viewa
// je dovoljna za jednostavan bar chart, izbjegava potrebu za pitanjem u
// potpunosti. Pojednostavljeno naspram web verzije (StatsChart.tsx u
// apps/web) - NEMA "zero line" podjele iznad/ispod (profit iznad, trošak
// ispod) jer bi to na malom mobile ekranu zahtijevalo više prostora za
// istu čitljivost; umjesto toga obje trake rastu od iste donje linije,
// predznak profita nosi boja (zeleno/crveno), ne smjer.
export interface ChartPoint {
  label: string;
  revenue: number;
  serviceCost: number;
  additionalCosts: number;
  profit: number;
}

const CHART_HEIGHT = 100;

export default function StatsChart({ points }: { points: ChartPoint[] }) {
  if (points.length === 0) return null;

  const totalCosts = points.map((p) => p.serviceCost + p.additionalCosts);
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.profit)), ...totalCosts.map((c) => Math.abs(c)));

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {points.map((p, i) => {
            const totalCost = p.serviceCost + p.additionalCosts;
            const profitHeight = Math.max(2, (Math.abs(p.profit) / maxAbs) * CHART_HEIGHT);
            const costHeight = Math.max(2, (Math.abs(totalCost) / maxAbs) * CHART_HEIGHT);
            return (
              <View key={i} style={styles.column}>
                <View style={styles.barsRow}>
                  <View
                    style={[
                      styles.bar,
                      { height: profitHeight, backgroundColor: p.profit >= 0 ? "#16a34a" : "#dc2626" },
                    ]}
                  />
                  <View style={[styles.bar, { height: costHeight, backgroundColor: "#9ca3af" }]} />
                </View>
                <Text style={styles.label}>{p.label}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <Text style={styles.legend}>🟩 Profit (poz.)   🟥 Profit (neg.)   ⬜ Ukupni troškovi</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 14, paddingVertical: 8 },
  column: { alignItems: "center", gap: 4 },
  barsRow: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: CHART_HEIGHT },
  bar: { width: 14, borderRadius: 2 },
  label: { fontSize: 10, color: "#666" },
  legend: { fontSize: 11, color: "#666", marginTop: 6 },
});
