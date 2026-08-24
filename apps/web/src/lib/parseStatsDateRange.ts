/**
 * Zajednička parsing logika za `?from=&to=` query parametre na oba stats
 * endpointa (pojedino vozilo + cijela flota) - isto pravilo default
 * razdoblja i validacije na oba mjesta, pa je vrijedno dijeliti umjesto
 * duplicirati u dvije route datoteke.
 */
export function parseStatsDateRange(url: URL): { from: Date; to: Date } | null {
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const to = toParam ? new Date(toParam) : new Date();
  // Default: zadnjih 30 dana UKLJUČUJUĆI danas (danas - 29 dana).
  const defaultFrom = new Date(to);
  defaultFrom.setDate(defaultFrom.getDate() - 29);
  const from = fromParam ? new Date(fromParam) : defaultFrom;

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (from.getTime() > to.getTime()) return null;

  return { from, to };
}
