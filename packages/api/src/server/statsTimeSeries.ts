import { getFleetStats, getVehicleStats } from "./vehicleStats";

export interface StatsTimeSeriesPoint {
  label: string; // "MM.GGGG."
  from: Date;
  to: Date;
  revenue: number;
  serviceCost: number;
  additionalCosts: number;
  profit: number;
}

/**
 * Dijeli [from,to] na kalendarske mjesečne "kante" - prva/zadnja kanta se
 * odsijeca na stvaran raspon (npr. razdoblje 20.08. - 15.09. daje dvije
 * kante: "08.2026" [20.08.-31.08.] i "09.2026" [01.09.-15.09.]), ostale su
 * pune kalendarske mjesece. Koristi lokalno vrijeme servera (isto kao
 * ostatak date-aritmetike u ovom fajlu/repou - nema eksplicitnog TZ
 * rukovanja nigdje drugdje).
 */
function buildMonthBuckets(from: Date, to: Date): { from: Date; to: Date; label: string }[] {
  const buckets: { from: Date; to: Date; label: string }[] = [];
  let cursor = new Date(from.getFullYear(), from.getMonth(), 1);

  while (cursor <= to) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const bucketFrom = monthStart < from ? from : monthStart;
    const bucketTo = monthEnd > to ? to : monthEnd;
    const label = `${String(cursor.getMonth() + 1).padStart(2, "0")}.${cursor.getFullYear()}`;
    buckets.push({ from: bucketFrom, to: bucketTo, label });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return buckets;
}

/**
 * Isti brojevi kao getVehicleStats/getFleetStats, samo raspoređeni po
 * mjesecu unutar odabranog razdoblja - koristi ga graf na dashboardu.
 * `vehicleId: null` znači "sva vozila zajedno" (zbroj preko flote po
 * kanti), inače jedno konkretno vozilo. N kanti × M vozila upita je
 * prihvatljivo za malu flotu i tipičan dashboard raspon (isti "nema
 * paginacije" obrazac kao svugdje u appu).
 */
export async function getStatsTimeSeries(
  vehicleId: string | null,
  from: Date,
  to: Date
): Promise<StatsTimeSeriesPoint[]> {
  const buckets = buildMonthBuckets(from, to);

  return Promise.all(
    buckets.map(async (bucket) => {
      if (vehicleId) {
        const s = await getVehicleStats(vehicleId, bucket.from, bucket.to);
        return {
          label: bucket.label,
          from: bucket.from,
          to: bucket.to,
          revenue: s.revenue,
          serviceCost: s.serviceCost,
          additionalCosts: s.additionalCosts,
          profit: s.profit,
        };
      }

      const fleet = await getFleetStats(bucket.from, bucket.to);
      return {
        label: bucket.label,
        from: bucket.from,
        to: bucket.to,
        revenue: fleet.reduce((sum, v) => sum + v.revenue, 0),
        serviceCost: fleet.reduce((sum, v) => sum + v.serviceCost, 0),
        additionalCosts: fleet.reduce((sum, v) => sum + v.additionalCosts, 0),
        profit: fleet.reduce((sum, v) => sum + v.profit, 0),
      };
    })
  );
}
