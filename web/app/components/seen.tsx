"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Tells /admin which dashboard page was opened (see the seen route). Renders nothing. */
export default function Seen({ guildId }: { guildId: string }) {
  const path = usePathname();
  useEffect(() => {
    const page = path.split(`/dashboard/${guildId}`)[1]?.replace(/^\//, "") || "overview";
    navigator.sendBeacon?.(`/api/discord/guilds/${guildId}/seen`, page);
  }, [path, guildId]);
  return null;
}
