"use client";

import { useState } from "react";

const CSV_HEADERS = ["marka", "model", "godina", "VIN", "registarska tablica", "istek registracije"];

interface ImportedRow {
  rowNumber: number;
  vehicleId: string;
  make: string;
  model: string;
  licensePlate: string;
  incomplete: boolean;
  reasons: string[];
}

interface SkippedRow {
  rowNumber: number;
  reason: string;
}

interface ImportResult {
  importedCount: number;
  incompleteCount: number;
  skippedCount: number;
  imported: ImportedRow[];
  skipped: SkippedRow[];
}

function downloadCsvTemplate() {
  const csv = CSV_HEADERS.join(",") + "\n";
  // BOM zbog Excela na Windows - bez njega dijakritika u budućim redcima
  // (marka/model mogu sadržavati č/ć/š/ž) zna se krivo prikazati.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "vozila-predlozak.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function VehiclesImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleImport() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/vehicles/import-csv", { method: "POST", body: formData });

    setUploading(false);
    if (!res.ok) {
      setError("Greška prilikom uvoza. Provjeri format CSV datoteke.");
      return;
    }
    setResult(await res.json());
    setFile(null);
  }

  return (
    <div>
      <div className="toolbar">
        <h1>Uvoz vozila (CSV)</h1>
        <a className="btn" href="/vehicles">
          ← Natrag na vozila
        </a>
      </div>

      <p className="muted" style={{ margin: "0.25rem 0 1rem" }}>
        Marka, model i registarska tablica su obavezni (tablica ne smije nedostajati - vozilo se
        bez nje ne može uvesti). Godina, VIN i datum isteka registracije su opcionalni - ako
        nedostaju ili su u krivom formatu, vozilo se svejedno uveze, samo označeno kao nepotpuno.
        CSV uvoz ne uključuje dokumente (prometnu, policu) - te se dodaju naknadno na stranici
        vozila.
      </p>

      <button type="button" className="btn" onClick={downloadCsvTemplate}>
        Preuzmi CSV predložak
      </button>

      <div style={{ marginTop: "1.5rem" }}>
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleImport}
            disabled={uploading}
            style={{ marginLeft: "0.5rem" }}
          >
            {uploading ? "Uvoženje..." : "Uvezi"}
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {result && (
        <div style={{ marginTop: "1.5rem" }}>
          <p>
            <strong>
              {result.importedCount} vozila uvezeno
              {result.incompleteCount > 0 && ` (od toga ${result.incompleteCount} nepotpunih — pogledaj oznake)`}
            </strong>
            {result.skippedCount > 0 && `, ${result.skippedCount} redova preskočeno zbog duplikata/grešaka`}.
          </p>

          {result.imported.some((r) => r.incomplete) && (
            <>
              <h3>Nepotpuna vozila</h3>
              <table>
                <thead>
                  <tr>
                    <th>Redak</th>
                    <th>Vozilo</th>
                    <th>Razlog</th>
                  </tr>
                </thead>
                <tbody>
                  {result.imported
                    .filter((r) => r.incomplete)
                    .map((r) => (
                      <tr key={r.vehicleId}>
                        <td>{r.rowNumber}</td>
                        <td>
                          <a href={`/vehicles/${r.vehicleId}`}>
                            {r.make} {r.model} ({r.licensePlate})
                          </a>
                        </td>
                        <td>{r.reasons.join(", ")}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}

          {result.skipped.length > 0 && (
            <>
              <h3 style={{ marginTop: "1.5rem" }}>Preskočeni redovi</h3>
              <table>
                <thead>
                  <tr>
                    <th>Redak</th>
                    <th>Razlog</th>
                  </tr>
                </thead>
                <tbody>
                  {result.skipped.map((s) => (
                    <tr key={s.rowNumber}>
                      <td>{s.rowNumber}</td>
                      <td>{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
