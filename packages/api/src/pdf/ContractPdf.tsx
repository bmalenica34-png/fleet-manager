import { Document, Page, Text, View, Image } from "./components";
import { styles } from "./styles";
import { formatDate, formatDateTime } from "./format";

export interface ContractPdfProps {
  contract: {
    id: string;
    dateFrom: Date;
    dateTo: Date;
    signedAt: Date | null;
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
  };
  signatureUrl: string;
}

export function ContractPdfDocument({ contract, vehicle, client, signatureUrl }: ContractPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Ugovor o najmu vozila</Text>
        <Text style={styles.subtitle}>Broj ugovora: {contract.id}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Najmodavac</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Naziv</Text>
            <Text style={styles.value}>Rent-a-Car Manager</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Najmoprimac</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Ime i prezime</Text>
            <Text style={styles.value}>
              {client.firstName} {client.lastName}
            </Text>
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
          <Text style={styles.sectionTitle}>Vozilo</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Marka / model</Text>
            <Text style={styles.value}>
              {vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ""}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Registarske tablice</Text>
            <Text style={styles.value}>{vehicle.licensePlate}</Text>
          </View>
          {vehicle.vin && (
            <View style={styles.row}>
              <Text style={styles.label}>VIN</Text>
              <Text style={styles.value}>{vehicle.vin}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Razdoblje najma</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Datum preuzimanja</Text>
            <Text style={styles.value}>{formatDate(contract.dateFrom)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Datum povrata</Text>
            <Text style={styles.value}>{formatDate(contract.dateTo)}</Text>
          </View>
        </View>

        <View style={styles.signatureBlock}>
          <Text style={styles.sectionTitle}>Potpis najmoprimca</Text>
          {contract.signedAt && (
            <Text style={styles.photoDamage}>Potpisano: {formatDateTime(contract.signedAt)}</Text>
          )}
          <Image src={signatureUrl} style={styles.signatureImage} />
        </View>

        <Text style={styles.footer} fixed>
          Rent-a-Car Manager - generirano automatski
        </Text>
      </Page>
    </Document>
  );
}
