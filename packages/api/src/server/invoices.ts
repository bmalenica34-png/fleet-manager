import type { Invoice, InvoiceType } from "@prisma/client";
import { prisma } from "../db/client";
import { buildObjectKey, getPresignedDownloadUrl, uploadObject } from "../storage/hetzner";
import { getCompanyInfoForPdf } from "./companySettings";
import { renderInvoicePdf } from "../pdf/generate";
import { sendInvoiceEmail } from "../lib/email";
import {
  computeZki,
  fiscalizeRacun,
  nacinPlacanjaCIS,
  prewarmCert,
  registerBusinessPremise,
  type FiscalCert,
  type PdvStavka,
} from "./fiscalization/engine";
import { formatDateHr } from "../lib/dateFormat";

const VAT_RATE = 25;

// ── Cert / postavke ─────────────────────────────────────────────────────────

interface FiscalConfig {
  cert: FiscalCert;
  vatRegistered: boolean;
  premiseRegisteredAt: Date | null;
}

async function loadFiscalConfig(): Promise<FiscalConfig> {
  const s = await prisma.companySettings.findUnique({ where: { id: "singleton" } });
  if (!s) throw new Error("CompanySettings ne postoji");
  if (!s.finaCertBase64 || !s.finaOib) {
    throw new Error(
      "Fiskalizacija nije konfigurirana - dodaj FINA certifikat i OIB u Postavke → Fiskalizacija."
    );
  }
  return {
    cert: {
      certBase64: s.finaCertBase64,
      certPassword: s.finaCertPassword ?? "",
      oib: s.finaOib,
      oznPP: s.finaPremiseLabel ?? "1",
      oznNU: s.finaDeviceLabel ?? "1",
    },
    vatRegistered: s.vatRegistered,
    premiseRegisteredAt: s.finaPremiseRegisteredAt,
  };
}

// ── Poslovni prostor ────────────────────────────────────────────────────────

export async function registerFiscalPremise(): Promise<void> {
  const s = await prisma.companySettings.findUnique({ where: { id: "singleton" } });
  if (!s) throw new Error("CompanySettings ne postoji");
  if (!s.finaCertBase64 || !s.finaOib) {
    throw new Error("Dodaj FINA certifikat i OIB prije registracije poslovnog prostora.");
  }
  if (!s.finaPremiseStreet || !s.finaPremiseHouseNumber || !s.finaPremiseCity || !s.finaPremisePostalCode) {
    throw new Error("Ispuni adresu poslovnog prostora (ulica, kućni broj, naselje, poštanski broj).");
  }

  const cert: FiscalCert = {
    certBase64: s.finaCertBase64,
    certPassword: s.finaCertPassword ?? "",
    oib: s.finaOib,
    oznPP: s.finaPremiseLabel ?? "1",
    oznNU: s.finaDeviceLabel ?? "1",
  };

  await registerBusinessPremise({
    cert,
    premise: {
      oib: s.finaOib,
      oznPP: cert.oznPP,
      street: s.finaPremiseStreet,
      houseNumber: s.finaPremiseHouseNumber,
      city: s.finaPremiseCity,
      postalCode: s.finaPremisePostalCode,
      workHours: s.finaPremiseWorkHours ?? "Pon-Pet 08:00-16:00",
      startDate: s.finaPremiseRegisteredAt ?? new Date(),
    },
  });

  await prisma.companySettings.update({
    where: { id: "singleton" },
    data: { finaPremiseRegisteredAt: new Date() },
  });
}

// ── Iznosi ──────────────────────────────────────────────────────────────────

