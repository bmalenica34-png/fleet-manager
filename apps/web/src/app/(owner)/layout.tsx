import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveOwnerByUserId } from "@rent-a-car/api/server";

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

  const owner = await resolveOwnerByUserId(user.id);
  if (!owner) {
    redirect("/login");
  }

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
          <a href="/settings">Postavke</a>
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
