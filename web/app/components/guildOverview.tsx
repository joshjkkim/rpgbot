"use client";

import Link from "next/link";
import { Coins, FileText, Palette, ScrollText, Sparkles, Swords, TrendingUp, Trophy } from "lucide-react";
import { useGuildConfig } from "@/app/hooks/useGuildConfig";

const ICONS = {
  xp: Sparkles,
  levels: TrendingUp,
  shop: Coins,
  combat: Swords,
  quests: ScrollText,
  achievements: Trophy,
  styles: Palette,
  logging: FileText,
} as const;

function count(record: unknown): number {
  return record && typeof record === "object" ? Object.keys(record).length : 0;
}

type Card = {
  href: string;
  title: string;
  /** null when the section has no on/off switch of its own. */
  enabled: boolean | null;
  lines: string[];
};

function buildCards(config: any): Card[] {
  const xp = config?.xp ?? {};
  const levels = config?.levels ?? {};
  const shop = config?.shop ?? {};
  const combat = config?.combat ?? {};
  const quests = config?.quests ?? {};
  const achievements = config?.achievements ?? {};
  const style = config?.style ?? {};
  const logging = config?.logging ?? {};

  const activeLogCategories = Object.values(logging.allowedCategories ?? {}).filter(
    (v) => v !== false
  ).length;

  return [
    {
      href: "xp",
      title: "XP",
      enabled: null,
      lines: [
        `${xp.basePerMessage ?? 0} XP per message, ${xp.xpMessageCooldown ?? 0}s cooldown`,
        xp.vc?.enabled ? `Voice XP on, ${xp.vc.basePerMinute ?? 0}/min` : "Voice XP off",
        `Daily ${xp.dailyXp ?? 0} XP + ${xp.dailyGold ?? 0} gold`,
      ],
    },
    {
      href: "levels",
      title: "Levels",
      enabled: null,
      lines: [
        `${levels.curveType ?? "linear"} curve`,
        levels.maxLevel ? `Max level ${levels.maxLevel}` : "No level cap",
        `${count(levels.levelActions)} level(s) with actions`,
      ],
    },
    {
      href: "shop",
      title: "Economy",
      enabled: shop.enabled ?? false,
      lines: [
        `${count(shop.items)} item(s) in ${count(shop.categories)} category(ies)`,
        shop.gifting?.enabled ? "Gifting enabled" : "Gifting disabled",
      ],
    },
    {
      href: "combat",
      title: "Combat",
      enabled: combat.enabled ?? false,
      lines: [
        `${count(combat.enemies)} enemy type(s)`,
        `${combat.hpBase ?? 0} base HP, +${combat.hpPerLevel ?? 0}/level`,
        combat.pvp?.enabled
          ? `Duels on, ${combat.pvp.rakePercent ?? 0}% rake`
          : "Duels off",
      ],
    },
    {
      href: "quests",
      title: "Quests",
      enabled: quests.enabled ?? false,
      lines: [
        `${count(quests.quests)} quest(s) defined`,
        quests.announceAllId ? "Announces completions" : "No announce channel",
      ],
    },
    {
      href: "achievements",
      title: "Achievements",
      enabled: achievements.enabled ?? false,
      lines: [
        `${count(achievements.achievements)} achievement(s) defined`,
        achievements.announceAllId ? "Announces unlocks" : "No announce channel",
      ],
    },
    {
      href: "styles",
      title: "Style",
      enabled: null,
      lines: [
        `${style.template ?? "default"} profile template`,
        `Currency: ${style.gold?.name ?? "Gold"} ${style.gold?.icon ?? ""}`.trim(),
      ],
    },
    {
      href: "logging",
      title: "Logging",
      enabled: logging.enabled ?? false,
      lines: [
        `${activeLogCategories} categor(ies) recorded`,
        logging.mainChannelId ? "Main channel set" : "No main channel",
      ],
    },
  ];
}

function StatusPill({ enabled }: { enabled: boolean | null }) {
  if (enabled === null) return null;

  return (
    <span
      className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        enabled
          ? "bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-[var(--accent)]/40"
          : "bg-white/[0.04] text-[var(--muted)] ring-1 ring-[var(--border)]"
      }`}
    >
      {enabled ? "On" : "Off"}
    </span>
  );
}

export default function GuildOverview({ guildId }: { guildId: string }) {
  const { config, guild, loading, error } = useGuildConfig(guildId);

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">
        {error}
      </div>
    );
  }

  const cards = buildCards(config);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4 rounded-2xl border border-[var(--accent)]/25 bg-[var(--surface)]/90 p-5 shadow-[0_20px_60px_-30px_var(--accent)]">
        {guild.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={guild.iconUrl}
            alt=""
            className="h-14 w-14 rounded-full object-cover ring-2 ring-[var(--accent)]/50 ring-offset-2 ring-offset-[var(--surface)]"
          />
        ) : (
          <div className="h-14 w-14 rounded-full bg-[var(--border)] ring-2 ring-[var(--accent)]/50 ring-offset-2 ring-offset-[var(--surface)]" />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {guild.name ?? "Server"}
          </h1>
          <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">{guildId}</p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = ICONS[card.href as keyof typeof ICONS];
          return (
          <Link
            key={card.href}
            href={`/dashboard/${guildId}/${card.href}`}
            className="group rounded-xl border border-[var(--border)] bg-[var(--surface)]/90 p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)]/60"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/12 text-[var(--accent)] ring-1 ring-[var(--accent)]/25 transition group-hover:bg-[var(--accent)]/20">
                <Icon size={16} />
              </span>
              <h2 className="font-semibold">{card.title}</h2>
              <StatusPill enabled={card.enabled} />
            </div>
            <ul className="mt-2 space-y-1">
              {card.lines.map((line) => (
                <li key={line} className="text-sm text-[var(--muted)]">
                  {line}
                </li>
              ))}
            </ul>
          </Link>
          );
        })}
      </div>
    </div>
  );
}
