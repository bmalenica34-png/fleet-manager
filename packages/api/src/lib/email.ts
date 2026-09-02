import { Resend } from "resend";

let client: Resend | undefined;

function getClient(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("Missing required env var: RESEND_API_KEY");
    }
    client = new Resend(apiKey);
  }
  return client;
}

function getFromAddress(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new Error("Missing required env var: RESEND_FROM_EMAIL");
  }
  return from;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<void> {
  await getClient().emails.send({
    from: getFromAddress(),
    to: params.to,
    subject: params.subject,
    html: params.html,
    attachments: params.attachments,
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export async function sendSignedContractDocumentsEmail(params: {
  to: string;
  recipientName: string;
  vehicleLabel: string;
  contractPdf: Buffer;
  protocolPdf: Buffer;
  termsPdf?: Buffer;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Potpisan ugovor za najam vozila ${params.vehicleLabel}`,
    html: `
      <p>Poštovani/a ${params.recipientName},</p>
      <p>U prilogu se nalazi potpisan ugovor za najam vozila <strong>${params.vehicleLabel}</strong>,
      primopredajni zapisnik sa stanjem vozila pri preuzimanju${params.termsPdf ? ", te prihvaćeni uvjeti najma" : ""}.</p>
      <p>Hvala,<br/>Rent-a-Car Manager</p>
    `,
    attachments: [
      { filename: "ugovor.pdf", content: params.contractPdf },
      { filename: "primopredajni-zapisnik.pdf", content: params.protocolPdf },
      ...(params.termsPdf ? [{ filename: "uvjeti-najma.pdf", content: params.termsPdf }] : []),
    ],
  });
}

export async function sendIncompleteVehicleDataEmail(params: {
  to: string;
  recipientName: string;
  vehicleLabel: string;
  reasons: string[];
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Vozilo ${params.vehicleLabel} ima nepotpune podatke`,
    html: `
      <p>Poštovani/a ${params.recipientName},</p>
      <p>Vozilo <strong>${params.vehicleLabel}</strong> je uvezeno s nepotpunim podacima:</p>
      <ul>${params.reasons.map((r) => `<li>${r}</li>`).join("")}</ul>
      <p>Molimo dopuni podatke na stranici vozila.</p>
      <p>Hvala,<br/>Rent-a-Car Manager</p>
    `,
  });
}

export async function sendIncompleteClientDataEmail(params: {
  to: string;
  recipientName: string;
  clientLabel: string;
  reasons: string[];
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Klijent ${params.clientLabel} ima nepotpune podatke`,
    html: `
      <p>Poštovani/a ${params.recipientName},</p>
      <p>Klijent <strong>${params.clientLabel}</strong> je uvezen s nepotpunim podacima:</p>
      <ul>${params.reasons.map((r) => `<li>${r}</li>`).join("")}</ul>
      <p>Molimo dopuni podatke na stranici klijenta.</p>
      <p>Hvala,<br/>Rent-a-Car Manager</p>
    `,
  });
}

export async function sendContractSigningEmail(params: {
  to: string;
  clientName: string;
  vehicleLabel: string;
  dateFrom: Date;
  dateTo: Date;
  signingUrl: string;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Ugovor za najam vozila ${params.vehicleLabel} - potrebno potpisati`,
    html: `
      <p>Poštovani/a ${params.clientName},</p>
      <p>Pripremljen je ugovor za najam vozila <strong>${params.vehicleLabel}</strong>
      za razdoblje od <strong>${formatDate(params.dateFrom)}</strong> do
      <strong>${formatDate(params.dateTo)}</strong>.</p>
      <p>Za dovršetak najma potrebno je potpisati ugovor putem sljedećeg linka
      (vrijedi 48 sati):</p>
      <p><a href="${params.signingUrl}">${params.signingUrl}</a></p>
      <p>Hvala,<br/>Rent-a-Car Manager</p>
    `,
  });
}

export async function sendPhotoRequestEmail(params: {
  to: string;
  clientName: string;
  vehicleLabel: string;
  requestUrl: string;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Zatražene su svježe slike vozila ${params.vehicleLabel}`,
    html: `
      <p>Poštovani/a ${params.clientName},</p>
      <p>Najmodavac je zatražio svježe slike vozila <strong>${params.vehicleLabel}</strong>
      tijekom trajanja najma.</p>
      <p>Molimo uploadaj slike putem sljedećeg linka (vrijedi 48 sati):</p>
      <p><a href="${params.requestUrl}">${params.requestUrl}</a></p>
      <p>Hvala,<br/>Rent-a-Car Manager</p>
    `,
  });
}

export async function sendPhotoRequestFulfilledEmail(params: {
  to: string;
  clientName: string;
  vehicleLabel: string;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Primljene slike vozila ${params.vehicleLabel}`,
    html: `
      <p>Klijent ${params.clientName} je uploadao zatražene slike vozila
      <strong>${params.vehicleLabel}</strong>.</p>
    `,
  });
}

