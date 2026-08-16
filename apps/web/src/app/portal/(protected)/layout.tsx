import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/login");
  }

  return (
    <>
      <header className="topnav">
        <a href="/portal" className="brand">
          Moji ugovori
        </a>
        <nav>
          <form action="/api/auth/logout?to=portal" method="POST" style={{ display: "inline" }}>
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
