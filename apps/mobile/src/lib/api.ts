import { File, UploadType } from "expo-file-system";
import { supabase } from "./supabase";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL!;
const DEFAULT_TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 30000;

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
    throw new Error(message);
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
  createdAt: string;
  updatedAt: string;
}

export function listVehicles(): Promise<VehicleDTO[]> {
  return apiFetch("/api/vehicles");
}

export function getVehicle(id: string): Promise<VehicleDTO> {
  return apiFetch(`/api/vehicles/${id}`);
}

export interface VehicleUpdateInput {
  make?: string;
  model?: string;
  year?: number;
  licensePlate?: string;
  vin?: string;
  registrationExpiresAt?: string;
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
  fieldName: string
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

export function requestContractPhotos(contractId: string): Promise<unknown> {
  return apiFetch(`/api/contracts/${contractId}/photo-requests`, { method: "POST" });
}