export async function sendAnnexSigningEmail(params: {
  to: string;
  clientName: string;
  vehicleLabel: string;
  currentDateTo: Date;
  proposedNewDateTo: Date;
  extendUrl: string;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Najam vozila ${params.vehicleLabel} uskoro ističe - produženje?`,
    html: `
      <p>Poštovani/a ${params.clientName},</p>
      <p>Najam vozila <strong>${params.vehicleLabel}</strong> ističe
      <strong>${formatDate(params.currentDateTo)}</strong>.</p>
      <p>Ako želite produžiti najam do <strong>${formatDate(params.proposedNewDateTo)}</strong>
      (datum možete promijeniti), potvrdite putem sljedećeg linka (vrijedi 48 sati):</p>
      <p><a href="${params.extendUrl}">${params.extendUrl}</a></p>
      <p>Nije potrebno ponovno slati dokumente.</p>
      <p>Hvala,<br/>Rent-a-Car Manager</p>
    `,
  });
}

export async function sendRegistrationExpiryEmail(params: {
  to: string;
  recipientName: string;
  vehicleLabel: string;
  expiresAt: Date;
  daysUntil: number;
}): Promise<void> {
  const when =
    params.daysUntil === 0 ? "danas" : `za ${params.daysUntil} ${params.daysUntil === 1 ? "dan" : "dana"}`;

  await sendEmail({
    to: params.to,
    subject: `Registracija vozila ${params.vehicleLabel} ističe ${when}`,
    html: `
      <p>Poštovani/a ${params.recipientName},</p>
      <p>Registracija vozila <strong>${params.vehicleLabel}</strong> ističe
      <strong>${when}</strong> (${formatDate(params.expiresAt)}).</p>
      <p>Hvala,<br/>Rent-a-Car Manager</p>
    `,
  });
}

// Circular-import-safe: samo tipovi, periodicReports.ts importa OVAJ modul
// (email.ts), ne obrnuto - vrijednosni import bi napravio ciklus.
export interface PeriodicReportEmailVehicleRow {
  vehicleLabel: string;
  rentedDays: number;
  totalDays: number;
  revenue: number;
  serviceCost: number;
  additionalCosts: number;
  profit: number;
  status: "good" | "ok" | "bad" | "no_activity";
}

const STATUS_LABEL_HR: Record<PeriodicReportEmailVehicleRow["status"], string> = {
  good: "Dobro",
  ok: "Prosječno",
  bad: "Loše",
  no_activity: "Bez aktivnosti",
};

function eur(value: number): string {
  return `${value.toFixed(2)} €`;
}

/**
 * Automatski periodični izvještaj o profitabilnosti flote - NAMJERNO bez
 * grafa/slike (nema chart/image-generation biblioteke u projektu, a inline
 * grafovi u emailu su notorno nepouzdani kroz različite email klijente) -
 * umjesto toga brojevi u HTML tablici + link na dashboard za vizualni
 * prikaz, točno fallback koji je zahtjev eksplicitno dopustio.
 */
export async function sendPeriodicReportEmail(params: {
  to: string;
  data: {
    from: Date;
    to: Date;
    vehicles: PeriodicReportEmailVehicleRow[];
    totals: {
      revenue: number;
      serviceCost: number;
      additionalCosts: number;
      profit: number;
      rentedDays: number;
      totalDays: number;
    };
  };
  dashboardUrl: string;
}): Promise<void> {
  const { data } = params;
  const rows = [...data.vehicles]
    .sort((a, b) => b.profit - a.profit)
    .map(
      (v) => `
        <tr>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;">${v.vehicleLabel}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;">${v.rentedDays}/${v.totalDays}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;">${eur(v.revenue)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;">${eur(v.serviceCost)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;">${eur(v.additionalCosts)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;">${eur(v.profit)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #eee;">${STATUS_LABEL_HR[v.status]}</td>
        </tr>`
    )
    .join("");

  await sendEmail({
    to: params.to,
    subject: `Periodični izvještaj o floti (${formatDate(data.from)} - ${formatDate(data.to)})`,
    html: `
      <p>Poštovani/a,</p>
      <p>Izvještaj o profitabilnosti flote za razdoblje
      <strong>${formatDate(data.from)} - ${formatDate(data.to)}</strong>:</p>
      <p>
        Ukupan prihod: <strong>${eur(data.totals.revenue)}</strong><br/>
        Ukupan trošak servisa: <strong>${eur(data.totals.serviceCost)}</strong><br/>
        Ukupni dodatni troškovi (leasing/osiguranje/ostalo): <strong>${eur(data.totals.additionalCosts)}</strong><br/>
        Ukupan profit: <strong>${eur(data.totals.profit)}</strong><br/>
        Dana pod ugovorom (zbrojeno preko flote): <strong>${data.totals.rentedDays}/${data.totals.totalDays}</strong>
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:4px 8px;border-bottom:2px solid #ccc;">Vozilo</th>
            <th style="text-align:left;padding:4px 8px;border-bottom:2px solid #ccc;">Dana pod ugovorom</th>
            <th style="text-align:left;padding:4px 8px;border-bottom:2px solid #ccc;">Prihod</th>
            <th style="text-align:left;padding:4px 8px;border-bottom:2px solid #ccc;">Trošak servisa</th>
            <th style="text-align:left;padding:4px 8px;border-bottom:2px solid #ccc;">Dodatni troškovi</th>
            <th style="text-align:left;padding:4px 8px;border-bottom:2px solid #ccc;">Profit</th>
            <th style="text-align:left;padding:4px 8px;border-bottom:2px solid #ccc;">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;">
        Za grafički prikaz i prilagodbu razdoblja, pogledaj
        <a href="${params.dashboardUrl}">statistiku flote na dashboardu</a>.
      </p>
      <p>Hvala,<br/>Rent-a-Car Manager</p>
    `,
  });
}

export async function sendSignedAnnexEmail(params: {
  to: string;
  recipientName: string;
  vehicleLabel: string;
  newDateTo: Date;
  annexPdf: Buffer;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Produžen najam vozila ${params.vehicleLabel}`,
    html: `
      <p>Poštovani/a ${params.recipientName},</p>
      <p>Najam vozila <strong>${params.vehicleLabel}</strong> je produžen do
      <strong>${formatDate(params.newDateTo)}</strong>. Aneks ugovora je u prilogu.</p>
      <p>Hvala,<br/>Rent-a-Car Manager</p>
    `,
    attachments: [{ filename: "aneks.pdf", content: params.annexPdf }],
  });
}

// ---------------------------------------------------------------------------
// Praćenje plaćanja najma (RentPayment) - vidi server/rentPayments.ts
// ---------------------------------------------------------------------------

export async function sendRentPaymentDueEmail(params: {
  to: string;
  clientName: string;
  vehicleLabel: string;
  amount: number;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Naplata dospijeva: ${params.clientName}, ${params.amount.toFixed(2)} €, ${params.vehicleLabel}`,
    html: `
      <p>Naplata dospijeva danas:</p>
      <ul>
        <li>Klijent: <strong>${params.clientName}</strong></li>
        <li>Iznos: <strong>${params.amount.toFixed(2)} €</strong></li>
        <li>Vozilo: <strong>${params.vehicleLabel}</strong></li>
      </ul>
      <p>Označi kao plaćeno na stranici "Najmovi" čim naplatiš.</p>
      <p>Hvala,<br/>Rent-a-Car Manager</p>
    `,
  });
}

export async function sendRentPaymentOverdueEmail(params: {
  to: string;
  clientName: string;
  vehicleLabel: string;
  amount: number;
  dueDate: Date;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Podsjetnik - dospjela naplata za najam vozila ${params.vehicleLabel}`,
    html: `
      <p>Poštovani/a ${params.clientName},</p>
      <p>Naplata za najam vozila <strong>${params.vehicleLabel}</strong> u iznosu
      <strong>${params.amount.toFixed(2)} €</strong> je dospjela
      <strong>${formatDate(params.dueDate)}</strong> i još uvijek nije evidentirana kao plaćena.</p>
      <p>Molimo podmiri obvezu čim prije, ili nas kontaktiraj ako je plaćanje već izvršeno.</p>
      <p>Hvala,<br/>Rent-a-Car Manager</p>
    `,
  });
}

