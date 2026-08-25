import { Document, Page, Text, View } from "./components";
import { styles } from "./styles";
import { formatDate } from "./format";

export interface ReportPdfVehicleRow {
  vehicleLabel: string;
  rentedDays: number;
  totalDays: number;
  revenue: number;
  serviceCost: number;
  additionalCosts: number;
  profit: number;
  status: "good" | "ok" | "bad" | "no_activity";
}

export interface ReportPdfProps {
  companyName: string;
  from: Date;
  to: Date;
  vehicles: ReportPdfVehicleRow[];
  totals: {
    revenue: number;
    serviceCost: number;
    additionalCosts: number;
    profit: number;
    rentedDays: number;
    totalDays: number;
  };
}

const STATUS_LABEL_HR: Record<ReportPdfVehicleRow["status"], string> = {
  good: "Dobro",
  ok: "Prosječno",
  bad: "Loše",
  no_activity: "Bez aktivnosti",
};

function eur(value: number): string {
  return `${value.toFixed(2)} EUR`;
}

const COL = {
  vehicle: { width: "28%" },
  days: { width: "12%" },
  revenue: { width: "14%" },
  cost: { width: "14%" },
  additional: { width: "14%" },
  profit: { width: "18%" },
};

/**
 * On-demand izvještaj za proizvoljno odabrano razdoblje - poziva ga
 * `GET /api/reports/pdf` (server/reports.ts nema, generira se izravno u
 * ruti), NIJE spremljen na Hetzner (ephemeralno, parametrizirano - nema
 * smisla trajno čuvati svaku moguću kombinaciju datuma), streama se
 * izravno kao download. Isti podaci kao automatski periodični mail
 * (buildFleetReportData iz periodicReports.ts), samo PDF umjesto HTML-a.
 */
export function ReportPdfDocument({ companyName, from, to, vehicles, totals }: ReportPdfProps) {
  const sorted = [...vehicles].sort((a, b) => b.profit - a.profit);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Izvještaj o profitabilnosti flote</Text>
        <Text style={styles.subtitle}>
          {companyName} - razdoblje {formatDate(from)} - {formatDate(to)}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ukupno (flota)</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Prihod</Text>
            <Text style={styles.value}>{eur(totals.revenue)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Trošak servisa</Text>
            <Text style={styles.value}>{eur(totals.serviceCost)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Dodatni troškovi (leasing/osiguranje/ostalo)</Text>
            <Text style={styles.value}>{eur(totals.additionalCosts)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Profit</Text>
            <Text style={styles.value}>{eur(totals.profit)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Dana pod ugovorom</Text>
            <Text style={styles.value}>
              {totals.rentedDays} / {totals.totalDays}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Po vozilu (sortirano po profitu)</Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableCellHeader, COL.vehicle]}>Vozilo</Text>
              <Text style={[styles.tableCellHeader, COL.days]}>Dana</Text>
              <Text style={[styles.tableCellHeader, COL.revenue]}>Prihod</Text>
              <Text style={[styles.tableCellHeader, COL.cost]}>Servis</Text>
              <Text style={[styles.tableCellHeader, COL.additional]}>Dodatni</Text>
              <Text style={[styles.tableCellHeader, COL.profit]}>Profit / status</Text>
            </View>
            {sorted.map((v, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tableCell, COL.vehicle]}>{v.vehicleLabel}</Text>
                <Text style={[styles.tableCell, COL.days]}>
                  {v.rentedDays}/{v.totalDays}
                </Text>
                <Text style={[styles.tableCell, COL.revenue]}>{eur(v.revenue)}</Text>
                <Text style={[styles.tableCell, COL.cost]}>{eur(v.serviceCost)}</Text>
                <Text style={[styles.tableCell, COL.additional]}>{eur(v.additionalCosts)}</Text>
                <Text style={[styles.tableCell, COL.profit]}>
                  {eur(v.profit)} ({STATUS_LABEL_HR[v.status]})
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}
