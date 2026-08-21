import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinPulse — The market, distilled",
  description: "A free, open-source AI agent that turns portfolio news into one calm daily brief.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
