// Hrvatska fiskalizacija - CIS (Porezna uprava) SOAP + XMLDSig.
//
// Portano iz FLEET projekta, pa uskladjeno s Tehničkom specifikacijom v2.7
// (21.07.2026). KLJUČNO: od 01.07.2026. testna okolina ODBIJA poruke
// potpisane RSA-SHA1 (greška s004). Zahtijeva se:
//   - SignatureMethod  http://www.w3.org/2001/04/xmldsig-more#rsa-sha256
//   - DigestMethod     http://www.w3.org/2001/04/xmlenc#sha256
//     (spec PDF u primjeru navodi xmldsig#... URI-jeve, ali CIS ih ODBIJA
//      sa s004 - prihvaća SAMO standardne W3C URI-jeve; potvrđeno live
//      testom protiv cistest-a 02.09.2026, JIR dobiven)
//   - CanonicalizationMethod  http://www.w3.org/2001/10/xml-exc-c14n#
//     (EXCLUSIVE c14n, obavezno - potpisani XML je unutar SOAP-a; spec 8.7.1)
//   - <Reference URI="#RacunZahtjev"> (Id = naziv root elementa)
//   - ZKI: prvi korak RSA-SHA256 (bio SHA1), MD5 hash tog potpisa ostaje
//     (spec pogl. 12)
//
// PROBNA FAZA: FINA_URL default je cistest okolina. Cert je FINA TESTNI cert.

import crypto from "node:crypto";
import forge from "node-forge";
import https from "node:https";
import { URL } from "node:url";
import { SignedXml } from "xml-crypto";
import { DOMParser } from "@xmldom/xmldom";

// Standardni W3C URI-jevi (xml-crypto ih zna nativno).
const SIG_METHOD_URI = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const DIGEST_METHOD_URI = "http://www.w3.org/2001/04/xmlenc#sha256";
const EXC_C14N_URI = "http://www.w3.org/2001/10/xml-exc-c14n#";
const ENVELOPED_URI = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

const FINA_URL =
  process.env.FINA_URL ?? "https://cistest.apis-it.hr:8449/FiskalizacijaService";

// f73 shema namespace (RacunZahtjev + PoslovniProstorZahtjev).
const TNS = "http://www.apis-it.hr/fin/2012/types/f73";

// ─── Pomoćne funkcije ────────────────────────────────────────────────────────

function formatIznos(iznos: number): string {
  return iznos.toFixed(2);
}

// CIS koristi hrvatsku lokalnu zonu (Europe/Zagreb = CEST/CET).
function hrParts(d: Date) {
  const parts = new Intl.DateTimeFormat("hr-HR", {
    timeZone: "Europe/Zagreb",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  return (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
}

function formatDatum(d: Date): string {
  const g = hrParts(d);
  return `${g("day")}.${g("month")}.${g("year")} ${g("hour")}:${g("minute")}:${g("second")}`;
}

function formatDatumXML(d: Date): string {
  const g = hrParts(d);
  return `${g("day")}.${g("month")}.${g("year")}T${g("hour")}:${g("minute")}:${g("second")}`;
}

function formatDatumOnly(d: Date): string {
  const g = hrParts(d);
  return `${g("day")}.${g("month")}.${g("year")}`;
}

function generirajUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Zero-width / BOM / word-joiner codepointi koji se u potpunosti uklanjaju.
const ZERO_WIDTH = new Set([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);
// Egzotični razmaci (NBSP, U+2000..U+200A, narrow/med math space, ideographic)
// koji se normaliziraju u obični space.
const EXOTIC_SPACE = new Set([
  0x00a0, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a, 0x202f, 0x205f, 0x3000,
]);

// Uklanja BOM/zero-width znakove, normalizira egzotične razmake i trima rub.
// Obrambena higijena za tekstualna polja iz forme / env / paste-a
// (dokumentiran uzrok CIS s004 kad polje ima nevidljivi trailing znak).
function sanitizeField(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (ZERO_WIDTH.has(cp)) continue;
    out += EXOTIC_SPACE.has(cp) ? " " : ch;
  }
  return out.trim();
}

// ─── Cert ────────────────────────────────────────────────────────────────────

export interface FiscalCert {
  certBase64: string; // .p12/.pfx, base64
  certPassword: string;
  oib: string; // OIB na koji je cert registriran
  oznPP: string; // oznaka poslovnog prostora
  oznNU: string; // oznaka naplatnog uređaja
}

interface LoadedCert {
  privateKeyPem: string;
  certPem: string;
  certDerB64: string;
  cnSubject: string | undefined;
}

// Sanitizacija FiscalCert-a - OIB/oznPP/oznNU ulaze u ZKI i XML, cert base64
// može doći iz paste-a s prijelomom retka. Zaporka se NE dira.
export function normalizeCert(cert: FiscalCert): FiscalCert {
  return {
    certBase64: cert.certBase64.replace(/\s+/g, ""),
    certPassword: cert.certPassword,
    oib: sanitizeField(cert.oib),
    oznPP: sanitizeField(cert.oznPP),
    oznNU: sanitizeField(cert.oznNU),
  };
}

function loadCert(rawCert: FiscalCert): LoadedCert {
  const cert = normalizeCert(rawCert);
  const pfxBytes = forge.util.decode64(cert.certBase64);
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBytes));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, cert.certPassword);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

  if (!keyBag?.key) throw new Error("Nije moguće učitati privatni ključ iz PFX (kriva zaporka?)");

  // Leaf cert koji dijeli localKeyId s privatnim ključem.
  const keyId = (keyBag.attributes as Record<string, unknown[]>)?.localKeyId?.[0];
  const certBagsList = certBags[forge.pki.oids.certBag] ?? [];
  const certBag = keyId
    ? certBagsList.find(
        (b) => (b.attributes as Record<string, unknown[]>)?.localKeyId?.[0] === keyId
      ) ?? certBagsList[0]
    : certBagsList[0];

  if (!certBag?.cert) throw new Error("Nije moguće učitati certifikat iz PFX");

  const privateKey = keyBag.key as forge.pki.rsa.PrivateKey;
  const x509 = certBag.cert;

  return {
    privateKeyPem: forge.pki.privateKeyToPem(privateKey),
    certPem: forge.pki.certificateToPem(x509),
    certDerB64: forge.util
      .encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(x509)).bytes())
      .replace(/\s+/g, ""),
    cnSubject: x509.subject.getField("CN")?.value,
  };
}

