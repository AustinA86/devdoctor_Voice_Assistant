import "./globals.css";

export const metadata = {
  title: "AI Voice Bot Dashboard",
  description: "Automated Customer Order Confirmation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}