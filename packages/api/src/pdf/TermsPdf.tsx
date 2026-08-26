import { Document, Page, Text, View, Image } from "./components";
import { styles } from "./styles";
import { formatDateTime } from "./format";

export interface TermsPdfProps {
  companyName: string;
  version: number;
  content: string;
  contractNumber: number;
  acceptedAt: Date | null;
  // Isti potpis kao na ContractPdf/ProtocolPdf (jedan potpis po ugovoru,
  // vidi Contract.signatureKey) - prihvaćanje uvjeta je dio istog potpisnog
  // čina, ne zaseban potpis, pa je isti signatureUrl ispravan izvor.
  signatureUrl: string;
}

/**
 * Snapshot TOČNE verzije uvjeta najma koju je klijent vidio i prihvatio pri
 * potpisu - generira se jednom po ugovoru (finalizeContractDocuments), ne
 * mijenja se ni kad se aktivna verzija u /settings kasnije promijeni.
 * Zaseban jednostavan generator (ne dio ContractPdf-a) jer sadržaj varira u
 * duljini (rastao/skraćivan tijekom vremena) i logički je zaseban dokument.
 */
export function TermsPdfDocument({
  companyName,
  version,
  content,
  contractNumber,
  acceptedAt,
  signatureUrl,
}: TermsPdfProps) {
  const paragraphs = content.split("\n\n");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Uvjeti najma</Text>
        <Text style={styles.subtitle}>
          {companyName} - verzija {version} - uz ugovor br. {contractNumber}
          {acceptedAt ? ` - prihvaćeno ${formatDateTime(acceptedAt)}` : ""}
        </Text>

        <View style={styles.section}>
          {paragraphs.map((paragraph, i) => (
            <Text key={i} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
        </View>

        <View style={styles.signatureBlock}>
          <Text style={styles.sectionTitle}>Potpis korisnika</Text>
          {acceptedAt && <Text style={styles.photoDamage}>Prihvaćeno: {formatDateTime(acceptedAt)}</Text>}
          <Image src={signatureUrl} style={styles.signatureImage} />
        </View>
      </Page>
    </Document>
  );
}