// ─── ZKI ─────────────────────────────────────────────────────────────────────

export function izracunajZKI(params: {
  oib: string;
  datum: Date;
  brOznRac: string;
  oznPP: string;
  oznNU: string;
  ukupniIznos: number;
  privateKeyPem: string;
}): string {
  // Spec v2.7 pogl. 12: medjurezultat = oib + datVrij('dd.MM.yyyy HH:mm:ss')
  // + brOznRac + oznPP + oznNU + ukupniIznos (točka kao decimalni separator).
  const data = `${params.oib}${formatDatum(params.datum)}${params.brOznRac}${params.oznPP}${params.oznNU}${formatIznos(params.ukupniIznos)}`;

  // Od v2.7: RSA-SHA256 potpis medjurezultata (bilo RSA-SHA1), pa MD5 tog
  // potpisa u hex (MD5 korak nepromijenjen).
  const signatureB64 = crypto.createSign("RSA-SHA256").update(data, "utf8").sign(params.privateKeyPem, "base64");
  return crypto.createHash("md5").update(Buffer.from(signatureB64, "base64")).digest("hex");
}

// ─── XML generacija ──────────────────────────────────────────────────────────

const NACIN_PLAC_MAP: Record<string, string> = {
  gotovina: "G",
  kesh: "G",
  cash: "G",
  kartica: "K",
  card: "K",
  ček: "C",
  cek: "C",
  transakcijski: "T",
  "transakcijski račun": "T",
  transfer: "T",
  ostalo: "O",
};

export function nacinPlacanjaCIS(nacin: string): string {
  return NACIN_PLAC_MAP[nacin.trim().toLowerCase()] ?? "O";
}

export interface PdvStavka {
  stopa: number; // npr. 25
  osnovica: number;
  iznos: number;
}

