"use client";

import { useState } from "react";
import pack from "@/app/lib/packs/classic-fantasy.json";
import { D, DButton, DiscordMessage, Sub } from "@/app/components/ui/discordMock";

/*
 * Small look-alikes of what havocish posts in Discord, for the features page.
 * They read their words and loot from the Classic Fantasy pack, so the page
 * shows the bot's real content rather than copy written for the site.
 */

type Item = { name: string; emoji?: string; rarity?: string };
const ITEMS = pack.content.shop.items as Record<string, Item>;


/** A fight in progress, as /fight shows it. */
export function FightMock() {
  const enemy = (pack.content.combat.enemies as Record<string, { name: string; emoji: string; hp: number }>)["grey-wolf"]!;
  const bar = (n: number) => "▰".repeat(n) + "▱".repeat(10 - n);
  return (
    <DiscordMessage>
      <p className="font-semibold text-white">⚔️ {enemy.emoji} {enemy.name} · Round 3</p>
      <p className="mt-1">Your <b>Iron Sword</b> hits for <b>14</b>. The {enemy.name} bites back for <b>6</b>.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-white">You</p><p className="font-mono">{bar(7)}</p><Sub>❤️ 84 / 120</Sub></div>
        <div><p className="text-white">{enemy.name}</p><p className="font-mono">{bar(3)}</p><Sub>❤️ 19 / {enemy.hp}</Sub></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <DButton colour="red">⚔️ Attack</DButton>
        <DButton>🧪 Minor Healing Draught ×2</DButton>
        <DButton>🏃 Flee</DButton>
      </div>
    </DiscordMessage>
  );
}

/** The quest log, as /quests shows it, with one hunting quest half done. */
export function QuestMock() {
  const quests = pack.content.quests.quests as Record<string, { name: string; description: string }>;
  const wolf = quests["wolf-problem"]!;
  const daily = quests["daily-hunt"]!;
  return (
    <DiscordMessage>
      <p className="font-semibold text-white">📜 Quest log</p>
      <div className="mt-2 space-y-3">
        <div>
          <p className="text-white">{wolf.name} <span className="text-xs" style={{ color: D.muted }}>· weekly</span></p>
          <Sub>{wolf.description}</Sub>
          <p className="mt-1 text-sm">Defeat Grey Wolf · <span className="font-mono">▰▰▰▰▰▰▱▱▱▱</span> 6 / 10</p>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-white">{daily.name} <span className="text-xs" style={{ color: D.muted }}>· daily</span></p>
            <Sub>Ready to claim: 100 XP · 50 gold</Sub>
          </div>
          <DButton colour="green">🎁 Claim</DButton>
        </div>
      </div>
    </DiscordMessage>
  );
}

type Activity = {
  name: string; emoji: string; skillName: string;
  words: Record<string, string>;
  locations: Record<string, { name: string; emoji: string; loot: Array<{ itemId: string; chance: number }>; difficulty: Record<string, number> }>;
};
const MINING = (pack.content as unknown as { gathering: { activities: Record<string, Activity> } }).gathering.activities.mining!;
const SHALLOW = MINING.locations["shallow-mine"]!;

/**
 * The same grid minigame, worded two ways. A sci-fi server's "Salvage" is
 * nothing but different words over the identical game, which is the point.
 */
const THEMES = {
  mining: {
    label: "Classic Fantasy: Mining",
    title: `${MINING.emoji} ${MINING.name} · ${SHALLOW.emoji} ${SHALLOW.name}`,
    words: MINING.words,
    finds: SHALLOW.loot.map((l) => ({ name: ITEMS[l.itemId]?.name ?? l.itemId, emoji: ITEMS[l.itemId]?.emoji ?? "✨", chance: l.chance })),
  },
  salvage: {
    label: "A sci-fi server: Salvage",
    title: "🛰️ Salvage · 🚀 Derelict Freighter",
    words: { tile: "▒", hazard: "🚨", hazardLine: "Alarm tripped! You bail out with half the haul.", leave: "Undock", tries: "cuts", verb: "salvaged" },
    finds: [
      { name: "Scrap Plating", emoji: "🔩", chance: 50 },
      { name: "Power Cell", emoji: "🔋", chance: 40 },
      { name: "Nav Core", emoji: "💾", chance: 10 },
    ],
  },
} as const;
type Theme = keyof typeof THEMES;

