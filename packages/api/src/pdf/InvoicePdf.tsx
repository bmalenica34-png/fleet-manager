import { Document, Page, Text, View, Image } from "./components";
import { StyleSheet } from "@react-pdf/renderer";
import { styles } from "./styles";
import { formatDate, formatDateTime } from "./format";

export interface InvoicePdfProps {
  invoice: {
    number: string; // "12/1/1"
    type: "R1" | "R2";
    issuedAt: Date;
    invoiceDateTime: Date;
    totalAmount: number;
    netAmount: number;
    vatAmount: number;
    vatRate: number;
    jir: string | null;
    zki: string;
    oibIssuer: string;
  };
  recipient: {
    name: string;
    oib: string | null;
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
  lineItemDescription: string;
}

const local = StyleSheet.create({
  recipientBox: {
    borderLeft: "2px solid #1a1a1a",
    paddingLeft: 8,
    marginTop: 4,
    marginBottom: 12,
  },
  itemsHead: {
    flexDirection: "row",
    borderBottom: "1px solid #1a1a1a",
    paddingBottom: 3,
    marginTop: 6,
  },
  itemsRow: {
    flexDirection: "row",
    borderBottom: "1px solid #eeeeee",
    paddingVertical: 4,
  },
  cDesc: { flex: 1 },
  cNum: { width: 90, textAlign: "right" },
  totalsBox: { marginTop: 10, alignSelf: "flex-end", width: 240 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalsGrand: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: "1px solid #1a1a1a",
    paddingTop: 3,
    marginTop: 3,
  },
  bold: { fontFamily: "PTSans", fontWeight: "bold" },
  fiscalBox: {
    marginTop: 18,
    border: "1px solid #1a7a3a",
    borderRadius: 4,
    padding: 8,
  },
  fiscalTitle: {
    fontFamily: "PTSans",
    fontWeight: "bold",
    fontSize: 9,
    color: "#1a7a3a",
    marginBottom: 3,
  },
  fiscalLine: { fontSize: 8, marginBottom: 2 },
  mono: { fontFamily: "Courier" },
  note: { fontSize: 8, color: "#555555", marginTop: 10 },
});

function money(n: number): string {
  return `${n.toFixed(2)} EUR`;
}

export function InvoicePdfDocument({ invoice, recipient, company, lineItemDescription }: InvoicePdfProps) {
  const vatShown = invoice.vatRate > 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.companyHeaderRow}>
            {company.logoUrl ? <Image src={company.logoUrl} style={styles.logo} /> : null}
            <View style={styles.companyBlock}>
              <Text style={styles.companyName}>{company.name || "—"}</Text>
              {company.address ? <Text style={styles.companyLine}>{company.address}</Text> : null}
              <Text style={styles.companyLine}>OIB: {company.oib || invoice.oibIssuer}</Text>
              {company.phone ? <Text style={styles.companyLine}>Tel: {company.phone}</Text> : null}
              {company.email ? <Text style={styles.companyLine}>{company.email}</Text> : null}
            </View>
          </View>
          <View style={styles.contractNumberBox}>
            <Text style={styles.contractNumberLabel}>RAČUN BR.</Text>
            <Text style={styles.contractNumberValue}>{invoice.number}</Text>
          </View>
        </View>

        <Text style={styles.title}>
          Račun {invoice.type === "R1" ? "R1" : "R2"}
        </Text>
        <Text style={styles.subtitle}>
          Datum izdavanja: {formatDate(invoice.issuedAt)} · Datum i vrijeme:{" "}
          {formatDateTime(invoice.invoiceDateTime)}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kupac</Text>
          <View style={local.recipientBox}>
            <Text style={local.bold}>{recipient.name}</Text>
            {recipient.oib ? <Text>OIB: {recipient.oib}</Text> : null}
            {recipient.address ? <Text>{recipient.address}</Text> : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stavke</Text>
          <View style={local.itemsHead}>
            <Text style={[local.cDesc, local.bold]}>Opis</Text>
            <Text style={[local.cNum, local.bold]}>{vatShown ? "Osnovica" : "Iznos"}</Text>
            {vatShown ? <Text style={[local.cNum, local.bold]}>PDV {invoice.vatRate}%</Text> : null}
            <Text style={[local.cNum, local.bold]}>Ukupno</Text>
          </View>
          <View style={local.itemsRow}>
            <Text style={local.cDesc}>{lineItemDescription}</Text>
            <Text style={local.cNum}>{money(invoice.netAmount)}</Text>
            {vatShown ? <Text style={local.cNum}>{money(invoice.vatAmount)}</Text> : null}
            <Text style={local.cNum}>{money(invoice.totalAmount)}</Text>
          </View>

          <View style={local.totalsBox}>
            <View style={local.totalsRow}>
              <Text>Osnovica</Text>
              <Text>{money(invoice.netAmount)}</Text>
            </View>
            <View style={local.totalsRow}>
              <Text>PDV {vatShown ? `${invoice.vatRate}%` : "(nije u sustavu PDV-a)"}</Text>
              <Text>{money(invoice.vatAmount)}</Text>
            </View>
            <View style={local.totalsGrand}>
              <Text style={local.bold}>Ukupno za platiti</Text>
              <Text style={local.bold}>{money(invoice.totalAmount)}</Text>
            </View>
          </View>
        </View>

        {!vatShown ? (
          <Text style={local.note}>
            Oslobođeno PDV-a sukladno čl. 90. st. 1. Zakona o porezu na dodanu vrijednost.
          </Text>
        ) : null}

        <View style={local.fiscalBox}>
          <Text style={local.fiscalTitle}>Fiskalizacija</Text>
          <Text style={local.fiscalLine}>
            JIR: <Text style={local.mono}>{invoice.jir ?? "—"}</Text>
          </Text>
          <Text style={local.fiscalLine}>
            ZKI: <Text style={local.mono}>{invoice.zki}</Text>
          </Text>
          <Text style={local.fiscalLine}>OIB izdavatelja (fiskalizacija): {invoice.oibIssuer}</Text>
          <Text style={[local.fiscalLine, { color: "#555555", marginTop: 3 }]}>
            Ovaj je račun fiskaliziran sukladno Zakonu o fiskalizaciji. Provjera na
            porezna-uprava.hr.
          </Text>
        </View>

        <Text style={styles.footer}>
          {company.name} · OIB {company.oib || invoice.oibIssuer}
        </Text>
      </Page>
    </Document>
  );
}
