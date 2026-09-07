import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

const description =
  "Hermes is a Discord RPG bot: message and voice XP, levels with role rewards, " +
  "daily streaks, a shop with equipment and consumables, player trading, quests, " +
  "achievements and turn-based combat -- all configurable from a web dashboard.";

export const metadata: Metadata = {
  title: {
    default: "Hermes — Discord RPG bot",
    template: "%s · Hermes",
  },
  description,
  applicationName: "Hermes",
  openGraph: {
    title: "Hermes — Discord RPG bot",
    description,
    siteName: "Hermes",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hermes — Discord RPG bot",
    description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