function splitAmount(total: number, vatRegistered: boolean): {
  net: number;
  vat: number;
  rate: number;
  pdv: PdvStavka | null;
} {
  if (!vatRegistered) {
    return { net: round2(total), vat: 0, rate: 0, pdv: null };
  }
  const net = round2(total / (1 + VAT_RATE / 100));
  const vat = round2(total - net);
  return {
    net,
    vat,
    rate: VAT_RATE,
    pdv: { stopa: VAT_RATE, osnovica: net, iznos: vat },
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function zagrebYear(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("hr-HR", { timeZone: "Europe/Zagreb", year: "numeric" }).format(d)
  );
}

// ── DTO ─────────────────────────────────────────────────────────────────────

export interface InvoiceDTO {
  id: string;
  number: string; // "12/1/1"
  year: number;
  type: InvoiceType;
  status: Invoice["status"];
  issuedAt: Date;
  invoiceDateTime: Date;
  recipientName: string;
  recipientOib: string | null;
  contractNumber: number | null;
  vehicleLabel: string | null;
  totalAmount: number;
  netAmount: number;
  vatAmount: number;
  vatRate: number;
  jir: string | null;
  zki: string;
  errorMessage: string | null;
  hasPdf: boolean;
}

type InvoiceRow = Invoice & {
  contract: { number: number; vehicle: { make: string; model: string; licensePlate: string } } | null;
};

function toInvoiceDTO(row: InvoiceRow): InvoiceDTO {
  return {
    id: row.id,
    number: `${row.brOznRac}/${row.oznPosPr}/${row.oznNapUr}`,
    year: row.year,
    type: row.type,
    status: row.status,
    issuedAt: row.issuedAt,
    invoiceDateTime: row.invoiceDateTime,
    recipientName: row.recipientName,
    recipientOib: row.recipientOib,
    contractNumber: row.contract?.number ?? null,
    vehicleLabel: row.contract
      ? `${row.contract.vehicle.make} ${row.contract.vehicle.model} (${row.contract.vehicle.licensePlate})`
      : null,
    totalAmount: row.totalAmount,
    netAmount: row.netAmount,
    vatAmount: row.vatAmount,
    vatRate: row.vatRate,
    jir: row.jir,
    zki: row.zki,
    errorMessage: row.errorMessage,
    hasPdf: row.pdfKey != null,
  };
}

export async function listInvoices(): Promise<InvoiceDTO[]> {
  const rows = await prisma.invoice.findMany({
    orderBy: [{ year: "desc" }, { brOznRac: "desc" }],
    include: { contract: { include: { vehicle: true } } },
  });
  return rows.map(toInvoiceDTO);
}

export async function getInvoicePdfUrl(id: string): Promise<string | null> {
  const row = await prisma.invoice.findUnique({ where: { id } });
  if (!row?.pdfKey) return null;
  return getPresignedDownloadUrl(row.pdfKey, 3600);
}

// ── Izdavanje računa za RentPayment ─────────────────────────────────────────

export class InvoiceError extends Error {}

/**
 * Izdaje (i fiskalizira) račun za jedan RentPayment period. Poziva se iz
 * "Najmovi" toka kad owner klikne "Plaćeno" → "Izdati račun? Da".
 *
 * Broj računa se dodijeli u transakciji (max+1 po godini/prostoru/uređaju,
 * BEZ RUPA) i Invoice red se kreira PRIJE mrežnog poziva CIS-u. Ako
 * fiskalizacija padne, red ostaje sa `status: failed` + `errorMessage`,
 * broj je zadržan, retry ide na ISTI broj (retryInvoiceFiscalization).
 */
export async function issueInvoiceForRentPayment(rentPaymentId: string): Promise<InvoiceDTO> {
  const existing = await prisma.invoice.findUnique({
    where: { rentPaymentId },
    include: { contract: { include: { vehicle: true } } },
  });
  if (existing) {
    // Već postoji - ako je fiskaliziran, samo ga vrati; ako je failed, retry.
    if (existing.status === "fiscalized") return toInvoiceDTO(existing);
    return retryInvoiceFiscalization(existing.id);
  }

  const rp = await prisma.rentPayment.findUnique({
    where: { id: rentPaymentId },
    include: { contract: { include: { vehicle: true, client: true } } },
  });
  if (!rp) throw new InvoiceError("Period naplate ne postoji");

  const config = await loadFiscalConfig();
  // NB: NE tražimo prethodnu registraciju poslovnog prostora/radnog vremena.
  // Verificirano protiv cistest-a: RacunZahtjev prolazi i vraća JIR bez toga.
  // (v2.7 model za radno vrijeme = `PrijaviRadnoVrijemeZahtjev`, zasebna
  // buduća funkcionalnost - vidi registerBusinessPremise komentar u engine.)

  // PKCS12 dešifriranje je ~5s - pred-učitaj cert PRIJE transakcije (unutar
  // koje se računa ZKI), inače Prisma 5s interactive-tx timeout pukne.
  prewarmCert(config.cert);

  const client = rp.contract.client;
  const type: InvoiceType = client.type === "pravna" ? "R1" : "R2";
  const now = new Date();
  const year = zagrebYear(now);
  const { net, vat, rate } = splitAmount(rp.amount, config.vatRegistered);
  const paymentCode = nacinPlacanjaCIS(rp.contract.paymentMethod ?? "transakcijski");

  const recipientName =
    type === "R1" && client.companyName
      ? client.companyName
      : `${client.firstName} ${client.lastName}`;
  const recipientOib = client.oib;
  const recipientAddress =
    type === "R1" ? client.companyAddress ?? client.address : client.address;

  // 1) Dodijeli broj + kreiraj red (transakcija, serializable radi utrke).
  const invoice = await prisma.$transaction(
    async (tx) => {
      const last = await tx.invoice.aggregate({
        _max: { brOznRac: true },
        where: { year, oznPosPr: config.cert.oznPP, oznNapUr: config.cert.oznNU },
      });
      const brOznRac = (last._max.brOznRac ?? 0) + 1;

      const zki = computeZki(config.cert, {
        brOznRac: String(brOznRac),
        datumRacuna: now,
        ukupniIznos: rp.amount,
      });

      return tx.invoice.create({
        data: {
          year,
          brOznRac,
          oznPosPr: config.cert.oznPP,
          oznNapUr: config.cert.oznNU,
          type,
          status: "failed", // postaje "fiscalized" tek kad JIR stigne
          rentPaymentId: rp.id,
          contractId: rp.contractId,
          clientId: client.id,
          invoiceDateTime: now,
          totalAmount: round2(rp.amount),
          netAmount: net,
          vatAmount: vat,
          vatRate: rate,
          paymentMethod: paymentCode,
          oibIssuer: config.cert.oib,
          zki,
          recipientName,
          recipientOib,
          recipientAddress,
        },
      });
    },
    { isolationLevel: "Serializable", timeout: 15_000 }
  );

  return finalizeInvoice(invoice.id);
}

/** Ponovni pokušaj fiskalizacije za `failed` račun - ISTI broj, ISTI ZKI. */
export async function retryInvoiceFiscalization(invoiceId: string): Promise<InvoiceDTO> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw new InvoiceError("Račun ne postoji");
  if (inv.status === "fiscalized") {
    return (await getInvoiceDTO(invoiceId))!;
  }
  return finalizeInvoice(invoiceId);
}

