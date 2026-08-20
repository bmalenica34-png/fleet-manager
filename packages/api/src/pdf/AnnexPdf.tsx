import { Document, Page, Text, View, Image } from "./components";
import { styles } from "./styles";
import { formatDate, formatDateTime } from "./format";

export interface AnnexPdfProps {
  annex: {
    id: string;
    newDateTo: Date;
    signedAt: Date;
  };
  contract: {
    id: string;
    number: number;
    dateFrom: Date;
    previousDateTo: Date;
  };
  vehicle: {
    make: string;
    model: string;
    licensePlate: string;
  };
  client: {
    firstName: string;
    lastName: string;
  };
  signatureUrl: string;
}

export function AnnexPdfDocument({ annex, contract, vehicle, client, signatureUrl }: AnnexPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Aneks ugovora o najmu - produženje</Text>
        <Text style={styles.subtitle}>
          Uz ugovor broj: {contract.number} - aneks broj: {annex.id}
        </Text>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Vozilo</Text>
            <Text style={styles.value}>
              {vehicle.make} {vehicle.model} ({vehicle.licensePlate})
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Najmoprimac</Text>
            <Text style={styles.value}>
              {client.firstName} {client.lastName}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Produženje najma</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Prethodni datum povrata</Text>
            <Text style={styles.value}>{formatDate(contract.previousDateTo)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Novi datum povrata</Text>
            <Text style={styles.value}>{formatDate(annex.newDateTo)}</Text>
          </View>
        </View>

        <View style={styles.signatureBlock}>
          <Text style={styles.sectionTitle}>Potpis najmoprimca</Text>
          <Text style={styles.photoDamage}>Potpisano: {formatDateTime(annex.signedAt)}</Text>
          <Image src={signatureUrl} style={styles.signatureImage} />
        </View>

        <Text style={styles.footer} fixed>
          Rent-a-Car Manager - generirano automatski
        </Text>
      </Page>
    </Document>
  );
}
