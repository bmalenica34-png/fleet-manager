import { Document, Page, Text, View } from "./components";
import { styles } from "./styles";
import { formatDateTime } from "./format";

export interface TermsPdfProps {
  companyName: string;
  version: number;
  content: string;
  contractNumber: number;
  acceptedAt: Date | null;
}

/**
 * Snapshot TOČNE verzije uvjeta najma koju je klijent vidio i prihvatio pri
 * potpisu - generira se jednom po ugovoru (finalizeContractDocuments), ne
 * mijenja se ni kad se aktivna verzija u /settings kasnije promijeni.
 * Zaseban jednostavan generator (ne dio ContractPdf-a) jer sadržaj varira u
 * duljini (rastao/skraćivan tijekom vremena) i logički je zaseban dokument.
 */
export function TermsPdfDocument({ companyName, version, content, contractNumber, acceptedAt }: TermsPdfProps) {
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
      </Page>
    </Document>
  );
}