function newGrid() {
  const cells = [...Array(7).fill("find"), "hazard", ...Array(8).fill("empty")] as Array<"find" | "hazard" | "empty">;
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  return { cells, shown: Array<number | null>(16).fill(null), tries: 5, haul: {} as Record<number, number>, end: null as null | "hazard" | "done" };
}

/** Index of one entry, weighted by `chance`, like the bot's loot roll. */
function weightedPick(finds: ReadonlyArray<{ chance: number }>) {
  let r = Math.random() * finds.reduce((s, f) => s + f.chance, 0);
  let pick = 0;
  while (pick < finds.length - 1 && r >= finds[pick]!.chance) r -= finds[pick++]!.chance;
  return pick;
}

/** A playable copy of the Grid minigame: five swings, finds from the Shallow Mine's loot table, one cave-in. */
export function GatherDemo() {
  const [theme, setTheme] = useState<Theme>("mining");
  const [g, setG] = useState(newGrid);
  const t = THEMES[theme];
  const w = t.words;

  function swing(i: number) {
    if (g.end || g.shown[i] != null) return;
    const next = { ...g, shown: [...g.shown], haul: { ...g.haul }, tries: g.tries - 1 };
    if (g.cells[i] === "hazard") {
      next.shown[i] = -2;
      for (const k of Object.keys(next.haul)) next.haul[+k] = Math.ceil(next.haul[+k]! / 2);
      next.end = "hazard";
    } else if (g.cells[i] === "find") {
      const pick = weightedPick(t.finds);
      next.shown[i] = pick;
      next.haul[pick] = (next.haul[pick] ?? 0) + 1;
    } else {
      next.shown[i] = -1;
    }
    if (!next.end && next.tries <= 0) next.end = "done";
    setG(next);
  }

  const haul = Object.entries(g.haul).filter(([, n]) => n > 0).map(([k, n]) => `${t.finds[+k]!.emoji} ${t.finds[+k]!.name} ×${n}`).join(", ");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Wording">
        {(Object.keys(THEMES) as Theme[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTheme(k)}
            aria-pressed={theme === k}
            className={`rounded-sm border px-3 py-1.5 text-sm transition-colors ${theme === k ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--gold)]" : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"}`}
          >
            {THEMES[k].label}
          </button>
        ))}
      </div>

      <DiscordMessage time="Today at 21:20">
        {g.end ? (
          <div className="space-y-1">
            {g.end === "hazard" && <p>{w.hazard} {w.hazardLine}</p>}
            <p>@you {w.verb} {haul || "nothing"} at {t.title.split(" · ")[1]}.</p>
            <Sub>+15 {theme === "mining" ? "Mining" : "Salvaging"} XP</Sub>
            <div className="pt-2"><DButton colour="blurple" onClick={() => setG(newGrid())}>Play again</DButton></div>
          </div>
        ) : (
          <>
            <p className="font-semibold text-white">{t.title}</p>
            <p className="text-sm">Found: {haul || "nothing yet"}</p>
            <p className="mb-2 text-sm"><b>{g.tries}</b> {w.tries} left</p>
            <div className="grid w-fit grid-cols-4 gap-1.5">
              {g.cells.map((cell, i) => {
                const s = g.shown[i];
                const label = s == null ? w.tile : s === -1 ? "·" : s === -2 ? w.hazard : t.finds[s]!.emoji;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => swing(i)}
                    disabled={s != null}
                    aria-label={s == null ? "Hidden tile" : label}
                    className="h-9 w-12 rounded-[3px] text-base text-white transition-[filter] enabled:hover:brightness-110"
                    style={{ background: s == null ? D.grey : cell === "find" ? D.green : cell === "hazard" ? D.red : D.grey, opacity: s === -1 ? 0.6 : 1 }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2"><DButton colour="red" onClick={() => setG({ ...g, end: "done" })}>{w.leave}</DButton></div>
          </>
        )}
      </DiscordMessage>
      <p className="text-xs text-[var(--muted)]">Go on, take a few swings. This is the real game, worded by its pack.</p>
    </div>
  );
}
