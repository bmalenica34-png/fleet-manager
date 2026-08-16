export default function SignLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="sign-shell">{children}</div>;
}
