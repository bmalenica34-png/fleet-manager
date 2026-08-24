import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {
  OTHER_VEHICLE_OPTION,
  VEHICLE_MAKES,
  VEHICLE_MODELS_BY_MAKE,
  formatDateHr,
  isoToHrDate,
  parseHrDateToIso,
} from "@rent-a-car/api";
import {
  closeContract,
  createServiceRecord,
  createServiceRecordWithReceipt,
  deleteServiceRecord,
  deleteVehicleImage,
  getVehicle,
  getVehicleStats,
  listContracts,
  listServiceRecords,
  ocrInsurancePolicy,
  ocrRegistrationDocInner,
  ocrRegistrationDocOuter,
  updateVehicle,
  uploadVehicleImages,
  uploadVehicleInsurancePolicy,
  uploadVehicleRegistrationDoc,
  type ContractListItem,
  type PickedFile,
  type ServiceRecordDTO,
  type VehicleDTO,
  type VehicleStatsDTO,
  type VehicleStatsStatus,
  type VehicleStatus,
} from "../../../src/lib/api";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR + 1 - 1980 + 1 }, (_, i) => CURRENT_YEAR + 1 - i);

type VehicleTab = "info" | "documents" | "images" | "service" | "contracts" | "stats";

const TABS: { id: VehicleTab; label: string }[] = [
  { id: "info", label: "Podaci" },
  { id: "documents", label: "Dokumenti" },
  { id: "images", label: "Slike" },
  { id: "service", label: "Servis" },
  { id: "contracts", label: "Ugovori" },
  { id: "stats", label: "Statistika" },
];

const STATS_STATUS_BADGE: Record<VehicleStatsStatus, { label: string; bg: string; fg: string }> = {
  good: { label: "Dobro", bg: "#f0fdf4", fg: "#166534" },
  ok: { label: "Prosječno", bg: "#fefce8", fg: "#854d0e" },
  bad: { label: "Loše", bg: "#fef2f2", fg: "#b91c1c" },
  no_activity: { label: "Bez aktivnosti", bg: "#f3f4f6", fg: "#374151" },
};