export async function sendInvoiceEmail(params: {
  to: string;
  recipientName: string;
  invoiceNumber: string;
  amount: number;
  invoicePdf: Buffer;
}): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: `Račun br. ${params.invoiceNumber}`,
    html: `
      <p>Poštovani/a ${params.recipientName},</p>
      <p>U prilogu se nalazi fiskalizirani račun br. <strong>${params.invoiceNumber}</strong>
      na iznos <strong>${params.amount.toFixed(2)} €</strong>.</p>
      <p>Hvala,<br/>Rent-a-Car Manager</p>
    `,
    attachments: [{ filename: `racun-${params.invoiceNumber.replace(/\//g, "-")}.pdf`, content: params.invoicePdf }],
  });
}

export async function sendWeeklyPaymentReminderEmail(params: { to: string }): Promise<void> {
  await sendEmail({
    to: params.to,
    subject: "Podsjetnik - označi naplaćene tjedne najmove",
    html: `
      <p>Poštovani/a,</p>
      <p>Ovo je tjedni podsjetnik da provjeriš i označiš naplaćene najmove na stranici
      "Najmovi" (posebno korisno za klijente koji plaćaju gotovinski/ručno, bez
      preciznog datuma dospijeća).</p>
      <p>Hvala,<br/>Rent-a-Car Manager</p>
    `,
  });
}
