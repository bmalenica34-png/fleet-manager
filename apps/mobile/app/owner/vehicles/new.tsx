import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import {
  OTHER_VEHICLE_OPTION,
  VEHICLE_MAKES,
  VEHICLE_MODELS_BY_MAKE,
  isoToHrDate,
  parseHrDateToIso,
} from "@rent-a-car/api";
import {
  createVehicle,
  ocrInsurancePolicy,
  ocrRegistrationDocInner,
  ocrRegistrationDocOuter,
  type PickedFile,
} from "../../../src/lib/api";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR + 1 - 1980 + 1 }, (_, i) => CURRENT_YEAR + 1 - i);

export default function NewVehicleScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [make, setMake] = useState("");
  const [customMake, setCustomMake] = useState("");
  const [model, setModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [year, setYear] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [vin, setVin] = useState("");
  const [registrationExpiresAt, setRegistrationExpiresAt] = useState("");

  // OCR prefill - vozilo još ne postoji, pa sva tri slota samo šalju na
  // ekstrakciju (ništa se ne uploada/sprema na Hetzner ovdje) - stvarni
  // upload prometne/police/slika ide na edit ekranu, nakon "Spremi vozilo"
  // (isti dvokoračni flow kao web: prvo osnovni podaci, pa dokumenti).
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

  const isCustomMake = make === OTHER_VEHICLE_OPTION;
  const isCustomModel = isCustomMake || model === OTHER_VEHICLE_OPTION;
  const modelOptions = isCustomMake ? [] : (VEHICLE_MODELS_BY_MAKE[make] ?? []);

  function handleMakeSelect(value: string) {
    setMake(value);
    setModel("");
    setCustomModel("");
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
        setOuterOcrNotice("Prepoznato: tablice. Provjeri prije spremanja.");
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
          ? `Prepoznato: ${foundFields.join(", ")}. Provjeri polja prije spremanja.`
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
      if (result.registrationExpiresAt) {
        setRegistrationExpiresAt(isoToHrDate(result.registrationExpiresAt));
        setInsuranceOcrNotice("Prepoznato: datum isteka registracije. Provjeri prije spremanja.");
      } else {
        setInsuranceOcrNotice("Datum nije prepoznat - upiši ručno.");
      }
    } catch (err) {
      setInsuranceOcrError(err instanceof Error ? err.message : "Ekstrakcija nije uspjela.");
    } finally {
      setInsuranceOcrLoading(false);
    }
  }

  async function handleSubmit() {
    setError(null);

    const resolvedMake = isCustomMake ? customMake.trim() : make;
    const resolvedModel = isCustomModel ? customModel.trim() : model;
    if (!resolvedMake || !resolvedModel) {
      setError("Odaberi ili upiši marku i model.");
      return;
    }
    if (!licensePlate.trim()) {
      setError("Registarske tablice su obavezne.");
      return;
    }

    let isoRegistrationDate: string | undefined;
    if (registrationExpiresAt.trim()) {
      const parsed = parseHrDateToIso(registrationExpiresAt.trim());
      if (!parsed) {
        setError("Datum isteka registracije mora biti u formatu DD.MM.GGGG.");
        return;
      }
      isoRegistrationDate = parsed;
    }

    setSubmitting(true);
    try {
      const vehicle = await createVehicle({
        make: resolvedMake,
        model: resolvedModel,
        year: year.trim() ? Number(year) : undefined,
        licensePlate: licensePlate.trim(),
        vin: vin.trim() || undefined,
        registrationExpiresAt: isoRegistrationDate,
      });
      router.replace({ pathname: "/owner/vehicles/[id]", params: { id: vehicle.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška prilikom spremanja");
    } finally {
      setSubmitting(false);
    }
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
        <Text style={styles.title}>Novo vozilo</Text>
      </View>

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
            {outerOcrLoading ? <ActivityIndicator /> : <Text style={styles.buttonSecondaryText}>Skeniraj i prefilaj</Text>}
          </Pressable>
        )}
        {outerOcrError && <Text style={styles.error}>{outerOcrError}</Text>}
        {outerOcrNotice && <Text style={styles.muted}>{outerOcrNotice}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Unutarnja strana prometne (OCR)</Text>
        <Text style={styles.muted}>→ marka/model/VIN</Text>
        {innerOcrFile && <Text style={styles.muted}>Odabrano: {innerOcrFile.name}</Text>}
        <Pressable
          style={[styles.buttonSecondary, innerOcrLoading && styles.buttonDisabled]}
          onPress={() => pickImageFor(setInnerOcrFile)}
          disabled={innerOcrLoading}
        >
          <Text style={styles.buttonSecondaryText}>Odaberi sliku</Text>
        </Pressable>
        {innerOcrFile && (
          <Pressable
            style={[styles.buttonSecondary, innerOcrLoading && styles.buttonDisabled]}
            onPress={handleInnerOcrScan}
            disabled={innerOcrLoading}
          >
            {innerOcrLoading ? <ActivityIndicator /> : <Text style={styles.buttonSecondaryText}>Skeniraj i prefilaj</Text>}
          </Pressable>
        )}
        {innerOcrError && <Text style={styles.error}>{innerOcrError}</Text>}
        {innerOcrNotice && <Text style={styles.muted}>{innerOcrNotice}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Polica osiguranja (OCR)</Text>
        <Text style={styles.muted}>→ datum isteka registracije</Text>
        {insuranceOcrFile && <Text style={styles.muted}>Odabrano: {insuranceOcrFile.name}</Text>}
        <Pressable
          style={[styles.buttonSecondary, insuranceOcrLoading && styles.buttonDisabled]}
          onPress={handlePickInsuranceOcrFile}
          disabled={insuranceOcrLoading}
        >
          <Text style={styles.buttonSecondaryText}>Odaberi PDF</Text>
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
              <Text style={isCustomMake ? styles.chipTextActive : styles.chipText}>{OTHER_VEHICLE_OPTION}</Text>
            </Pressable>
          </View>
          {isCustomMake && (
            <TextInput style={styles.input} value={customMake} onChangeText={setCustomMake} placeholder="Upiši marku" />
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Model</Text>
          {isCustomModel ? (
            <TextInput style={styles.input} value={customModel} onChangeText={setCustomModel} placeholder="Upiši model" />
          ) : (
            <View style={styles.chipWrap}>
              {modelOptions.map((m) => (
                <Pressable key={m} style={[styles.chip, model === m && styles.chipActive]} onPress={() => setModel(m)}>
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
                <Pressable key={y} style={[styles.chip, year === String(y) && styles.chipActive]} onPress={() => setYear(String(y))}>
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

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={handleSubmit} disabled={submitting}>
          <Text style={styles.buttonText}>{submitting ? "Spremanje..." : "Spremi vozilo"}</Text>
        </Pressable>
      </View>

      <Text style={styles.muted}>
        Nakon spremanja moći ćeš uploadati prometnu, policu i slike vozila na sljedećem ekranu.
      </Text>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { gap: 4 },
  backLink: { color: "#444" },
  title: { fontSize: 22, fontWeight: "600" },
  section: { gap: 10, borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 16 },
  sectionTitle: { fontSize: 17, fontWeight: "600" },
  field: { gap: 4 },
  fieldLabel: { fontSize: 13, color: "#444" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15 },
  button: { backgroundColor: "#111", padding: 14, borderRadius: 8, alignItems: "center", marginTop: 6 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "600" },
  buttonSecondary: { borderWidth: 1, borderColor: "#111", padding: 12, borderRadius: 8, alignItems: "center" },
  buttonSecondaryText: { color: "#111", fontWeight: "600" },
  muted: { color: "#888" },
  error: { color: "#c00" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { backgroundColor: "#111", borderColor: "#111" },
  chipText: { color: "#111", fontSize: 13 },
  chipTextActive: { color: "#fff", fontSize: 13 },
});
