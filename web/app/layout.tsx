import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinPulse — Personal Market Intelligence",
  description: "A private AI-powered portfolio dashboard for live prices, news, risk and market intelligence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
