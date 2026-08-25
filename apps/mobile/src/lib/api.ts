import { File, Paths, UploadType } from "expo-file-system";
import { supabase } from "./supabase";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!;
const DEFAULT_TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 30000;

// Nosi HTTP status + parsirani JSON body greške (ne samo poruku) - potrebno
// za slučajeve gdje UI treba strukturirane podatke iz error responsea, ne
// samo tekst (npr. 409 vehicle_has_active_contract nosi cijeli postojeći
// ugovor da UI može ponuditi izravan gumb za zatvaranje, isto kao web).
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  // FormData tijela (uploadi) trebaju multipart Content-Type s boundaryjem
  // koji fetch sam generira - eksplicitno postavljanje application/json
  // ovdje bi ga pregazilo i pokvarilo upload.
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Goli fetch() nema default timeout - bez ovoga, spor/mrtav mrežni put
  // (loš signal, DNS problem, server koji ne odgovara) ostavlja pozivatelja
  // zauvijek u "loading" stanju bez ikakve povratne informacije.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("request_timeout");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    // Naša API vraća { error: "neki_string" }, ali npr. Vercel Deployment
    // Protection vraća { error: { code, message } } - ne pretpostavljati
    // da je body.error uvijek string, inače new Error(objekt) postane
    // doslovno "[object Object]".
    const message =
      typeof body?.error === "string"
        ? body.error
        : typeof body?.error?.message === "string"
          ? body.error.message
          : `request_failed_${response.status}`;
    throw new ApiError(message, response.status, body);
  }

  return response.json();
}

export type MobileRole = "owner" | "client";

export function resolveMobileRole(): Promise<{ role: MobileRole; email: string }> {
  return apiFetch("/api/auth/mobile/resolve", { method: "POST" });
}

export function requestMagicLink(role: MobileRole, email: string): Promise<{ ok: true }> {
  return apiFetch(`/api/auth/${role}/request-link`, {
    method: "POST",
    body: JSON.stringify({ email, redirectTo: "rentacarmanager://auth-callback" }),
  });
}

// --- Vozila ---
// VehicleDTO se namjerno NE importa iz "@rent-a-car/api/server" (Node-only,
// nikad ne importati u mobile/client kod - vidi CLAUDE.md) - lokalna kopija
// oblika je dovoljna, ovo je čisti DTO tip bez ikakve poslovne logike.
// "on_service" nadjačava sve ostalo (Vehicle.underService), "rented"/
// "available" se izvode iz postojanja tekućeg ugovora - isti computed status
// koji web prikazuje, backend ga već računa (server/vehicles.ts).
export type VehicleStatus = "on_service" | "rented" | "available";

export interface VehicleDTO {
  id: string;
  make: string;
  model: string;
  year: number | null;
  licensePlate: string;
  vin: string | null;
  registrationDocUrl: string | null;
  registrationExpiresAt: string | null;
  insurancePolicyUrl: string | null;
  images: { id: string; url: string }[];
  underService: boolean;
  status: VehicleStatus;
  createdAt: string;
  updatedAt: string;
}

export function listVehicles(): Promise<VehicleDTO[]> {
  return apiFetch("/api/vehicles");
}

export function getVehicle(id: string): Promise<VehicleDTO> {
  return apiFetch(`/api/vehicles/${id}`);
}

export interface VehicleCreateInput {
  make: string;
  model: string;
  year?: number;
  licensePlate: string;
  vin?: string;
  registrationExpiresAt?: string;
}