function generirajRacunXML(params: {
  msgId: string;
  datumVrijeme: Date;
  oib: string;
  uSustavuPdv: boolean;
  oznPP: string;
  oznNU: string;
  brOznRac: string;
  datumRacuna: Date;
  ukupniIznos: number;
  pdv: PdvStavka | null; // null kad nije u sustavu PDV-a
  nacinPlacanjaCode: string; // G/K/C/T/O
  zki: string;
}): string {
  const lines: string[] = [
    // Id = naziv root elementa (spec preporuka), referencira se iz <Reference URI="#RacunZahtjev">
    `<tns:RacunZahtjev xmlns:tns="${TNS}" Id="RacunZahtjev">`,
    `  <tns:Zaglavlje>`,
    `    <tns:IdPoruke>${params.msgId}</tns:IdPoruke>`,
    `    <tns:DatumVrijeme>${formatDatumXML(params.datumVrijeme)}</tns:DatumVrijeme>`,
    `  </tns:Zaglavlje>`,
    `  <tns:Racun>`,
    `    <tns:Oib>${params.oib}</tns:Oib>`,
    `    <tns:USustPdv>${params.uSustavuPdv ? "true" : "false"}</tns:USustPdv>`,
    `    <tns:DatVrijeme>${formatDatumXML(params.datumRacuna)}</tns:DatVrijeme>`,
    `    <tns:OznSlijed>N</tns:OznSlijed>`,
    `    <tns:BrRac>`,
    `      <tns:BrOznRac>${params.brOznRac}</tns:BrOznRac>`,
    `      <tns:OznPosPr>${params.oznPP}</tns:OznPosPr>`,
    `      <tns:OznNapUr>${params.oznNU}</tns:OznNapUr>`,
    `    </tns:BrRac>`,
  ];

  if (params.pdv) {
    lines.push(
      `    <tns:Pdv>`,
      `      <tns:Porez>`,
      `        <tns:Stopa>${formatIznos(params.pdv.stopa)}</tns:Stopa>`,
      `        <tns:Osnovica>${formatIznos(params.pdv.osnovica)}</tns:Osnovica>`,
      `        <tns:Iznos>${formatIznos(params.pdv.iznos)}</tns:Iznos>`,
      `      </tns:Porez>`,
      `    </tns:Pdv>`
    );
  } else {
    // Mali porezni obveznik - cijeli iznos je oslobođen PDV-a.
    lines.push(`    <tns:IznosOslobPdv>${formatIznos(params.ukupniIznos)}</tns:IznosOslobPdv>`);
  }

  lines.push(
    `    <tns:IznosUkupno>${formatIznos(params.ukupniIznos)}</tns:IznosUkupno>`,
    `    <tns:NacinPlac>${params.nacinPlacanjaCode}</tns:NacinPlac>`,
    `    <tns:OibOper>${params.oib}</tns:OibOper>`,
    `    <tns:ZastKod>${params.zki}</tns:ZastKod>`,
    `    <tns:NakDost>false</tns:NakDost>`,
    `  </tns:Racun>`,
    `</tns:RacunZahtjev>`
  );

  return lines.join("\n");
}

export interface BusinessPremiseData {
  oib: string;
  oznPP: string;
  street: string;
  houseNumber: string;
  city: string;
  postalCode: string;
  workHours: string;
  startDate: Date; // datum početka primjene
}

function generirajPoslovniProstorXML(params: {
  msgId: string;
  datumVrijeme: Date;
  premise: BusinessPremiseData;
}): string {
  const p = params.premise;
  return [
    `<tns:PoslovniProstorZahtjev xmlns:tns="${TNS}" Id="PoslovniProstorZahtjev">`,
    `  <tns:Zaglavlje>`,
    `    <tns:IdPoruke>${params.msgId}</tns:IdPoruke>`,
    `    <tns:DatumVrijeme>${formatDatumXML(params.datumVrijeme)}</tns:DatumVrijeme>`,
    `  </tns:Zaglavlje>`,
    `  <tns:PoslovniProstor>`,
    `    <tns:Oib>${p.oib}</tns:Oib>`,
    `    <tns:OznPoslProstora>${p.oznPP}</tns:OznPoslProstora>`,
    `    <tns:AdresniPodatak>`,
    `      <tns:Adresa>`,
    `        <tns:Ulica>${escapeXml(p.street)}</tns:Ulica>`,
    `        <tns:KucniBroj>${escapeXml(p.houseNumber)}</tns:KucniBroj>`,
    `        <tns:Naselje>${escapeXml(p.city)}</tns:Naselje>`,
    `        <tns:PostBr>${escapeXml(p.postalCode)}</tns:PostBr>`,
    `      </tns:Adresa>`,
    `    </tns:AdresniPodatak>`,
    `    <tns:RadnoVrijeme>${escapeXml(p.workHours)}</tns:RadnoVrijeme>`,
    `    <tns:DatumPocetkaPrimjene>${formatDatumOnly(p.startDate)}</tns:DatumPocetkaPrimjene>`,
    `  </tns:PoslovniProstor>`,
    `</tns:PoslovniProstorZahtjev>`,
  ].join("\n");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── SOAP omotač + XMLDSig ───────────────────────────────────────────────────

function omotajUSOAP(xml: string): string {
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">`,
    `<soapenv:Body>`,
    xml,
    `</soapenv:Body>`,
    `</soapenv:Envelope>`,
  ].join("\n");
}

