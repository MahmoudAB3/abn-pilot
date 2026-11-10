import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/layout/providers";

export const metadata: Metadata = {
  title: { default: "ABNSoft Pilotage", template: "%s · ABNSoft Pilotage" },
  description: "Pilotez vos projets, de l'idée à la livraison.",
  applicationName: "ABNSoft Pilotage",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0a3b91" },
    { media: "(prefers-color-scheme: dark)", color: "#0f2250" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <Providers nonce={nonce} locale="fr">
          {children}
        </Providers>
      </body>
    </html>
  );
}