export function createVehicle(input: VehicleCreateInput): Promise<VehicleDTO> {
  return apiFetch("/api/vehicles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface VehicleUpdateInput {
  make?: string;
  model?: string;
  year?: number;
  licensePlate?: string;
  vin?: string;
  registrationExpiresAt?: string;
  underService?: boolean;
}

export function updateVehicle(id: string, input: VehicleUpdateInput): Promise<VehicleDTO> {
  return apiFetch(`/api/vehicles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// Fajl odabran preko expo-image-picker/expo-document-picker.
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

// SDK 57-ov fetch()/FormData sloj ne prepoznaje RN-ov klasični
// { uri, name, type } FormData part oblik za native fajlove - baca
// "Unsupported FormDataPart implementation" na Androidu čim se doda
// ijedan file part (vidi PROGRESS.md bug #30). expo-file-system-ov
// File.upload() gradi multipart tijelo izravno u nativnom kodu (mimo
// fetch()-a i RN-ovog FormData mosta), pa taj problem izbjegava u
// potpunosti - koristi se za sva tri upload poziva umjesto apiFetch-a.
async function uploadPickedFile<T = unknown>(
  path: string,
  file: PickedFile,
  fieldName: string,
  // Dodatna text polja poslana UZ fajl u istom multipart requestu (npr.
  // servisni zapis: datum/opis/trošak/servis + opcionalan račun u jednom
  // POST-u, isti "jedan request za formu + upload" obrazac kao web-ova
  // service-records ruta) - expo-file-system-ov File.upload() to podržava
  // izvorno preko `parameters`, nema potrebe za ručnim multipart body-jem.
  parameters?: Record<string, string>
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  let result: { status: number; body: string };
  try {
    result = await new File(file.uri).upload(`${API_BASE_URL}${path}`, {
      uploadType: UploadType.MULTIPART,
      fieldName,
      httpMethod: "POST",
      mimeType: file.mimeType || "application/octet-stream",
      headers,
      parameters,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("request_timeout");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (result.status < 200 || result.status >= 300) {
    const body = (() => {
      try {
        return JSON.parse(result.body);
      } catch {
        return null;
      }
    })();
    const message =
      typeof body?.error === "string"
        ? body.error
        : typeof body?.error?.message === "string"
          ? body.error.message
          : `request_failed_${result.status}`;
    throw new Error(message);
  }

  return JSON.parse(result.body) as T;
}

export function uploadVehicleRegistrationDoc(
  vehicleId: string,
  file: PickedFile
): Promise<VehicleDTO> {
  return uploadPickedFile(`/api/vehicles/${vehicleId}/registration-doc`, file, "file");
}

export function uploadVehicleInsurancePolicy(
  vehicleId: string,
  file: PickedFile
): Promise<VehicleDTO> {
  return uploadPickedFile(`/api/vehicles/${vehicleId}/insurance-policy`, file, "file");
}

export async function uploadVehicleImages(
  vehicleId: string,
  files: PickedFile[]
): Promise<{ id: string; url: string }[]> {
  // File.upload() šalje jedan fajl po pozivu (nema multi-file multipart u
  // ovom API-ju) - backend endpoint već podržava jedan file po requestu
  // (formData.getAll("files") radi i s jednim elementom), pa se više
  // odabranih slika šalje kao paralelni pozivi na isti endpoint.
  const results = await Promise.all(
    files.map((file) =>
      uploadPickedFile<{ id: string; url: string }[]>(`/api/vehicles/${vehicleId}/images`, file, "files")
    )
  );
  return results.flat();
}

export function deleteVehicleImage(vehicleId: string, imageId: string): Promise<void> {
  return apiFetch(`/api/vehicles/${vehicleId}/images/${imageId}`, { method: "DELETE" });
}

// --- OCR (Tier 2 backlog) ---
// Sva tri endpointa su standalone (ne vezani na vehicleId) i ne sprema
// ništa - samo vraćaju prijedlog polja za prefill, isti obrazac kao web
// (vidi apps/web/src/app/api/ocr/*). Koriste uploadPickedFile umjesto
// apiFetch-a jer i OCR pozivi šalju fajl kao multipart tijelo.
export interface RegistrationDocOcrResult {
  make?: string;
  model?: string;
  licensePlate?: string;
  vin?: string;
  rawText: string;
}

// Vanjska strana prometne - cilj isključivo registracijska oznaka.
export function ocrRegistrationDocOuter(file: PickedFile): Promise<RegistrationDocOcrResult> {
  return uploadPickedFile("/api/ocr/registration-doc-outer", file, "file");
}

// Unutarnja strana prometne - marka/model/VIN, NIKAD tablice (ta strana ih
// ne sadrži).
export function ocrRegistrationDocInner(file: PickedFile): Promise<RegistrationDocOcrResult> {
  return uploadPickedFile("/api/ocr/registration-doc-inner", file, "file");
}

export interface InsurancePolicyOcrResult {
  registrationExpiresAt?: string;
  // Pomoćni, usporedni izvor uz OCR fotografije prometne - PDF tekstualni
  // sloj police je pouzdaniji od slikovnog OCR-a (nema rizika krivog
  // čitanja znakova).
  licensePlate?: string;
  vin?: string;
  rawText: string;
}

// PDF text-parsing (ne Vision OCR) - polica je generirani dokument s pravim
// tekstualnim slojem, backend odbija sve što nije application/pdf.
export function ocrInsurancePolicy(file: PickedFile): Promise<InsurancePolicyOcrResult> {
  return uploadPickedFile("/api/ocr/insurance-policy", file, "file");
}

// --- Klijenti ---
export interface ClientRecord {
  id: string;
  firstName: string;
  lastName: string;
  oib: string;
  email: string;
  phone: string;
}

export function listClients(): Promise<ClientRecord[]> {
  return apiFetch("/api/clients");
}

export interface ClientCreateInput {
  firstName: string;
  lastName: string;
  oib: string;
  email: string;
  phone: string;
}

export function createClient(input: ClientCreateInput): Promise<ClientRecord> {
  return apiFetch("/api/clients", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Ugovori ---
export interface ContractListItem {
  id: string;
  number: number;
  vehicleId: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  closedAt: string | null;
  actualEndDate: string | null;
  vehicle: { make: string; model: string; licensePlate: string };
  client: { firstName: string; lastName: string; email: string };
  contractPdfUrl: string | null;
  protocolPdfUrl: string | null;
  latestAnnex: { status: string; newDateTo: string } | null;
  latestPhotoRequest: { requestedAt: string; fulfilledAt: string | null } | null;
}

export function listContracts(): Promise<ContractListItem[]> {
  return apiFetch("/api/contracts");
}

/**
 * Prijevremeno zatvaranje aktivnog ugovora - isti POST /api/contracts/[id]/
 * close endpoint koji owner-web koristi. Vraća ažuriran ugovor (closedAt/
 * actualEndDate postavljeni).
 */
export function closeContract(id: string): Promise<ContractListItem> {
  return apiFetch(`/api/contracts/${id}/close`, { method: "POST" });
}

export interface ActiveContractSummary {
  id: string;
  number: number;
  dateTo: string;
  client: { firstName: string; lastName: string };
}

/**
 * Tekući (aktivni, nezatvoreni) ugovor za vozilo, ili null - isti
 * GET /api/vehicles/[id]/active-contract endpoint koji web koristi za
 * upozorenje/blokadu kod izdavanja duplog ugovora.
 */
export function getVehicleActiveContract(vehicleId: string): Promise<ActiveContractSummary | null> {
  return apiFetch(`/api/vehicles/${vehicleId}/active-contract`);
}

export interface ContractCreateInput {
  vehicleId: string;
  clientId: string;
  dateFrom: string;
  dateTo: string;
  pricePerDay: number;
  pickupLocation?: string;
  odometerStart?: number;
  excessAmount?: number;
  paymentMethod?: string;
}

export function createContract(input: ContractCreateInput): Promise<ContractListItem> {
  return apiFetch("/api/contracts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Raspetlja 409 vehicle_has_active_contract grešku (POST /api/contracts) u
 * strukturirani ActiveContractSummary, ili null ako je err bilo koja druga
 * greška - isti response oblik koji web ruta vraća (server/contracts.ts).
 */
export function parseVehicleActiveContractConflict(err: unknown): ActiveContractSummary | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body as { error?: string; activeContract?: ActiveContractSummary } | null;
  return body?.error === "vehicle_has_active_contract" && body.activeContract ? body.activeContract : null;
}

export function requestContractPhotos(contractId: string): Promise<unknown> {
  return apiFetch(`/api/contracts/${contractId}/photo-requests`, { method: "POST" });
}

// --- Servisna knjižica ---
export interface ServiceRecordDTO {
  id: string;
  vehicleId: string;
  date: string;
  description: string;
  cost: number;
  provider: string | null;
  receiptUrl: string | null;
  createdAt: string;
}

export interface ServiceRecordCreateInput {
  date: string; // "YYYY-MM-DD"
  description: string;
  cost: number;
  provider?: string;
}

export function listServiceRecords(vehicleId: string): Promise<ServiceRecordDTO[]> {
  return apiFetch(`/api/vehicles/${vehicleId}/service-records`);
}

/**
 * Bez računa - obična multipart FormData s SAMO text poljima (ne file
 * part), pa RN-ov FormData most radi normalno (poznat bug pogađa isključivo
 * file partove - vidi komentar iznad uploadPickedFile). Ruta prima
 * isključivo multipart/form-data (ne JSON), pa čak i bez fajla mora ići
 * FormData tijelo.
 */
export function createServiceRecord(
  vehicleId: string,
  input: ServiceRecordCreateInput
): Promise<ServiceRecordDTO> {
  const formData = new FormData();
  formData.append("date", input.date);
  formData.append("description", input.description);
  formData.append("cost", String(input.cost));
  if (input.provider) formData.append("provider", input.provider);
  return apiFetch(`/api/vehicles/${vehicleId}/service-records`, { method: "POST", body: formData });
}

/** S računom - jedan multipart request za formu + upload (isti obrazac kao web). */
export function createServiceRecordWithReceipt(
  vehicleId: string,
  input: ServiceRecordCreateInput,
  receipt: PickedFile
): Promise<ServiceRecordDTO> {
  return uploadPickedFile(`/api/vehicles/${vehicleId}/service-records`, receipt, "receipt", {
    date: input.date,
    description: input.description,
    cost: String(input.cost),
    ...(input.provider ? { provider: input.provider } : {}),
  });
}

export function deleteServiceRecord(vehicleId: string, recordId: string): Promise<void> {
  return apiFetch(`/api/vehicles/${vehicleId}/service-records/${recordId}`, { method: "DELETE" });
}

// --- Statistika/profitabilnost ---
// Isti "prvi pokušaj" pragovi kao web (server/vehicleStats.ts) - "no_activity"
// je dodatno 4. stanje uz zeleno/žuto/crveno iz zahtjeva, za vozilo bez
// ijednog dana pod ugovorom I bez ijednog servisnog troška u razdoblju.
export type VehicleStatsStatus = "good" | "ok" | "bad" | "no_activity";

export interface VehicleStatsDTO {
  vehicleId: string;
  totalDays: number;
  rentedDays: number;
  freeDays: number;
  revenue: number;
  serviceCost: number;
  additionalCosts: number;
  profit: number;
  utilization: number;
  status: VehicleStatsStatus;
}

/** `from`/`to` su "YYYY-MM-DD" stringovi - isti `?from=&to=` obrazac kao web. */
export function getVehicleStats(vehicleId: string, from: string, to: string): Promise<VehicleStatsDTO> {
  return apiFetch(`/api/vehicles/${vehicleId}/stats?from=${from}&to=${to}`);
}

export function getFleetStats(from: string, to: string): Promise<VehicleStatsDTO[]> {
  return apiFetch(`/api/vehicles/stats?from=${from}&to=${to}`);
}

export interface StatsTimeSeriesPoint {
  label: string;
  revenue: number;
  serviceCost: number;
  additionalCosts: number;
  profit: number;
}

/** `vehicleId: null` = "sva vozila zajedno" (isti selektor kao web dashboard). */
export function getStatsTimeSeries(
  vehicleId: string | null,
  from: string,
  to: string
): Promise<StatsTimeSeriesPoint[]> {
  const vehicleParam = vehicleId ? `&vehicleId=${vehicleId}` : "";
  return apiFetch(`/api/stats/timeseries?from=${from}&to=${to}${vehicleParam}`);
}

// --- Dodatni troškovi vozila (leasing/osiguranje/kasko/ostalo) ---
export type VehicleCostType = "leasing" | "insurance" | "kasko" | "other";
export type InstallmentFrequency = "monthly" | "quarterly" | "yearly";

export interface VehicleCostDTO {
  id: string;
  vehicleId: string;
  costType: VehicleCostType;
  customType: string | null;
  amount: number;
  isInstallment: boolean;
  installmentFrequency: InstallmentFrequency | null;
  startDate: string | null;
  endDate: string | null;
  date: string | null;
}

export interface VehicleCostCreateInput {
  costType: VehicleCostType;
  customType?: string;
  amount: number;
  isInstallment: boolean;
  installmentFrequency?: InstallmentFrequency;
  startDate?: string;
  endDate?: string;
  date?: string;
}

export function listVehicleCosts(vehicleId: string): Promise<VehicleCostDTO[]> {
  return apiFetch(`/api/vehicles/${vehicleId}/costs`);
}

export function createVehicleCost(vehicleId: string, input: VehicleCostCreateInput): Promise<VehicleCostDTO> {
  return apiFetch(`/api/vehicles/${vehicleId}/costs`, { method: "POST", body: JSON.stringify(input) });
}

export function deleteVehicleCost(vehicleId: string, costId: string): Promise<void> {
  return apiFetch(`/api/vehicles/${vehicleId}/costs/${costId}`, { method: "DELETE" });
}

/**
 * On-demand PDF izvještaj - preuzima se izravno (autentificiran Bearer
 * headerom, isti obrazac kao apiFetch/uploadPickedFile) preko
 * `File.downloadFileAsync` (izvorna podrška za custom headers, vidi
 * expo-file-system 57.0.2 .d.ts - provjeren prije korištenja, ne
 * nagađanjem, isto kao svugdje drugdje u ovom fajlu). Vraća lokalni `File`
 * (u cache direktoriju) - pozivatelj ga prosljeđuje u `expo-sharing`.
 */
export async function downloadReportPdf(from: string, to: string): Promise<File> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  return File.downloadFileAsync(`${API_BASE_URL}/api/reports/pdf?from=${from}&to=${to}`, Paths.cache, {
    headers,
    idempotent: true,
  });
}

// --- Postavke tvrtke (samo periodični izvještaji - jedini dio Settings-a
// koji owner-mobile trenutno treba; ostatak Settingsa - podaci tvrtke/logo/
// uvjeti najma - ostaje web-only, izvan opsega ovog zahtjeva) ---
export type ReportFrequency = "off" | "daily" | "weekly" | "monthly" | "custom";

export interface CompanyReportSettingsDTO {
  reportFrequency: ReportFrequency;
  reportCustomIntervalDays: number | null;
  reportEmailEnabled: boolean;
  lastReportSentAt: string | null;
}

export interface CompanyReportSettingsUpdateInput {
  reportFrequency: ReportFrequency;
  reportCustomIntervalDays?: number;
  reportEmailEnabled: boolean;
}

// GET /api/settings vraća PUN CompanySettingsDTO (ime tvrtke, OIB, logo,
// itd.) - ovaj tip namjerno čita SAMO report polja koja mobile UI prikazuje
// (strukturno kompatibilno, TS ne prigovara na "višak" polja u stvarnom
// JSON odgovoru).
export function getCompanyReportSettings(): Promise<CompanyReportSettingsDTO> {
  return apiFetch("/api/settings");
}

export function updateCompanyReportSettings(
  input: CompanyReportSettingsUpdateInput
): Promise<CompanyReportSettingsDTO> {
  return apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify(input) });
}
