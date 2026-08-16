"use client";

import { useState } from "react";

export default function OwnerLoginPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/auth/owner/request-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        body?.error === "not_authorized"
          ? "Ovaj email nema pristup owner dashboardu."
          : "Greška prilikom slanja linka. Pokušaj ponovno."
      );
      return;
    }

    setSent(true);
  }

  return (
    <div className="sign-shell">
      <div className="sign-card">
        <h1>Rent-a-Car Manager</h1>
        <p className="muted">Owner login</p>

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