function StatsStatusBadge({ status }: { status: VehicleStatsStatus }) {
  const { label, bg, fg } = STATS_STATUS_BADGE[status];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const STATS_RANGE_PRESETS = [7, 30, 90] as const;

function isoDateNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_BADGE: Record<VehicleStatus, { label: string; bg: string; fg: string }> = {
  on_service: { label: "Na servisu", bg: "#f3f4f6", fg: "#374151" },
  rented: { label: "Pod ugovorom", bg: "#eff6ff", fg: "#1d4ed8" },
  available: { label: "Slobodno", bg: "#f0fdf4", fg: "#166534" },
};

function StatusBadge({ status }: { status: VehicleStatus }) {
  const { label, bg, fg } = STATUS_BADGE[status];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

function isContractActive(c: ContractListItem): boolean {
  const now = new Date();
  return (
    c.status === "signed" &&
    new Date(c.dateFrom) <= now &&
    new Date(c.dateTo) >= now &&
    !c.closedAt
  );
}

export default function VehicleDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [vehicle, setVehicle] = useState<VehicleDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [make, setMake] = useState("");
  const [customMake, setCustomMake] = useState("");
  const [model, setModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [year, setYear] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [vin, setVin] = useState("");
  const [registrationExpiresAt, setRegistrationExpiresAt] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [uploadingInsurance, setUploadingInsurance] = useState(false);
  const [insuranceError, setInsuranceError] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imagesError, setImagesError] = useState<string | null>(null);

  // OCR prefill - tri odvojena slota (vanjska/unutarnja strana prometne,
  // polica osiguranja), svaki sa svojim staged fajlom (odabir i skeniranje
  // su dva odvojena koraka, isti obrazac kao web) - ne sprema ništa,
  // vlasnik uvijek pregleda/ispravi prefilana polja prije "Spremi promjene".
  const [outerOcrFile, setOuterOcrFile] = useState<PickedFile | null>(null);
  const [outerOcrLoading, setOuterOcrLoading] = useState(false);
  const [outerOcrError, setOuterOcrError] = useState<string | null>(null);
  const [outerOcrNotice, setOuterOcrNotice] = useState<string | null>(null);

  const [innerOcrFile, setInnerOcrFile] = useState<PickedFile | null>(null);
  const [innerOcrLoading, setInnerOcrLoading] = useState(false);
  const [innerOcrError, setInnerOcrError] = useState<string | null>(null);
  const [innerOcrNotice, setInnerOcrNotice] = useState<string | null>(null);

  const [insuranceOcrFile, setInsuranceOcrFile] = useState<PickedFile | null>(null);
  const [insuranceOcrLoading, setInsuranceOcrLoading] = useState(false);
  const [insuranceOcrError, setInsuranceOcrError] = useState<string | null>(null);
  const [insuranceOcrNotice, setInsuranceOcrNotice] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<VehicleTab>("info");
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [togglingService, setTogglingService] = useState(false);
  const [serviceToggleError, setServiceToggleError] = useState<string | null>(null);
  const [closingContractId, setClosingContractId] = useState<string | null>(null);
  const [closeContractError, setCloseContractError] = useState<string | null>(null);

  // Servisna knjižica - učitava se neovisno o aktivnom tabu (isti obrazac
  // kao contracts), da ukupan trošak/broj zapisa bude spreman čim se tab
  // otvori, bez dodatnog loading treptaja. Isti DD.MM.GGGG. tekstualni
  // datum obrazac kao svugdje drugdje u ovom fajlu (nema native date
  // pickera, vidi napomenu kod statistike niže).
  const [serviceRecords, setServiceRecords] = useState<ServiceRecordDTO[]>([]);
  const [serviceRecordsLoading, setServiceRecordsLoading] = useState(true);
  const [serviceDateHr, setServiceDateHr] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [serviceCost, setServiceCost] = useState("");
  const [serviceProvider, setServiceProvider] = useState("");
  const [serviceReceiptFile, setServiceReceiptFile] = useState<PickedFile | null>(null);
  const [serviceMarkUnderService, setServiceMarkUnderService] = useState(false);
  const [savingServiceRecord, setSavingServiceRecord] = useState(false);
  const [serviceRecordError, setServiceRecordError] = useState<string | null>(null);
  const [deletingServiceRecordId, setDeletingServiceRecordId] = useState<string | null>(null);

  // Statistika - default zadnjih 30 dana. `statsRangeDays` null znači
  // "prilagođen raspon" (custom tekstualna polja ispod, isti DD.MM.GGGG. +
  // parseHrDateToIso obrazac kao "Datum isteka registracije" polje gore u
  // ovom fajlu - RN nema built-in date input, i ovaj repo nema instaliran
  // native date-picker paket, pa se ne uvodi nova native ovisnost samo za
  // ovo, isti razlog kao izbjegavanje Expo web ranije).
  const [statsRangeDays, setStatsRangeDays] = useState<number | null>(30);
  const [statsFrom, setStatsFrom] = useState(() => isoDateNDaysAgo(29));
  const [statsTo, setStatsTo] = useState(() => todayIsoDate());
  const [statsFromHr, setStatsFromHr] = useState("");
  const [statsToHr, setStatsToHr] = useState("");
  const [stats, setStats] = useState<VehicleStatsDTO | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const load = useCallback(() => {
    setError(null);
    getVehicle(id)
      .then((v) => {
        setVehicle(v);
        if (VEHICLE_MAKES.includes(v.make)) {
          setMake(v.make);
          setCustomMake("");
          const models = VEHICLE_MODELS_BY_MAKE[v.make] ?? [];
          if (models.includes(v.model)) {
            setModel(v.model);
            setCustomModel("");
          } else {
            setModel(OTHER_VEHICLE_OPTION);
            setCustomModel(v.model);
          }
        } else {
          setMake(OTHER_VEHICLE_OPTION);
          setCustomMake(v.make);
          setModel(OTHER_VEHICLE_OPTION);
          setCustomModel(v.model);
        }
        setYear(v.year ? String(v.year) : "");
        setLicensePlate(v.licensePlate);
        setVin(v.vin ?? "");
        setRegistrationExpiresAt(v.registrationExpiresAt ? isoToHrDate(v.registrationExpiresAt) : "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Greška"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const loadContracts = useCallback(() => {
    listContracts()
      .then(setContracts)
      .catch(() => setContracts([]))
      .finally(() => setContractsLoading(false));
  }, []);

  useEffect(() => {
    loadContracts();
  }, [loadContracts]);

  const vehicleContracts = contracts.filter((c) => c.vehicleId === id);

  const loadServiceRecords = useCallback(() => {
    listServiceRecords(id)
      .then(setServiceRecords)
      .catch(() => setServiceRecords([]))
      .finally(() => setServiceRecordsLoading(false));
  }, [id]);

  useEffect(() => {
    loadServiceRecords();
  }, [loadServiceRecords]);

  const totalServiceCost = serviceRecords.reduce((sum, r) => sum + r.cost, 0);

  async function handlePickServiceReceipt() {
    const result = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"] });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setServiceReceiptFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? "application/octet-stream",
    });
  }

  async function handleAddServiceRecord() {
    setServiceRecordError(null);

    const isoDate = parseHrDateToIso(serviceDateHr.trim());
    const cost = Number(serviceCost);
    if (!isoDate) {
      setServiceRecordError("Datum mora biti u formatu DD.MM.GGGG.");
      return;
    }
    if (!serviceDescription.trim() || !serviceCost || Number.isNaN(cost)) {
      setServiceRecordError("Popuni datum, opis i trošak.");
      return;
    }

    setSavingServiceRecord(true);
    try {
      const input = {
        date: isoDate,
        description: serviceDescription.trim(),
        cost,
        provider: serviceProvider.trim() || undefined,
      };

      if (serviceReceiptFile) {
        await createServiceRecordWithReceipt(id, input, serviceReceiptFile);
      } else {
        await createServiceRecord(id, input);
      }

      // Checkbox je samo prečac za ne-obavezno vezan "na servisu" toggle
      // (isti obrazac kao web) - odvojen PATCH poziv NAKON uspješnog
      // kreiranja zapisa, ne dio service-record kreiranja, i samo ako
      // vozilo već nije na servisu.
      if (serviceMarkUnderService && vehicle && !vehicle.underService) {
        await updateVehicle(id, { underService: true });
      }

      setServiceDateHr("");
      setServiceDescription("");
      setServiceCost("");
      setServiceProvider("");
      setServiceReceiptFile(null);
      setServiceMarkUnderService(false);
      loadServiceRecords();
      load();
    } catch (err) {
      setServiceRecordError(err instanceof Error ? err.message : "Greška prilikom spremanja zapisa");
    } finally {
      setSavingServiceRecord(false);
    }
  }

  function handleDeleteServiceRecord(record: ServiceRecordDTO) {
    Alert.alert("Obrisati zapis?", "Ova radnja je nepovratna.", [
      { text: "Odustani", style: "cancel" },
      {
        text: "Obriši",
        style: "destructive",
        onPress: async () => {
          setServiceRecordError(null);
          setDeletingServiceRecordId(record.id);
          try {
            await deleteServiceRecord(id, record.id);
            loadServiceRecords();
          } catch (err) {
            setServiceRecordError(err instanceof Error ? err.message : "Greška prilikom brisanja zapisa");
          } finally {
            setDeletingServiceRecordId(null);
          }
        },
      },
    ]);
  }

  useEffect(() => {
    if (activeTab !== "stats") return;
    if (!statsFrom || !statsTo) return;
    setStatsLoading(true);
    getVehicleStats(id, statsFrom, statsTo)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [activeTab, id, statsFrom, statsTo]);

  function selectStatsPreset(days: number) {
    setStatsRangeDays(days);
    setStatsFrom(isoDateNDaysAgo(days - 1));
    setStatsTo(todayIsoDate());
  }

  function selectStatsCustomRange() {
    setStatsRangeDays(null);
    setStatsFromHr(isoToHrDate(statsFrom));
    setStatsToHr(isoToHrDate(statsTo));
  }

  function handleStatsFromHrChange(value: string) {
    setStatsFromHr(value);
    const parsed = parseHrDateToIso(value);
    if (parsed) setStatsFrom(parsed);
  }

  function handleStatsToHrChange(value: string) {
    setStatsToHr(value);
    const parsed = parseHrDateToIso(value);
    if (parsed) setStatsTo(parsed);
  }

  async function handleToggleUnderService() {
    if (!vehicle) return;
    setServiceToggleError(null);
    setTogglingService(true);
    try {
      const updated = await updateVehicle(id, { underService: !vehicle.underService });
      setVehicle(updated);
    } catch (err) {
      setServiceToggleError(err instanceof Error ? err.message : "Greška prilikom spremanja");
    } finally {
      setTogglingService(false);
    }
  }

  function handleCloseContract(contract: ContractListItem) {
    Alert.alert(
      "Zatvoriti ugovor?",
      `Ugovor br. ${contract.number} bit će prijevremeno zatvoren. Vozilo odmah postaje slobodno.`,
      [
        { text: "Odustani", style: "cancel" },
        {
          text: "Zatvori",
          style: "destructive",
          onPress: async () => {
            setCloseContractError(null);
            setClosingContractId(contract.id);
            try {
              await closeContract(contract.id);
              loadContracts();
              load();
            } catch (err) {
              setCloseContractError(err instanceof Error ? err.message : "Greška prilikom zatvaranja ugovora");
            } finally {
              setClosingContractId(null);
            }
          },
        },
      ]
    );
  }

  const isCustomMake = make === OTHER_VEHICLE_OPTION;
  const isCustomModel = isCustomMake || model === OTHER_VEHICLE_OPTION;
  const modelOptions = isCustomMake ? [] : (VEHICLE_MODELS_BY_MAKE[make] ?? []);

  function handleMakeSelect(value: string) {
    setMake(value);
    setModel("");
    setCustomModel("");
  }

  async function handleSaveInfo() {
    setInfoError(null);

    const resolvedMake = isCustomMake ? customMake.trim() : make;
    const resolvedModel = isCustomModel ? customModel.trim() : model;
    if (!resolvedMake || !resolvedModel) {
      setInfoError("Odaberi ili upiši marku i model.");
      return;
    }

    let isoRegistrationDate: string | undefined;
    if (registrationExpiresAt.trim()) {
      const parsed = parseHrDateToIso(registrationExpiresAt.trim());
      if (!parsed) {
        setInfoError("Datum isteka registracije mora biti u formatu DD.MM.GGGG.");
        return;
      }
      isoRegistrationDate = parsed;
    }

    setSavingInfo(true);
    try {
      const updated = await updateVehicle(id, {
        make: resolvedMake,
        model: resolvedModel,
        year: year.trim() ? Number(year) : undefined,
        licensePlate,
        vin: vin.trim() || undefined,
        registrationExpiresAt: isoRegistrationDate,
      });
      setVehicle(updated);
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : "Greška prilikom spremanja");
    } finally {
      setSavingInfo(false);
    }
  }

  async function handlePickRegistrationDoc() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const file: PickedFile = {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? "application/octet-stream",
    };

    setDocError(null);
    setUploadingDoc(true);
    try {
      const updated = await uploadVehicleRegistrationDoc(id, file);
      setVehicle(updated);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : "Greška prilikom uploada");
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handlePickInsurancePolicy() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const file: PickedFile = {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? "application/octet-stream",
    };

    setInsuranceError(null);
    setUploadingInsurance(true);
    try {
      const updated = await uploadVehicleInsurancePolicy(id, file);
      setVehicle(updated);
    } catch (err) {
      setInsuranceError(err instanceof Error ? err.message : "Greška prilikom uploada");
    } finally {
      setUploadingInsurance(false);
    }
  }

  async function pickImageFor(setFile: (file: PickedFile) => void) {
    const result = await DocumentPicker.getDocumentAsync({ type: ["image/*"] });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? "image/jpeg",
    });
  }

  async function handleOuterOcrScan() {
    if (!outerOcrFile) return;
    setOuterOcrLoading(true);
    setOuterOcrError(null);
    setOuterOcrNotice(null);
    try {
      const result = await ocrRegistrationDocOuter(outerOcrFile);
      if (result.licensePlate) {
        setLicensePlate(result.licensePlate);
        setOuterOcrNotice("Prepoznato: tablice. Provjeri na kartici 'Podaci' i spremi.");
      } else {
        setOuterOcrNotice("Tablice nisu prepoznate - upiši ručno.");
      }
    } catch (err) {
      setOuterOcrError(err instanceof Error ? err.message : "Skeniranje nije uspjelo.");
    } finally {
      setOuterOcrLoading(false);
    }
  }

  async function handleInnerOcrScan() {
    if (!innerOcrFile) return;
    setInnerOcrLoading(true);
    setInnerOcrError(null);
    setInnerOcrNotice(null);
    try {
      const result = await ocrRegistrationDocInner(innerOcrFile);
      const foundFields: string[] = [];

      if (result.make) {
        if (VEHICLE_MAKES.includes(result.make)) {
          setMake(result.make);
          setModel("");
          setCustomModel("");
        } else {
          setMake(OTHER_VEHICLE_OPTION);
          setCustomMake(result.make);
        }
        foundFields.push("marka");
      }
      if (result.model) {
        const models = VEHICLE_MODELS_BY_MAKE[result.make ?? make] ?? [];
        if (models.includes(result.model)) {
          setModel(result.model);
        } else {
          setModel(OTHER_VEHICLE_OPTION);
          setCustomModel(result.model);
        }
        foundFields.push("model");
      }
      if (result.vin) {
        setVin(result.vin);
        foundFields.push("VIN");
      }

      setInnerOcrNotice(
        foundFields.length > 0
          ? `Prepoznato: ${foundFields.join(", ")}. Provjeri na kartici 'Podaci' i spremi.`
          : "Nije prepoznato nijedno polje - upiši ručno."
      );
    } catch (err) {
      setInnerOcrError(err instanceof Error ? err.message : "Skeniranje nije uspjelo.");
    } finally {
      setInnerOcrLoading(false);
    }
  }

  async function handlePickInsuranceOcrFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf"] });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setInsuranceOcrFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? "application/pdf",
    });
  }

  async function handleInsuranceOcrScan() {
    if (!insuranceOcrFile) return;
    setInsuranceOcrLoading(true);
    setInsuranceOcrError(null);
    setInsuranceOcrNotice(null);
    try {
      const result = await ocrInsurancePolicy(insuranceOcrFile);
      const foundFields: string[] = [];

      if (result.registrationExpiresAt) {
        setRegistrationExpiresAt(isoToHrDate(result.registrationExpiresAt));
        foundFields.push("istek osiguranja");
      }
      if (result.licensePlate) {
        setLicensePlate(result.licensePlate);
        foundFields.push("tablice");
      }
      if (result.vin) {
        setVin(result.vin);
        foundFields.push("VIN");
      }

      setInsuranceOcrNotice(
        foundFields.length > 0
          ? `Prepoznato: ${foundFields.join(", ")}. Napomena: datum isteka registracije je pretpostavljen iz isteka osiguranja (obično se poklapaju). Provjeri na kartici 'Podaci' i spremi.`
          : "Ništa nije prepoznato - upiši ručno."
      );
    } catch (err) {
      setInsuranceOcrError(err instanceof Error ? err.message : "Ekstrakcija nije uspjela.");
    } finally {
      setInsuranceOcrLoading(false);
    }
  }

  async function handlePickImages() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setImagesError("Nema dozvole za pristup galeriji.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;

    const files: PickedFile[] = result.assets.map((asset, index) => ({
      uri: asset.uri,
      name: asset.fileName ?? `slika-${index}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg",
    }));

    setImagesError(null);
    setUploadingImages(true);
    try {
      await uploadVehicleImages(id, files);
      load();
    } catch (err) {
      setImagesError(err instanceof Error ? err.message : "Greška prilikom uploada");
    } finally {
      setUploadingImages(false);
    }
  }

  async function handleDeleteImage(imageId: string) {
    await deleteVehicleImage(id, imageId);
    load();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !vehicle) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error ?? "Vozilo nije pronađeno."}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 24, gap: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>{"< Natrag"}</Text>
        </Pressable>
        <Text style={styles.title}>
          {vehicle.make} {vehicle.model}
        </Text>
        <View style={styles.statusRow}>
          <StatusBadge status={vehicle.status} />
          <Pressable
            style={[styles.buttonSecondary, togglingService && styles.buttonDisabled]}
            onPress={handleToggleUnderService}
            disabled={togglingService}
          >
            <Text style={styles.buttonSecondaryText}>
              {togglingService
                ? "Spremanje..."
                : vehicle.underService
                  ? "Vrati u pogon"
                  : "Označi na servisu"}
            </Text>
          </Pressable>
        </View>
        {serviceToggleError && <Text style={styles.error}>{serviceToggleError}</Text>}
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.id}
            style={[styles.tabButton, activeTab === tab.id && styles.tabButtonActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={activeTab === tab.id ? styles.tabButtonTextActive : styles.tabButtonText}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "info" && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Podaci o vozilu</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Marka</Text>
          <View style={styles.chipWrap}>
            {VEHICLE_MAKES.map((m) => (
              <Pressable
                key={m}
                style={[styles.chip, make === m && styles.chipActive]}
                onPress={() => handleMakeSelect(m)}
              >
                <Text style={make === m ? styles.chipTextActive : styles.chipText}>{m}</Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.chip, isCustomMake && styles.chipActive]}
              onPress={() => handleMakeSelect(OTHER_VEHICLE_OPTION)}
            >
              <Text style={isCustomMake ? styles.chipTextActive : styles.chipText}>
                {OTHER_VEHICLE_OPTION}
              </Text>
            </Pressable>
          </View>
          {isCustomMake && (
            <TextInput
              style={styles.input}
              value={customMake}
              onChangeText={setCustomMake}
              placeholder="Upiši marku"
            />
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Model</Text>
          {isCustomModel ? (
            <TextInput
              style={styles.input}
              value={customModel}
              onChangeText={setCustomModel}
              placeholder="Upiši model"
            />
          ) : (
            <View style={styles.chipWrap}>
              {modelOptions.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.chip, model === m && styles.chipActive]}
                  onPress={() => setModel(m)}
                >
                  <Text style={model === m ? styles.chipTextActive : styles.chipText}>{m}</Text>
                </Pressable>
              ))}
              <Pressable style={styles.chip} onPress={() => setModel(OTHER_VEHICLE_OPTION)}>
                <Text style={styles.chipText}>{OTHER_VEHICLE_OPTION}</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Godina</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {YEAR_OPTIONS.map((y) => (
                <Pressable
                  key={y}
                  style={[styles.chip, year === String(y) && styles.chipActive]}
                  onPress={() => setYear(String(y))}
                >
                  <Text style={year === String(y) ? styles.chipTextActive : styles.chipText}>{y}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        <Field label="Registarske tablice" value={licensePlate} onChangeText={setLicensePlate} />
        <Field label="VIN" value={vin} onChangeText={setVin} />
        <Field
          label="Datum isteka registracije (DD.MM.GGGG.)"
          value={registrationExpiresAt}
          onChangeText={setRegistrationExpiresAt}
          placeholder="31.12.2026."
        />

        {infoError && <Text style={styles.error}>{infoError}</Text>}

        <Pressable
          style={[styles.button, savingInfo && styles.buttonDisabled]}
          onPress={handleSaveInfo}
          disabled={savingInfo}
        >
          <Text style={styles.buttonText}>{savingInfo ? "Spremanje..." : "Spremi promjene"}</Text>
        </Pressable>
      </View>
      )}

      {activeTab === "documents" && (
      <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vanjska strana prometne (OCR)</Text>
        <Text style={styles.muted}>→ registracija (tablice)</Text>
        {outerOcrFile && <Text style={styles.muted}>Odabrano: {outerOcrFile.name}</Text>}
        <Pressable
          style={[styles.buttonSecondary, outerOcrLoading && styles.buttonDisabled]}
          onPress={() => pickImageFor(setOuterOcrFile)}
          disabled={outerOcrLoading}
        >
          <Text style={styles.buttonSecondaryText}>Odaberi sliku</Text>
        </Pressable>
        {outerOcrFile && (
          <Pressable
            style={[styles.buttonSecondary, outerOcrLoading && styles.buttonDisabled]}
            onPress={handleOuterOcrScan}
            disabled={outerOcrLoading}
          >
            {outerOcrLoading ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.buttonSecondaryText}>Skeniraj i prefilaj</Text>
            )}
          </Pressable>
        )}
        {outerOcrError && <Text style={styles.error}>{outerOcrError}</Text>}
        {outerOcrNotice && <Text style={styles.muted}>{outerOcrNotice}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Prometna</Text>
        <Text style={styles.muted}>Unutarnja strana → marka/model/VIN</Text>
        {vehicle.registrationDocUrl ? (
          <Pressable onPress={() => Linking.openURL(vehicle.registrationDocUrl!)}>
            <Text style={styles.link}>Pregledaj trenutnu prometnu</Text>
          </Pressable>
        ) : (
          <Text style={styles.muted}>Prometna još nije uploadana.</Text>
        )}
        <Pressable
          style={[styles.buttonSecondary, uploadingDoc && styles.buttonDisabled]}
          onPress={handlePickRegistrationDoc}
          disabled={uploadingDoc}
        >
          <Text style={styles.buttonSecondaryText}>
            {uploadingDoc ? "Uploadam..." : "Odaberi i uploadaj prometnu"}
          </Text>
        </Pressable>
        {docError && <Text style={styles.error}>{docError}</Text>}

        {innerOcrFile && <Text style={styles.muted}>Odabrano za skeniranje: {innerOcrFile.name}</Text>}
        <Pressable
          style={[styles.buttonSecondary, innerOcrLoading && styles.buttonDisabled]}
          onPress={() => pickImageFor(setInnerOcrFile)}
          disabled={innerOcrLoading}
        >
          <Text style={styles.buttonSecondaryText}>Odaberi sliku za OCR</Text>
        </Pressable>
        {innerOcrFile && (
          <Pressable
            style={[styles.buttonSecondary, innerOcrLoading && styles.buttonDisabled]}
            onPress={handleInnerOcrScan}
            disabled={innerOcrLoading}
          >
            {innerOcrLoading ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.buttonSecondaryText}>Skeniraj i prefilaj</Text>
            )}
          </Pressable>
        )}
        {innerOcrError && <Text style={styles.error}>{innerOcrError}</Text>}
        {innerOcrNotice && <Text style={styles.muted}>{innerOcrNotice}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Polica osiguranja</Text>
        <Text style={styles.muted}>→ istek osiguranja (procjena registracije), tablice, VIN</Text>
        {vehicle.insurancePolicyUrl ? (
          <Pressable onPress={() => Linking.openURL(vehicle.insurancePolicyUrl!)}>
            <Text style={styles.link}>Pregledaj trenutnu policu</Text>
          </Pressable>
        ) : (
          <Text style={styles.muted}>Polica osiguranja još nije uploadana.</Text>
        )}
        <Pressable
          style={[styles.buttonSecondary, uploadingInsurance && styles.buttonDisabled]}
          onPress={handlePickInsurancePolicy}
          disabled={uploadingInsurance}
        >
          <Text style={styles.buttonSecondaryText}>
            {uploadingInsurance ? "Uploadam..." : "Odaberi i uploadaj policu"}
          </Text>
        </Pressable>
        {insuranceError && <Text style={styles.error}>{insuranceError}</Text>}

        {insuranceOcrFile && <Text style={styles.muted}>Odabrano za skeniranje: {insuranceOcrFile.name}</Text>}
        <Pressable
          style={[styles.buttonSecondary, insuranceOcrLoading && styles.buttonDisabled]}
          onPress={handlePickInsuranceOcrFile}
          disabled={insuranceOcrLoading}
        >
          <Text style={styles.buttonSecondaryText}>Odaberi PDF za OCR</Text>
        </Pressable>
        {insuranceOcrFile && (
          <Pressable
            style={[styles.buttonSecondary, insuranceOcrLoading && styles.buttonDisabled]}
            onPress={handleInsuranceOcrScan}
            disabled={insuranceOcrLoading}
          >
            {insuranceOcrLoading ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.buttonSecondaryText}>Skeniraj i prefilaj</Text>
            )}
          </Pressable>
        )}
        {insuranceOcrError && <Text style={styles.error}>{insuranceOcrError}</Text>}
        {insuranceOcrNotice && <Text style={styles.muted}>{insuranceOcrNotice}</Text>}
      </View>
      </>
      )}

      {activeTab === "images" && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Slike vozila</Text>
        <View style={styles.imageGrid}>
          {vehicle.images.map((image) => (
            <View key={image.id} style={styles.imageWrapper}>
              <Image source={{ uri: image.url }} style={styles.image} />
              <Pressable style={styles.imageDelete} onPress={() => handleDeleteImage(image.id)}>
                <Text style={styles.imageDeleteText}>Obriši</Text>
              </Pressable>
            </View>
          ))}
        </View>
        <Pressable
          style={[styles.buttonSecondary, uploadingImages && styles.buttonDisabled]}
          onPress={handlePickImages}
          disabled={uploadingImages}
        >
          <Text style={styles.buttonSecondaryText}>
            {uploadingImages ? "Uploadam..." : "Dodaj slike"}
          </Text>
        </Pressable>
        {imagesError && <Text style={styles.error}>{imagesError}</Text>}
      </View>
      )}

      {activeTab === "service" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Ukupan trošak servisa: {totalServiceCost.toFixed(2)} €
          </Text>

          <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Nova intervencija</Text>
          <Field
            label="Datum (DD.MM.GGGG.)"
            value={serviceDateHr}
            onChangeText={setServiceDateHr}
            placeholder="24.08.2026."
          />
          <Field
            label="Opis intervencije"
            value={serviceDescription}
            onChangeText={setServiceDescription}
            placeholder="npr. Zamjena ulja i filtera"
          />
          <Field
            label="Trošak (EUR)"
            value={serviceCost}
            onChangeText={setServiceCost}
            keyboardType="number-pad"
          />
          <Field
            label="Servis / dobavljač"
            value={serviceProvider}
            onChangeText={setServiceProvider}
            placeholder="npr. Autoservis Horvat"
          />

          <Text style={styles.fieldLabel}>Račun / dokument (opcionalno)</Text>
          {serviceReceiptFile && <Text style={styles.muted}>Odabrano: {serviceReceiptFile.name}</Text>}
          <Pressable style={styles.buttonSecondary} onPress={handlePickServiceReceipt}>
            <Text style={styles.buttonSecondaryText}>
              {serviceReceiptFile ? "Promijeni fajl" : "Odaberi fajl"}
            </Text>
          </Pressable>

          {vehicle && !vehicle.underService && (
            <Pressable
              style={[styles.chip, serviceMarkUnderService && styles.chipActive, { alignSelf: "flex-start" }]}
              onPress={() => setServiceMarkUnderService((v) => !v)}
            >
              <Text style={serviceMarkUnderService ? styles.chipTextActive : styles.chipText}>
                {serviceMarkUnderService ? "✓ " : ""}Vozilo je trenutno na servisu
              </Text>
            </Pressable>
          )}

          {serviceRecordError && <Text style={styles.error}>{serviceRecordError}</Text>}

          <Pressable
            style={[styles.button, savingServiceRecord && styles.buttonDisabled]}
            onPress={handleAddServiceRecord}
            disabled={savingServiceRecord}
          >
            <Text style={styles.buttonText}>{savingServiceRecord ? "Spremanje..." : "Dodaj zapis"}</Text>
          </Pressable>

          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Povijest intervencija</Text>
          {serviceRecordsLoading ? (
            <ActivityIndicator />
          ) : serviceRecords.length === 0 ? (
            <Text style={styles.muted}>Nema unesenih servisnih zapisa.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {serviceRecords.map((r) => (
                <View key={r.id} style={styles.contractCard}>
                  <Text style={styles.contractCardTitle}>
                    {formatDateHr(r.date)} · {r.cost.toFixed(2)} €
                  </Text>
                  <Text style={styles.muted}>{r.description}</Text>
                  {r.provider && <Text style={styles.muted}>{r.provider}</Text>}
                  {r.receiptUrl && (
                    <Pressable onPress={() => Linking.openURL(r.receiptUrl!)}>
                      <Text style={styles.link}>Pregledaj račun</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={[styles.buttonSecondary, deletingServiceRecordId === r.id && styles.buttonDisabled]}
                    onPress={() => handleDeleteServiceRecord(r)}
                    disabled={deletingServiceRecordId === r.id}
                  >
                    <Text style={styles.buttonSecondaryText}>
                      {deletingServiceRecordId === r.id ? "Brisanje..." : "Obriši"}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {activeTab === "contracts" && (
        <View style={styles.section}>
          {closeContractError && <Text style={styles.error}>{closeContractError}</Text>}
          {contractsLoading ? (
            <ActivityIndicator />
          ) : vehicleContracts.length === 0 ? (
            <Text style={styles.muted}>Nema ugovora za ovo vozilo.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {vehicleContracts.map((c) => (
                <View key={c.id} style={styles.contractCard}>
                  <Text style={styles.contractCardTitle}>
                    #{c.number} · {formatDateHr(c.dateFrom)} – {formatDateHr(c.dateTo)} · {c.status}
                  </Text>
                  <Text style={styles.muted}>
                    {c.client.firstName} {c.client.lastName}
                  </Text>
                  {c.closedAt && (
                    <Text style={styles.muted}>Zatvoren {formatDateHr(c.closedAt)}</Text>
                  )}
                  {c.contractPdfUrl ? (
                    <Pressable onPress={() => Linking.openURL(c.contractPdfUrl!)}>
                      <Text style={styles.link}>Preuzmi PDF</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.muted}>Dokument još nije generiran.</Text>
                  )}
                  {isContractActive(c) && (
                    <Pressable
                      style={[styles.buttonSecondary, closingContractId === c.id && styles.buttonDisabled]}
                      onPress={() => handleCloseContract(c)}
                      disabled={closingContractId === c.id}
                    >
                      <Text style={styles.buttonSecondaryText}>
                        {closingContractId === c.id ? "Zatvaranje..." : "Zatvori ugovor prijevremeno"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {activeTab === "stats" && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistika</Text>

          <View style={styles.chipWrap}>
            {STATS_RANGE_PRESETS.map((days) => (
              <Pressable
                key={days}
                style={[styles.chip, statsRangeDays === days && styles.chipActive]}
                onPress={() => selectStatsPreset(days)}
              >
                <Text style={statsRangeDays === days ? styles.chipTextActive : styles.chipText}>
                  Zadnjih {days} dana
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.chip, statsRangeDays === null && styles.chipActive]}
              onPress={selectStatsCustomRange}
            >
              <Text style={statsRangeDays === null ? styles.chipTextActive : styles.chipText}>
                Prilagodi
              </Text>
            </Pressable>
          </View>

          {statsRangeDays === null && (
            <>
              <Field label="Od (DD.MM.GGGG.)" value={statsFromHr} onChangeText={handleStatsFromHrChange} />
              <Field label="Do (DD.MM.GGGG.)" value={statsToHr} onChangeText={handleStatsToHrChange} />
            </>
          )}

          {statsLoading || !stats ? (
            <ActivityIndicator />
          ) : (
            <View style={{ gap: 6, marginTop: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <StatsStatusBadge status={stats.status} />
                <Text style={styles.muted}>
                  {stats.totalDays} dana u razdoblju · iskorištenost {(stats.utilization * 100).toFixed(0)}%
                </Text>
              </View>
              <StatRow label="Dana pod ugovorom" value={String(stats.rentedDays)} />
              <StatRow label="Dana slobodno" value={String(stats.freeDays)} />
              <StatRow label="Prihod" value={`${stats.revenue.toFixed(2)} €`} />
              <StatRow label="Trošak servisa" value={`${stats.serviceCost.toFixed(2)} €`} />
              <StatRow label="Profit" value={`${stats.profit.toFixed(2)} €`} bold />
            </View>
          )}
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StatRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={bold ? styles.contractCardTitle : styles.muted}>{label}</Text>
      <Text style={bold ? styles.contractCardTitle : undefined}>{value}</Text>
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        keyboardType={props.keyboardType}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: { gap: 4 },
  backLink: { color: "#444" },
  title: { fontSize: 22, fontWeight: "600" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  badge: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  section: { gap: 10, borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "600" },
  field: { gap: 4 },
  fieldLabel: { fontSize: 13, color: "#444" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15 },
  button: { backgroundColor: "#111", padding: 14, borderRadius: 8, alignItems: "center", marginTop: 6 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600" },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: "#111",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonSecondaryText: { color: "#111", fontWeight: "600" },
  link: { color: "#0645ad" },
  muted: { color: "#888" },
  error: { color: "#c00" },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  imageWrapper: { width: 100, gap: 4 },
  image: { width: 100, height: 100, borderRadius: 8, backgroundColor: "#eee" },
  imageDelete: { alignItems: "center" },
  imageDeleteText: { color: "#c00", fontSize: 12 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: { backgroundColor: "#111", borderColor: "#111" },
  chipText: { color: "#111", fontSize: 13 },
  chipTextActive: { color: "#fff", fontSize: 13 },
  tabBar: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tabButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  tabButtonActive: { backgroundColor: "#111", borderColor: "#111" },
  tabButtonText: { color: "#111", fontSize: 13 },
  tabButtonTextActive: { color: "#fff", fontSize: 13 },
  contractCard: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, gap: 4 },
  contractCardTitle: { fontSize: 15, fontWeight: "600" },
});
