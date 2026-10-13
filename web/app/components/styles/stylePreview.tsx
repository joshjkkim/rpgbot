"use client";

import { useEffect, useState } from "react";
import { Section } from "@/app/components/ui/form";

type Kind = "profile" | "levelup";
type Shot = { url: string | null; failed: boolean };

/**
 * The real profile card and level-up banner, redrawn by the bot as the style
 * changes. Waits for a pause in edits so dragging a colour picker sends one
 * request, not fifty.
 */
export default function StylePreview({ guildId, style }: { guildId: string; style: unknown }) {
  const [shots, setShots] = useState<Record<Kind, Shot>>({
    profile: { url: null, failed: false },
    levelup: { url: null, failed: false },
  });
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(style ?? {});

  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      const load = async (kind: Kind): Promise<Shot> => {
        const res = await fetch(`/api/discord/guilds/${guildId}/preview`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, style: JSON.parse(key) }),
          signal: abort.signal,
        }).catch(() => null);
        if (!res?.ok) return { url: null, failed: true };
        return { url: URL.createObjectURL(await res.blob()), failed: false };
      };
      const [profile, levelup] = await Promise.all([load("profile"), load("levelup")]);
      if (abort.signal.aborted) return;
      setShots((prev) => {
        for (const s of Object.values(prev)) if (s.url) URL.revokeObjectURL(s.url);
        return { profile, levelup };
      });
      setLoading(false);
    }, 500);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [guildId, key]);

  const allFailed = shots.profile.failed && shots.levelup.failed;

  return (
    <Section
      title="Preview"
      description="Your own card, drawn by the bot with the settings above. Save to use them in Discord."
    >
      {allFailed ? (
        <p className="text-sm text-[var(--muted)]">Previews are unavailable right now.</p>
      ) : (
        <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {(["profile", "levelup"] as const).map((kind) => (
            <figure key={kind}>
              <figcaption className="mb-1.5 text-xs text-[var(--muted)]">
                {kind === "profile" ? "/profile" : "Level-up announcement"}
              </figcaption>
              {shots[kind].url ? (
                // eslint-disable-next-line @next/next/no-img-element -- a blob URL, nothing for next/image to optimise
                <img src={shots[kind].url!} alt={kind === "profile" ? "Profile card preview" : "Level-up banner preview"}
                  className={`h-auto w-full ${kind === "levelup" ? "max-w-[560px]" : "max-w-[640px]"}`} />
              ) : (
                <div className={`animate-pulse rounded-sm bg-black/30 ${kind === "levelup" ? "aspect-[4/1] max-w-[560px]" : "aspect-[1100/420] max-w-[640px]"}`} />
              )}
            </figure>
          ))}
        </div>
      )}
    </Section>
  );
}
