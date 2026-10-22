import type { Metadata } from "next";
import { Marcellus } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";
import { SITE_URL } from "./lib/site";

// The heading serif, standing in for the default WoW UI's Friz Quadrata.
// next/font downloads it at build time and serves it from this app.
const display = Marcellus({ weight: "400", subsets: ["latin"], variable: "--font-marcellus" });

const description =
  "havocish is a Discord RPG bot you design yourself: turn-based combat and world bosses, " +
  "gathering and crafting minigames, gear, quests and a shop, all set up from a web dashboard. " +
  "Use its leveling, or keep the leveling bot you already have.";

export const metadata: Metadata = {
  // Makes og:url, og:image and the rest absolute, on the address that's actually served.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "havocish — Discord RPG bot",
    template: "%s · havocish",
  },
  description,
  applicationName: "havocish",
  openGraph: {
    title: "havocish — Discord RPG bot",
    description,
    siteName: "havocish",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "havocish — Discord RPG bot",
    description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
