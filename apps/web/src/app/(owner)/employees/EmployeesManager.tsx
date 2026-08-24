"use client";

import { useEffect, useState } from "react";
import { PERMISSION_MODULES, type PermissionModule } from "@rent-a-car/api";
import type { EmployeeDTO } from "@rent-a-car/api/server";

const MODULE_LABELS: Record<PermissionModule, string> = {
  contracts: "Izdavanje ugovora",
  vehicles: "Unos vozila",
  clients: "Unos klijenata",
  invoicing: "Izdavanje računa (R1/R2)",
  settings: "Uređivanje postavki firme",
};

export default function EmployeesManager() {
  const [employees, setEmployees] = useState<EmployeeDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [newPermissions, setNewPermissions] = useState<Set<PermissionModule>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // employeeId koji je trenutno u tijeku spremanja (checkbox/status toggle) -
  // sprječava dvostruki klik dok prethodni PATCH ne završi, disabla samo
  // redak koji se sprema, ne cijelu listu.
  const [savingId, setSavingId] = useState<string | null>(null);

  function loadEmployees() {
    fetch("/api/employees")
      .then((res) => res.json())
      .then((data: EmployeeDTO[]) => {
        setEmployees(data);
        setLoading(false);
      });
  }

  useEffect(loadEmployees, []);

  function toggleNewPermission(module: PermissionModule) {
    setNewPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }

  async function handleAddEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        permissions: Array.from(newPermissions),
      }),
    });

    setSubmitting(false);
    if (!res.ok) {
      setError("Greška prilikom dodavanja zaposlenika (email možda već postoji).");
      return;
    }

    setFirstName("");
    setLastName("");
    setEmail("");
    setNewPermissions(new Set());
    loadEmployees();
  }

  async function togglePermission(employee: EmployeeDTO, module: PermissionModule) {
    setSavingId(employee.id);
    const has = employee.permissions.includes(module);
    const permissions = has
      ? employee.permissions.filter((m) => m !== module)
      : [...employee.permissions, module];

    const res = await fetch(`/api/employees/${employee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions }),
    });

    setSavingId(null);
    if (res.ok) {
      const updated: EmployeeDTO = await res.json();
      setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    }
  }

  async function toggleStatus(employee: EmployeeDTO) {
    setSavingId(employee.id);
    const status = employee.status === "active" ? "deactivated" : "active";

    const res = await fetch(`/api/employees/${employee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    setSavingId(null);
    if (res.ok) {
      const updated: EmployeeDTO = await res.json();
      setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    }
  }

  if (loading) return <p className="muted">Učitavanje...</p>;

  return (
    <div>
      <h1>Zaposlenici</h1>
      <p className="muted" style={{ margin: "0.25rem 0 1.5rem" }}>
        Zaposlenik se prijavljuje na istoj /login stranici kao vlasnik (magic
        link) - nakon što ga dodaš ovdje, javi mu da se prijavi svojim
        emailom. Vlasnik uvijek ima pristup svemu.
      </p>

      <div style={{ marginBottom: "2rem", padding: "1rem", border: "1px solid var(--border, #ddd)", borderRadius: "8px" }}>
        <h2 style={{ marginTop: 0 }}>Dodaj zaposlenika</h2>
        <form onSubmit={handleAddEmployee}>
          <label>
            Ime
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </label>
          <label>
            Prezime
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>

          <fieldset style={{ marginTop: "0.75rem", border: "none", padding: 0 }}>
            <legend className="muted">Permisije</legend>
            {PERMISSION_MODULES.map((module) => (
              <label key={module} style={{ display: "block", fontWeight: "normal" }}>
                <input
                  type="checkbox"
                  checked={newPermissions.has(module)}
                  onChange={() => toggleNewPermission(module)}
                  style={{ marginRight: "0.5rem" }}
                />
                {MODULE_LABELS[module]}
              </label>
            ))}
          </fieldset>

          {error && <p className="error">{error}</p>}

          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ marginTop: "0.75rem" }}>
            {submitting ? "Dodavanje..." : "Dodaj zaposlenika"}
          </button>
        </form>
      </div>

      <h2>Popis zaposlenika</h2>
      {employees.length === 0 && <p className="muted">Nema dodanih zaposlenika.</p>}
      {employees.map((employee) => (
        <div
          key={employee.id}
          style={{
            marginBottom: "1rem",
            padding: "1rem",
            border: "1px solid var(--border, #ddd)",
            borderRadius: "8px",
            opacity: employee.status === "deactivated" ? 0.6 : 1,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>
                {employee.firstName} {employee.lastName}
              </strong>{" "}
              <span className="muted">({employee.email})</span>
              {employee.status === "deactivated" && (
                <span className="muted"> - deaktiviran</span>
              )}
            </div>
            <button
              className="btn"
              onClick={() => toggleStatus(employee)}
              disabled={savingId === employee.id}
            >
              {employee.status === "active" ? "Deaktiviraj" : "Aktiviraj"}
            </button>
          </div>

          <div style={{ marginTop: "0.5rem" }}>
            {PERMISSION_MODULES.map((module) => (
              <label key={module} style={{ display: "inline-block", marginRight: "1.5rem", fontWeight: "normal" }}>
                <input
                  type="checkbox"
                  checked={employee.permissions.includes(module)}
                  onChange={() => togglePermission(employee, module)}
                  disabled={savingId === employee.id || employee.status === "deactivated"}
                  style={{ marginRight: "0.4rem" }}
                />
                {MODULE_LABELS[module]}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
