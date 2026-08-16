export default function ExtendLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="sign-shell">{children}</div>;
}
