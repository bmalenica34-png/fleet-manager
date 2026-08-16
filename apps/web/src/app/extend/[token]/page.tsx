"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";

interface AnnexSummary {
  currentDateTo: string;
  proposedNewDateTo: string;
  vehicle: { make: string; model: string; licensePlate: string };
  client: { firstName: string; lastName: string };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("hr-HR");
}

function toDateInputValue(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

export default function ExtendWizardPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [annex, setAnnex] = useState<AnnexSummary | null>(null);
  const [newDateTo, setNewDateTo] = useState("");
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const sigCanvasRef = useRef<SignatureCanvas>(null);

  useEffect(() => {
    fetch(`/api/annex/${token}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || body.status !== "ok") {
          setErrorReason(body.status ?? "invalid");
          setLoadState("error");
          return;
        }
        setAnnex(body.annex);
        setNewDateTo(toDateInputValue(body.annex.proposedNewDateTo));
        setLoadState("ready");
      })
      .catch(() => {
        setErrorReason("invalid");
        setLoadState("error");
      });
  }, [token]);

  function handleClearSignature() {
    sigCanvasRef.current?.clear();
    setSignatureEmpty(true);
  }

  async function handleSubmit() {
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      setSubmitError("Potpis je obavezan.");
      return;
    }
    if (!newDateTo) {
      setSubmitError("Odaberi novi datum povrata.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const signature = sigCanvasRef.current.getCanvas().toDataURL("image/png");

    const res = await fetch(`/api/annex/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newDateTo, signature }),
    });

    setSubmitting(false);

    if (!res.ok) {
      setSubmitError("Greška prilikom slanja. Pokušaj ponovno.");
      return;
    }

    setSuccess(true);
  }

  if (loadState === "loading") {
    return <p className="muted">Učitavanje...</p>;
  }

  if (loadState === "error") {
    const message =
      errorReason === "already_signed"
        ? "Ovo produženje je već potpisano. Hvala!"
        : errorReason === "expired"
        ? "Link za produženje je istekao. Kontaktiraj najmodavca."
        : "Link za produženje nije važeći.";
    return (
      <div className="sign-card">
        <p>{message}</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="sign-card">
        <h1>Hvala!</h1>
        <p>Produženje najma je potpisano. Aneks ugovora stiže na email uskoro.</p>
      </div>
    );
  }

  if (!annex) return null;

  return (
    <div>
      <div className="sign-card" style={{ marginBottom: "1rem" }}>
        <h1>
          {annex.vehicle.make} {annex.vehicle.model} ({annex.vehicle.licensePlate})
        </h1>
        <p className="muted">
          {annex.client.firstName} {annex.client.lastName}
        </p>
        <p className="muted">Trenutni datum povrata: {formatDate(annex.currentDateTo)}</p>
      </div>

      <div className="sign-card">
        <h2>Produženje najma</h2>
        <form>
          <label>
            Novi datum povrata
            <input
              type="date"
              value={newDateTo}
              onChange={(e) => setNewDateTo(e.target.value)}
              required
            />
          </label>
        </form>

        <h2 style={{ marginTop: "1.5rem" }}>Potpis</h2>
        <SignatureCanvas
          ref={sigCanvasRef}
          canvasProps={{ className: "signature-pad", height: 200 }}
          onEnd={() => setSignatureEmpty(Boolean(sigCanvasRef.current?.isEmpty()))}
        />
        <button className="btn" onClick={handleClearSignature} style={{ marginTop: "0.5rem" }}>
          Obriši potpis
        </button>

        {submitError && <p className="error">{submitError}</p>}

        <div className="step-actions">
          <span />
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || signatureEmpty}
          >
            {submitting ? "Slanje..." : "Potpiši produženje"}
          </button>
        </div>
      </div>
    </div>
  );
}
