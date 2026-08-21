"use client";

import { useEffect, useState } from "react";

export default function ClientLoginPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Vidi identičan komentar u /login/page.tsx - callback preusmjerava ovamo
  // s ?error=invalid_link kad exchangeCodeForSession padne.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "invalid_link") {
      setError("Link za prijavu je istekao ili je već iskorišten. Zatraži novi.");
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/auth/client/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setSubmitting(false);

    if (!res.ok) {
      setError("Greška prilikom slanja linka. Pokušaj ponovno.");
      return;
    }

    setSent(true);
  }

  return (
    <div className="sign-shell">
      <div className="sign-card">
        <h1>Moji ugovori</h1>
        <p className="muted">Prijava putem emaila</p>

        {sent ? (
          <p>Link za prijavu je poslan na {email}. Provjeri inbox.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Slanje..." : "Pošalji link za prijavu"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
