import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { principalHasPermission, resolveOwnerAppPrincipal } from "@rent-a-car/api/server";

export default async function OwnerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Owner ILI aktivan Employee - vidi resolveOwnerAppPrincipal. Deaktiviran
  // employee (ili bilo tko drugi bez zapisa) resolvea u null i vraća se na
  // login identično kao da nije ulogiran.
  const principal = await resolveOwnerAppPrincipal(user.id);
  if (!principal) {
    redirect("/login");
  }

  const canSettings = principalHasPermission(principal, "settings");
  const canInvoicing = principalHasPermission(principal, "invoicing");

  return (
    <>
      <header className="topnav">
        <a href="/" className="brand">
          Rent-a-Car Manager
        </a>
        <nav>
          <a href="/vehicles">Vozila</a>
          <a href="/clients">Klijenti</a>
          <a href="/contracts">Ugovori</a>
          <a href="/najmovi">Najmovi</a>
          {canInvoicing && <a href="/invoices">Računi</a>}
          {canSettings && <a href="/settings">Postavke</a>}
          {principal.kind === "owner" && <a href="/employees">Zaposlenici</a>}
          <form action="/api/auth/logout" method="POST" style={{ display: "inline" }}>
            <button type="submit" className="btn">
              Odjava
            </button>
          </form>
        </nav>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
