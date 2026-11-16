"use client";

import pack from "@content/packs/classic-fantasy.json";
import { D, DButton, DiscordMessage, Sub } from "@/app/components/ui/discordMock";

/*
 * Small look-alikes of what havocish posts in Discord, for the features page.
 * They read their words and loot from the Classic Fantasy pack, so the page
 * shows the bot's real content rather than copy written for the site.
 */



/**
 * A fight in progress, as /fight shows it: the enemy's next move as the
 * headline, the scene the bot draws (a real render), and the player's moves.
 */
export function FightMock() {
  const wolf = (pack.content.combat.enemies as Record<string, { name: string; emoji: string }>)["dire-wolf"]!;
  return (
    <DiscordMessage>
      <p className="font-semibold text-white">⚔️ Wren vs {wolf.emoji} {wolf.name}</p>
      <p className="mt-1 font-semibold" style={{ color: "#f0c0b0" }}>❗ {wolf.name} bares its fangs and lunges…</p>
      <p className="mt-1 text-sm">🩸 <b>Wren</b> used <b>Rend</b>: <b>24</b> damage · 🩸 {wolf.name} Bleeding</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- the bot's real render */}
      <img src="/showcase/battle.png" width={1280} height={500} alt={`A battle scene against the ${wolf.name}`} className="mt-2 h-auto w-full rounded-[3px]" />
      <Sub>Round 3 · ⚡ {wolf.name} is faster: it acts first</Sub>
      <div className="mt-3 flex flex-wrap gap-2">
        <DButton colour="blurple">⚔️ Attack</DButton>
        <DButton disabled>🩸 Rend (2)</DButton>
        <DButton>🗡️ Execute</DButton>
        <DButton>🛡️ Guard</DButton>
        <DButton colour="red">🏃 Flee</DButton>
      </div>
      <div className="mt-2 flex gap-2">
        <DButton colour="green">🙋 Join (1/3)</DButton>
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