// Potpisuje root element zahtjeva UNUTAR SOAP konteksta. Exclusive c14n
// (spec pogl. 8.7.1) serijalizira potpisani element neovisno o okružujućem
// SOAP-u, pa je potpis ispravan iako se radi unutar Envelope-a.
// `rootId` = vrijednost Id atributa na root elementu ("RacunZahtjev" /
// "PoslovniProstorZahtjev").
function potpisSOAP(
  soapXml: string,
  privateKeyPem: string,
  certDerB64: string,
  rootId: string
): string {
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    canonicalizationAlgorithm: EXC_C14N_URI,
    signatureAlgorithm: SIG_METHOD_URI,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  (sig as unknown as { idAttributes: string[] }).idAttributes = ["Id"];

  // Spec primjer: <Signature> bez prefiksa (default xmldsig namespace),
  // <X509Data>/<X509Certificate> također bez prefiksa.
  sig.getKeyInfoContent = () =>
    `<X509Data><X509Certificate>${certDerB64}</X509Certificate></X509Data>`;

  sig.addReference({
    xpath: `//*[@Id="${rootId}"]`,
    transforms: [ENVELOPED_URI, EXC_C14N_URI],
    digestAlgorithm: DIGEST_METHOD_URI,
  });

  sig.computeSignature(soapXml, {
    location: { reference: `//*[@Id="${rootId}"]`, action: "append" },
  });

  return sig.getSignedXml();
}

function verifikacijaXmlDSig(signedSoapXml: string, certPem: string): boolean {
  try {
    const doc = new DOMParser().parseFromString(signedSoapXml, "application/xml");
    const ns = "http://www.w3.org/2000/09/xmldsig#";
    const sigNodes = doc.getElementsByTagNameNS(ns, "Signature");
    if (!sigNodes || sigNodes.length === 0) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const verify = new SignedXml({ publicCert: certPem } as any);
    (verify as unknown as { idAttributes: string[] }).idAttributes = ["Id"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    verify.loadSignature(sigNodes[0] as any);
    return verify.checkSignature(signedSoapXml);
  } catch {
    return false;
  }
}

// ─── HTTPS slanje ────────────────────────────────────────────────────────────

async function posaljiSOAP(soapBody: string, privateKeyPem: string, certPem: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(FINA_URL);
    const body = Buffer.from(soapBody, "utf8");
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parseInt(parsedUrl.port) || 8449,
      path: parsedUrl.pathname,
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        SOAPAction: '""',
        "Content-Length": body.length,
      },
      key: privateKeyPem,
      cert: certPem,
      // cistest koristi self-signed / FINA demo CA lanac; ne validiramo peer.
      // Za PRODUKCIJU treba pinati apis-it CA.
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(20_000, () => req.destroy(new Error("CIS timeout (20s)")));
    req.write(body);
    req.end();
  });
}

// ─── Parsiranje odgovora ─────────────────────────────────────────────────────

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function izvuciJIR(response: string): string | null {
  const match = response.match(/<(?:[^:>]+:)?Jir>([^<]+)<\/(?:[^:>]+:)?Jir>/);
  return match?.[1]?.trim() ?? null;
}

function izvuciGresku(response: string): string | null {
  const poruka = response.match(
    /<(?:[^:>]+:)?PorukaGreske>([^<]+)<\/(?:[^:>]+:)?PorukaGreske>/
  );
  const sifra = response.match(
    /<(?:[^:>]+:)?SifraGreske>([^<]+)<\/(?:[^:>]+:)?SifraGreske>/
  );
  if (poruka) {
    const msg = decodeXmlEntities(poruka[1]);
    return sifra ? `[${sifra[1]}] ${msg}` : msg;
  }
  const fault = response.match(
    /<(?:[^:>]+:)?faultstring>([^<]+)<\/(?:[^:>]+:)?faultstring>/
  );
  return fault?.[1]?.trim() ?? null;
}

// ─── Javni API ───────────────────────────────────────────────────────────────

export interface FiscalizeRacunInput {
  cert: FiscalCert;
  brOznRac: string;
  datumRacuna: Date;
  uSustavuPdv: boolean;
  ukupniIznos: number;
  pdv: PdvStavka | null;
  nacinPlacanjaCode: string;
}

