import { Document, Page, Text, View, Image } from "./components";
import { styles } from "./styles";
import { formatDate, formatDateTime } from "./format";

const VAT_RATE = 0.25;

export interface ContractPdfProps {
  contract: {
    id: string;
    number: number;
    dateFrom: Date;
    dateTo: Date;
    signedAt: Date | null;
    pickupLocation: string | null;
    returnLocation: string | null;
    odometerStart: number | null;
    odometerEnd: number | null;
    pricePerDay: number | null;
    excessAmount: number | null;
    paymentMethod: string | null;
    termsAcceptedAt: Date | null;
    termsVersion: string | null;
  };
  vehicle: {
    make: string;
    model: string;
    year: number | null;
    licensePlate: string;
    vin: string | null;
  };
  client: {
    firstName: string;
    lastName: string;
    oib: string;
    email: string;
    phone: string;
    address: string | null;
  };
  company: {
    name: string;
    address: string;
    oib: string;
    phone: string;
    email: string;
    logoUrl: string | null;
  };
  // Ime osobe koja je ugovor izdala (Contract.createdByOwner), za potpisni
  // blok "Za {firma}". Null za ugovore bez zabilježenog izdavatelja (kreirani
  // prije uvođenja Contract.createdByOwnerId) - blok tad prikazuje samo naziv
  // firme i datum, bez retka s imenom.
  issuedByName: string | null;
  signatureUrl: string;
}

function dash(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function formatMoney(value: number): string {
  return `${value.toFixed(2)} EUR`;
}

function diffDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

export function ContractPdfDocument({
  contract,
  vehicle,
  client,
  company,
  issuedByName,
  signatureUrl,
}: ContractPdfProps) {
  const days = diffDays(contract.dateFrom, contract.dateTo);
  const total = contract.pricePerDay != null ? contract.pricePerDay * days : null;
  const base = total != null ? total / (1 + VAT_RATE) : null;
  const vat = total != null && base != null ? total - base : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.companyHeaderRow}>
            {company.logoUrl ? <Image src={company.logoUrl} style={styles.logo} /> : null}
            <View style={styles.companyBlock}>
              <Text style={styles.companyName}>{dash(company.name)}</Text>
              {company.address ? <Text style={styles.companyLine}>{company.address}</Text> : null}
              <Text style={styles.companyLine}>OIB: {dash(company.oib)}</Text>
              <Text style={styles.companyLine}>Telefon: {dash(company.phone)}</Text>
              <Text style={styles.companyLine}>Email: {dash(company.email)}</Text>
            </View>
          </View>
          <View style={styles.contractNumberBox}>
            <Text style={styles.contractNumberLabel}>BROJ UGOVORA</Text>
            <Text style={styles.contractNumberValue}>{contract.number}</Text>
          </View>
        </View>

        <Text style={styles.title}>Ugovor o najmu vozila</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Račun za / Korisnik</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Ime i prezime</Text>
            <Text style={styles.value}>
              {client.firstName} {client.lastName}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Adresa</Text>
            <Text style={styles.value}>{dash(client.address)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>OIB</Text>
            <Text style={styles.value}>{client.oib}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{client.email}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Telefon</Text>
            <Text style={styles.value}>{client.phone}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Podaci o najmu</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Registracija</Text>
            <Text style={styles.value}>{vehicle.licensePlate}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Vozilo</Text>
            <Text style={styles.value}>
              {vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ""}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Preuzimanje</Text>
            <Text style={styles.value}>
              {formatDateTime(contract.dateFrom)}
              {contract.pickupLocation ? ` — ${contract.pickupLocation}` : ""}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Povrat</Text>
            <Text style={styles.value}>
              {formatDateTime(contract.dateTo)}
              {contract.returnLocation ? ` — ${contract.returnLocation}` : ""}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Kilometraža - početak</Text>
            <Text style={styles.value}>{dash(contract.odometerStart)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Kilometraža - kraj</Text>
            <Text style={styles.value}>{dash(contract.odometerEnd)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Broj dana</Text>
            <Text style={styles.value}>{days}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Cijena/dan</Text>
            <Text style={styles.value}>{contract.pricePerDay != null ? formatMoney(contract.pricePerDay) : "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Ukupan najam</Text>
            <Text style={styles.value}>{total != null ? formatMoney(total) : "—"}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Obračun</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Ukupno</Text>
            <Text style={styles.value}>{total != null ? formatMoney(total) : "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>PDV (25%)</Text>
            <Text style={styles.value}>{vat != null ? formatMoney(vat) : "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Osnovica</Text>
            <Text style={styles.value}>{base != null ? formatMoney(base) : "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Učešće u šteti</Text>
            <Text style={styles.value}>
              {contract.excessAmount != null ? formatMoney(contract.excessAmount) : "—"}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Način plaćanja</Text>
            <Text style={styles.value}>{dash(contract.paymentMethod)}</Text>
          </View>
        </View>

        <View style={styles.warningBlock}>
          <Text style={styles.warningTitle}>UPOZORENJE / ATTENTION</Text>
          <Text style={styles.warningText}>
            U slučaju nezgode obavezno pozvati prometnu policiju na tel. 192. Bez policijskog
            zapisnika stranka će biti terećena za iznos štete.
          </Text>
          <Text style={styles.warningText}>
            In the case of an accident, please contact the police on 192 and inform our office.
            The customer will be charged for the deductible amount if a police report is not made.
          </Text>
          <Text style={styles.warningTextBold}>POLICIJA / POLICE: 192 / 112</Text>
        </View>

        {contract.termsAcceptedAt && (
          <Text style={styles.termsLine}>
            Korisnik je pročitao i prihvatio Uvjete najma
            {contract.termsVersion ? ` (verzija ${contract.termsVersion})` : ""} dana{" "}
            {formatDateTime(contract.termsAcceptedAt)}.
          </Text>
        )}

        <View style={styles.signatureRow}>
          <View style={styles.signatureCol}>
            <Text style={styles.sectionTitle}>Za {company.name || "najmodavca"}</Text>
            {issuedByName && contract.signedAt ? (
              <Text style={styles.photoDamage}>
                {issuedByName}, {formatDateTime(contract.signedAt)}
              </Text>
            ) : (
              <Text style={styles.photoDamage}>{formatDate(contract.signedAt ?? contract.dateFrom)}</Text>
            )}
          </View>
          <View style={styles.signatureCol}>
            <Text style={styles.sectionTitle}>Potpis korisnika</Text>
            {contract.signedAt && (
              <Text style={styles.photoDamage}>Potpisano: {formatDateTime(contract.signedAt)}</Text>
            )}
            <Image src={signatureUrl} style={styles.signatureImage} />
          </View>
        </View>

        <Text style={styles.footer} fixed>
          {company.name || "Rent-a-Car Manager"} - generirano automatski
        </Text>
      </Page>
    </Document>
  );
}
