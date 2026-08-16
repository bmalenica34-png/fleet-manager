export default function RequestPhotosLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="sign-shell">{children}</div>;
}
