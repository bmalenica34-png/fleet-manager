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
