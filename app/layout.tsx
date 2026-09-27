import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MOOV ASSIST — Collecte linguistique Fang",
  description: "Collecte vocale et textuelle Fang pour KIMBA Connect / Moov Assist",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