export interface FiscalizeRacunResult {
  jir: string;
  zki: string;
}

/**
 * Izračuna ZKI bez slanja išta CIS-u. ZKI se mora znati PRIJE nego se broj
 * računa "potroši" (Invoice red se kreira sa ZKI-jem i zadrži broj čak i ako
 * fiskalizacija padne - bez rupa u nizu).
 */
export function computeZki(
  rawCert: FiscalCert,
  params: { brOznRac: string; datumRacuna: Date; ukupniIznos: number }
): string {
  const cert = normalizeCert(rawCert);
  const { privateKeyPem } = loadCert(cert);
  return izracunajZKI({
    oib: cert.oib,
    datum: params.datumRacuna,
    brOznRac: sanitizeField(params.brOznRac),
    oznPP: cert.oznPP,
    oznNU: cert.oznNU,
    ukupniIznos: params.ukupniIznos,
    privateKeyPem,
  });
}

/** Fiskalizira jedan račun kod CIS-a. Baca Error s CIS porukom ako padne. */
export async function fiscalizeRacun(
  input: FiscalizeRacunInput & { zki?: string }
): Promise<FiscalizeRacunResult> {
  const cert = normalizeCert(input.cert);
  const { privateKeyPem, certPem, certDerB64 } = loadCert(cert);

  const brOznRac = sanitizeField(input.brOznRac);
  const zki =
    input.zki ??
    izracunajZKI({
      oib: cert.oib,
      datum: input.datumRacuna,
      brOznRac,
      oznPP: cert.oznPP,
      oznNU: cert.oznNU,
      ukupniIznos: input.ukupniIznos,
      privateKeyPem,
    });

  const xml = generirajRacunXML({
    msgId: generirajUUID(),
    datumVrijeme: new Date(),
    oib: cert.oib,
    uSustavuPdv: input.uSustavuPdv,
    oznPP: cert.oznPP,
    oznNU: cert.oznNU,
    brOznRac,
    datumRacuna: input.datumRacuna,
    ukupniIznos: input.ukupniIznos,
    pdv: input.pdv,
    nacinPlacanjaCode: sanitizeField(input.nacinPlacanjaCode),
    zki,
  });

  const soapPotpisan = potpisSOAP(omotajUSOAP(xml), privateKeyPem, certDerB64, "RacunZahtjev");
  if (!verifikacijaXmlDSig(soapPotpisan, certPem)) {
    console.warn("[Fisk] lokalna XMLDSig verifikacija nije prošla - šaljem svejedno");
  }

  const response = await posaljiSOAP(soapPotpisan, privateKeyPem, certPem);

  const greska = izvuciGresku(response);
  if (greska) throw new Error(`CIS greška: ${greska}`);

  const jir = izvuciJIR(response);
  if (!jir) throw new Error("JIR nije pronađen u odgovoru CIS-a");

  return { jir, zki };
}

/**
 * Registrira poslovni prostor kod CIS-a (PoslovniProstorZahtjev) - zakonski
 * preduvjet prije fiskalizacije prvog računa iz tog prostora. Uspjeh = CIS
 * odgovor bez PorukaGreske (nema JIR-a za ovaj zahtjev).
 */
export async function registerBusinessPremise(params: {
  cert: FiscalCert;
  premise: BusinessPremiseData;
}): Promise<void> {
  const cert = normalizeCert(params.cert);
  const { privateKeyPem, certPem, certDerB64 } = loadCert(cert);

  const premise: BusinessPremiseData = {
    oib: cert.oib,
    oznPP: cert.oznPP,
    street: sanitizeField(params.premise.street),
    houseNumber: sanitizeField(params.premise.houseNumber),
    city: sanitizeField(params.premise.city),
    postalCode: sanitizeField(params.premise.postalCode),
    workHours: sanitizeField(params.premise.workHours),
    startDate: params.premise.startDate,
  };

  const xml = generirajPoslovniProstorXML({
    msgId: generirajUUID(),
    datumVrijeme: new Date(),
    premise,
  });

  const soapPotpisan = potpisSOAP(omotajUSOAP(xml), privateKeyPem, certDerB64, "PoslovniProstorZahtjev");
  const response = await posaljiSOAP(soapPotpisan, privateKeyPem, certPem);

  const greska = izvuciGresku(response);
  if (greska) throw new Error(`CIS greška (poslovni prostor): ${greska}`);
}
