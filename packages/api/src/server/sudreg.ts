// Pretraga poslovnog subjekta po OIB-u preko Sudskog registra
// (sudreg-data.gov.hr open-data API). Portano iz FLEET projekta
// (backend/src/routes/sudreg.ts) - isti OAuth2 client-credentials tok i isto
// parsiranje `detalji_subjekta` odgovora (data.tvrtka.ime + data.sjediste.*).
//
// API zahtijeva registraciju na https://sudreg-data.gov.hr i client
// credentials. Bez postavljenih env varijabli (ili ako je API nedostupan)
// vraća se `status: "nedostupan"` i forma pada na ručni unos - lookup nikad
// ne smije blokirati kreiranje klijenta.
//
// Env:
//   SUDREG_CLIENT_ID, SUDREG_CLIENT_SECRET  - obavezni za lookup
//   SUDREG_TOKEN_URL   (default https://sudreg-data.gov.hr/api/oauth/token)
//   SUDREG_API_BASE    (default https://sudreg-data.gov.hr/api/javni)

export type SudregStatus = "pronadjen" | "nedostupan" | "neispravan_oib";

export interface SudregLookupResult {
  status: SudregStatus;
  naziv: string | null;
  adresa: string | null;
}

// MOD 11,10 kontrolna znamenka (ISO 7064) - isti algoritam kao validirajOIB u
// FLEET-u i kao oibSchema regexu nadopunjena provjera.
export function isValidOib(oib: string): boolean {
  if (!/^\d{11}$/.test(oib)) return false;
  let iso = 10;
  for (let i = 0; i < 10; i++) {
    iso += Number(oib[i]);
    iso %= 10;
    if (iso === 0) iso = 10;
    iso = (iso * 2) % 11;
  }
  const control = 11 - iso === 10 ? 0 : 11 - iso;
  return control === Number(oib[10]);
}

const TOKEN_URL = process.env.SUDREG_TOKEN_URL ?? "https://sudreg-data.gov.hr/api/oauth/token";
const API_BASE = process.env.SUDREG_API_BASE ?? "https://sudreg-data.gov.hr/api/javni";

// Token vrijedi ~1h; keširaj ga da ne radimo OAuth round-trip na svaki lookup.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(10_000),
  });

  const body = await resp.text();
  let data: { access_token?: string; expires_in?: number } = {};
  try {
    data = JSON.parse(body);
  } catch {
    data = {};
  }

  if (!resp.ok || !data.access_token) {
    console.warn("[Sudreg] token HTTP %s: %s", resp.status, body.slice(0, 200));
    return null;
  }

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

function formatSjediste(s: Record<string, string> | null | undefined): string | null {
  if (!s) return null;
  const line1 = s.ulica && s.kucni_broj ? `${s.ulica} ${s.kucni_broj}` : s.ulica;
  const line2 =
    s.postanski_broj && s.naziv_naselja
      ? `${s.postanski_broj} ${s.naziv_naselja}`
      : s.naziv_naselja;
  const joined = [line1, line2].filter(Boolean).join(", ");
  return joined || null;
}

export async function lookupCompanyByOib(oib: string): Promise<SudregLookupResult> {
  if (!isValidOib(oib)) {
    return { status: "neispravan_oib", naziv: null, adresa: null };
  }

  const clientId = process.env.SUDREG_CLIENT_ID;
  const clientSecret = process.env.SUDREG_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.warn("[Sudreg] SUDREG_CLIENT_ID/SECRET nisu postavljeni - lookup preskočen");
    return { status: "nedostupan", naziv: null, adresa: null };
  }

  try {
    const token = await getAccessToken(clientId, clientSecret);
    if (!token) return { status: "nedostupan", naziv: null, adresa: null };

    const url = `${API_BASE}/detalji_subjekta?tip_identifikatora=oib&identifikator=${oib}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    const body = await resp.text();
    if (!resp.ok) {
      // Subjekt nije u sudskom registru (npr. obrt, udruga, nepostojeći OIB):
      // API vraća HTTP 400 s error_code 505 ("Vaš zahtjev nije vratio ni jedan
      // redak"). To NIJE greška - tretiramo kao "nema podataka", forma dopušta
      // ručni unos. Sve ostalo je stvaran problem (auth, 5xx) - warn.
      let errorCode: number | undefined;
      try {
        errorCode = JSON.parse(body)?.error_code;
      } catch {
        /* ostavi undefined */
      }
      if (errorCode !== 505) {
        console.warn("[Sudreg] detalji_subjekta HTTP %s: %s", resp.status, body.slice(0, 200));
      }
      return { status: "nedostupan", naziv: null, adresa: null };
    }

    let data: {
      tvrtka?: { ime?: string };
      skracena_tvrtka?: { ime?: string };
      sjediste?: Record<string, string>;
    };
    try {
      data = JSON.parse(body);
    } catch {
      return { status: "nedostupan", naziv: null, adresa: null };
    }

    const naziv = data?.tvrtka?.ime ?? data?.skracena_tvrtka?.ime ?? null;
    const adresa = formatSjediste(data?.sjediste);

    return {
      status: naziv ? "pronadjen" : "nedostupan",
      naziv,
      adresa,
    };
  } catch (err) {
    console.warn("[Sudreg] lookup greška:", String(err));
    return { status: "nedostupan", naziv: null, adresa: null };
  }
}