async function getInvoiceDTO(id: string): Promise<InvoiceDTO | null> {
  const row = await prisma.invoice.findUnique({
    where: { id },
    include: { contract: { include: { vehicle: true } } },
  });
  return row ? toInvoiceDTO(row) : null;
}

/** Fiskalizira (CIS), pa generira PDF + šalje mail. Idempotentno-ish. */
async function finalizeInvoice(invoiceId: string): Promise<InvoiceDTO> {
  const inv = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      contract: { include: { vehicle: true, client: true } },
    },
  });
  const config = await loadFiscalConfig();

  const pdvSplit = splitAmount(inv.totalAmount, config.vatRegistered);

  // 1) CIS
  let jir = inv.jir;
  if (!jir) {
    try {
      const res = await fiscalizeRacun({
        cert: config.cert,
        brOznRac: String(inv.brOznRac),
        datumRacuna: inv.invoiceDateTime,
        uSustavuPdv: config.vatRegistered,
        ukupniIznos: inv.totalAmount,
        pdv: pdvSplit.pdv,
        nacinPlacanjaCode: inv.paymentMethod,
        zki: inv.zki,
      });
      jir = res.jir;
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { jir, status: "fiscalized", fiscalizedAt: new Date(), errorMessage: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { status: "failed", errorMessage: message },
      });
      throw new InvoiceError(`Fiskalizacija nije uspjela: ${message}`);
    }
  }

  // 2) PDF + mail (ne ruši fiskalizirani status ako ovdje nešto pukne)
  try {
    await generateAndSendInvoicePdf(inv.id);
  } catch (err) {
    console.error("[Invoice] PDF/mail nije uspio:", err);
  }

  return (await getInvoiceDTO(inv.id))!;
}

async function generateAndSendInvoicePdf(invoiceId: string): Promise<void> {
  const inv = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { contract: { include: { vehicle: true, client: true } } },
  });
  if (!inv.jir) return;

  const company = await getCompanyInfoForPdf();
  const c = inv.contract;

  const lineItem = c
    ? `Najam vozila ${c.vehicle.make} ${c.vehicle.model} (${c.vehicle.licensePlate})`
    : "Najam vozila";
  const period = await periodLabelForInvoice(inv.id);

  const pdf = await renderInvoicePdf({
    invoice: {
      number: `${inv.brOznRac}/${inv.oznPosPr}/${inv.oznNapUr}`,
      type: inv.type,
      issuedAt: inv.issuedAt,
      invoiceDateTime: inv.invoiceDateTime,
      totalAmount: inv.totalAmount,
      netAmount: inv.netAmount,
      vatAmount: inv.vatAmount,
      vatRate: inv.vatRate,
      jir: inv.jir,
      zki: inv.zki,
      oibIssuer: inv.oibIssuer,
    },
    recipient: {
      name: inv.recipientName,
      oib: inv.recipientOib,
      address: inv.recipientAddress,
    },
    company,
    lineItemDescription: period ? `${lineItem}, razdoblje ${period}` : lineItem,
  });

  const pdfKey = buildObjectKey(`invoices/${inv.id}`, `racun-${inv.brOznRac}-${inv.year}.pdf`);
  await uploadObject({ key: pdfKey, body: pdf, contentType: "application/pdf" });
  await prisma.invoice.update({ where: { id: inv.id }, data: { pdfKey } });

  const clientEmail = inv.contract?.client.email;
  if (clientEmail) {
    await sendInvoiceEmail({
      to: clientEmail,
      recipientName: inv.recipientName,
      invoiceNumber: `${inv.brOznRac}/${inv.oznPosPr}/${inv.oznNapUr}`,
      amount: inv.totalAmount,
      invoicePdf: pdf,
    });
  }
}

async function periodLabelForInvoice(invoiceId: string): Promise<string | null> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { rentPayment: true },
  });
  if (!inv?.rentPayment) return null;
  return `${formatDateHr(inv.rentPayment.periodStart)} – ${formatDateHr(inv.rentPayment.periodEnd)}`;
}
