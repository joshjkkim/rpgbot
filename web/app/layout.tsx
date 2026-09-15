import type { Metadata } from "next";
import { Marcellus } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

// The heading serif, standing in for the default WoW UI's Friz Quadrata.
// next/font downloads it at build time and serves it from this app.
const display = Marcellus({ weight: "400", subsets: ["latin"], variable: "--font-marcellus" });

const description =
  "havocish is a Discord RPG bot: message and voice XP, levels with role rewards, " +
  "daily streaks, a shop with equipment and consumables, player trading, quests, " +
  "achievements and turn-based combat -- all configurable from a web dashboard.";

export const metadata: Metadata = {
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
