import { Document, Page, Text, View, Image } from "./components";
import type { PhotoAngle } from "../schemas/handoverPhoto";
import { styles } from "./styles";
import { formatDate } from "./format";

const ANGLE_LABELS: Record<PhotoAngle, string> = {
  front: "Prednja strana",
  back: "Stražnja strana",
  left: "Lijeva strana",
  right: "Desna strana",
  interior_dashboard: "Unutrašnjost - komandna ploča",
  interior_seats: "Unutrašnjost - sjedala",
  odometer: "Kilometraža",
  other: "Ostalo",
};

export interface ProtocolPdfProps {
  contract: {
    id: string;
    dateFrom: Date;
    dateTo: Date;
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
  photos: {
    angle: PhotoAngle;
    url: string;
    damageDescription: string | null;
  }[];
  signatureUrl: string;
}

export function ProtocolPdfDocument({
  contract,
  vehicle,
  client,
  photos,
  signatureUrl,
}: ProtocolPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Primopredajni zapisnik</Text>
        <Text style={styles.subtitle}>Uz ugovor broj: {contract.id}</Text>

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
          <View style={styles.row}>
            <Text style={styles.label}>Datum primopredaje</Text>
            <Text style={styles.value}>{formatDate(contract.dateFrom)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stanje vozila pri preuzimanju</Text>
          <View style={styles.photoGrid}>
            {photos.map((photo) => (
              <View key={photo.angle} style={styles.photoCard} wrap={false}>
                <Text style={styles.photoLabel}>{ANGLE_LABELS[photo.angle]}</Text>
                <Image src={photo.url} style={styles.photoImage} />
                <Text style={styles.photoDamage}>
                  {photo.damageDescription ? photo.damageDescription : "Bez primjedbi."}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.signatureBlock}>
          <Text style={styles.sectionTitle}>Potpis najmoprimca</Text>
          <Text style={styles.photoDamage}>
            Potpisom izjavljujem da sam vozilo preuzeo/la u opisanom stanju.
          </Text>
          <Image src={signatureUrl} style={styles.signatureImage} />
        </View>

        <Text style={styles.footer} fixed>
          Rent-a-Car Manager - generirano automatski
        </Text>
      </Page>
    </Document>
  );
}
