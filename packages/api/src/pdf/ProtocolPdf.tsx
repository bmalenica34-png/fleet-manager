import { Document, Page, Text, View, Image } from "./components";
import type { PhotoAngle, VehiclePart } from "../schemas/handoverPhoto";
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

const VEHICLE_PART_LABELS: Record<VehiclePart, string> = {
  front_bumper: "Prednji branik",
  rear_bumper: "Stražnji branik",
  hood: "Haube",
  trunk: "Prtljažnik",
  roof: "Krov",
  windshield: "Vjetrobransko staklo",
  rear_window: "Stražnje staklo",
  left_front_door: "Lijeva prednja vrata",
  left_rear_door: "Lijeva stražnja vrata",
  right_front_door: "Desna prednja vrata",
  right_rear_door: "Desna stražnja vrata",
  left_front_fender: "Lijevo prednje blatobran",
  right_front_fender: "Desno prednje blatobran",
  left_rear_fender: "Lijevo stražnje blatobran",
  right_rear_fender: "Desno stražnje blatobran",
  left_mirror: "Lijevo bočno ogledalo",
  right_mirror: "Desno bočno ogledalo",
  left_front_wheel: "Lijeva prednja guma/naplatak",
  right_front_wheel: "Desna prednja guma/naplatak",
  left_rear_wheel: "Lijeva stražnja guma/naplatak",
  right_rear_wheel: "Desna stražnja guma/naplatak",
  headlight_left: "Lijevo prednje svjetlo",
  headlight_right: "Desno prednje svjetlo",
  taillight_left: "Lijevo stražnje svjetlo",
  taillight_right: "Desno stražnje svjetlo",
  interior: "Unutrašnjost",
  other: "Ostalo",
};

export interface ProtocolPdfProps {
  contract: {
    id: string;
    number: number;
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
    id: string;
    angle: PhotoAngle;
    url: string;
    damageDescription: string | null;
    damagedPart: VehiclePart | null;
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
        <Text style={styles.subtitle}>Uz ugovor broj: {contract.number}</Text>

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
              <View key={photo.id} style={styles.photoCard} wrap={false}>
                <Text style={styles.photoLabel}>
                  {photo.damagedPart ? `Oštećenje - ${VEHICLE_PART_LABELS[photo.damagedPart]}` : ANGLE_LABELS[photo.angle]}
                </Text>
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
