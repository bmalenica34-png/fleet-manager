import { createClient } from "@/lib/supabase/server";
import { listContractsForClientUser } from "@rent-a-car/api/server";

function formatDate(value: Date): string {
  return new Date(value).toLocaleDateString("hr-HR");
}

export default async function PortalPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const contracts = user ? await listContractsForClientUser(user.id) : [];

  return (
    <div>
      <h1>Moji ugovori</h1>

      {contracts.length === 0 ? (
        <p className="muted">Nema ugovora povezanih s ovim računom.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Vozilo</th>
              <th>Od</th>
              <th>Do</th>
              <th>Status</th>
              <th>Produženje</th>
              <th>Dokumenti</th>
              <th>Slike</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.vehicle.make} {c.vehicle.model} ({c.vehicle.licensePlate})
                </td>
                <td>{formatDate(c.dateFrom)}</td>
                <td>{formatDate(c.dateTo)}</td>
                <td>{c.status}</td>
                <td>
                  {c.latestAnnex ? (
                    c.latestAnnex.status === "signed" ? (
                      `Produženo do ${formatDate(c.latestAnnex.newDateTo)}`
                    ) : c.latestAnnex.status === "sent" ? (
                      <>
                        Potrebna potvrda produženja do {formatDate(c.latestAnnex.newDateTo)}
                      </>
                    ) : (
                      c.latestAnnex.status
                    )
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {c.contractPdfUrl ? (
                    <>
                      <a href={c.contractPdfUrl} target="_blank" rel="noreferrer">
                        ugovor
                      </a>
                      {" / "}
                      <a href={c.protocolPdfUrl ?? undefined} target="_blank" rel="noreferrer">
                        zapisnik
                      </a>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {c.latestPhotoRequest && !c.latestPhotoRequest.fulfilledAt ? (
                    "Zatražene slike - provjeri email za link"
                  ) : c.latestPhotoRequest?.fulfilledAt ? (
                    `Poslano ${formatDate(c.latestPhotoRequest.fulfilledAt)}`
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
