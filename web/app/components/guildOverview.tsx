"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import QuestLog from "@/app/components/questLog";
import HealthPanel from "@/app/components/healthPanel";
import { Sprite } from "@/app/components/ui/sprite";
import type { SpriteName } from "@/app/sprites";

type Row = {
  href: string;
  title: string;
  sprite: SpriteName;
  /** null when the feature has no on/off switch of its own. */
  enabled: boolean | null;
  summary: string;
};

function count(record: unknown): number {
  return record && typeof record === "object" ? Object.keys(record).length : 0;
}

/** "1 item", "3 items", "2 categories". */
function n(amount: number, one: string, many = `${one}s`) {
  return `${amount} ${amount === 1 ? one : many}`;
}

/** Each feature as one plain sentence, so the page reads as a status report, not a grid of numbers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the config is untyped JSON from the API
function describe(config: Record<string, any>): Row[] {
  const { xp = {}, levels = {}, shop = {}, combat = {}, quests = {}, achievements = {}, style = {}, logging = {}, gathering = {} } = config ?? {};
  const xpName = style.xp?.name || "XP";
  const goldName = style.gold?.name || "gold";

  const enemies = Object.values(combat.enemies ?? {}) as Array<{ boss?: boolean }>;
  const bosses = enemies.filter((e) => e.boss).length;
  const loggedKinds = Object.values(logging.allowedCategories ?? {}).filter((v) => v !== false).length;

  return [
    {
      href: "xp", title: "XP", sprite: "potion", enabled: null,
      summary: [
        `${xp.basePerMessage ?? 0} ${xpName} per message${xp.xpMessageCooldown ? `, at most once every ${xp.xpMessageCooldown}s` : ""}`,
        xp.vc?.enabled ? `voice gives ${xp.vc.basePerMinute ?? 0} a minute` : "no voice XP",
        `daily reward of ${xp.dailyXp ?? 0} ${xpName} and ${xp.dailyGold ?? 0} ${goldName}`,
      ].join(", ") + ".",
    },
    {
      href: "levels", title: "Levels", sprite: "star", enabled: null,
      summary: [
        `${levels.curveType ?? "linear"} curve`,
        levels.maxLevel ? `up to level ${levels.maxLevel}` : "no level cap",
        count(levels.levelActions) ? `rewards at ${n(count(levels.levelActions), "level")}` : "no level rewards yet",
      ].join(", ") + ".",
    },
    {
      href: "shop", title: "Economy", sprite: "coin", enabled: !!shop.enabled,
      summary: count(shop.items)
        ? `${n(count(shop.items), "item")} in ${n(count(shop.categories), "category", "categories")}, gifting ${shop.gifting?.enabled ? "allowed" : "off"}.`
        : "No items for sale yet.",
    },
    {
      href: "combat", title: "Combat", sprite: "swords", enabled: !!combat.enabled,
      summary: enemies.length
        ? [
            n(enemies.length - bosses, "enemy", "enemies") + (bosses ? ` and ${n(bosses, "world boss", "world bosses")}` : ""),
            `duels ${combat.pvp?.enabled ? "on" : "off"}`,
            `random encounters ${combat.encounters?.enabled ? "on" : "off"}`,
          ].join(", ") + "."
        : "No enemies yet, so there is nothing to fight.",
    },
    {
      href: "gathering", title: "Gathering", sprite: "pickaxe", enabled: !!gathering.enabled,
      summary: count(gathering.activities)
        ? `${(Object.values(gathering.activities) as Array<{ name?: string }>).map((a) => a.name).join(", ")}, played with /gather.`
        : "No activities yet.",
    },
    {
      href: "quests", title: "Quests", sprite: "scroll", enabled: !!quests.enabled,
      summary: count(quests.quests)
        ? `${n(count(quests.quests), "quest")}, ${quests.announceAllId ? "completions announced" : "completions not announced"}.`
        : "No quests yet.",
    },
    {
      href: "achievements", title: "Achievements", sprite: "trophy", enabled: !!achievements.enabled,
      summary: count(achievements.achievements)
        ? `${n(count(achievements.achievements), "achievement")}, ${achievements.announceAllId ? "unlocks announced" : "unlocks not announced"}.`
        : "No achievements yet.",
    },
    {
      href: "styles", title: "Style", sprite: "palette", enabled: null,
      summary: `${style.template === "fantasy" ? "Fantasy" : "Default"} profile card; currency is ${style.gold?.icon ?? "💰"} ${style.gold?.name || "Gold"} and ${style.xp?.icon ?? "⭐"} ${xpName}.`,
    },
    {
      href: "logging", title: "Logging", sprite: "book", enabled: !!logging.enabled,
      summary: `${n(loggedKinds, "kind of event", "kinds of event")} recorded, ${logging.mainChannelId ? "posted to a log channel" : "no log channel"}.`,
    },
  ];
}

export default function GuildOverview({ guildId }: { guildId: string }) {
  const { config, guild, loading, error } = useGuildConfig(guildId);
  const justSetUp = useSearchParams().get("setup") === "done";

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

  return (
    <div className="space-y-6">
      <header className="frame flex items-center gap-4 p-5">
        {guild.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={guild.iconUrl}
            alt=""
            className="h-14 w-14 rounded-full border-2 border-[var(--border-bright)] object-cover shadow-[0_0_0_2px_#000]"
          />
        ) : (
          <div className="h-14 w-14 rounded-full border-2 border-[var(--border-bright)] bg-[var(--border)] shadow-[0_0_0_2px_#000]" />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl">{guild.name ?? "Server"}</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">Everything havocish does here, at a glance.</p>
        </div>
      </header>

      {justSetUp && (
        <section className="frame border-[var(--accent)] p-4 text-sm">
          ⚡ <strong>Your server is set up.</strong> Members can start playing now. The check below confirms havocish can do
          everything you turned on, and every setting is still yours to change on the pages in the sidebar.
        </section>
      )}

      <HealthPanel guildId={guildId} />

      <QuestLog guildId={guildId} config={config} />

      <section className="frame divide-y divide-[var(--border)]">
        {describe(config ?? {}).map((row) => (
          <Link
            key={row.href}
            href={`/dashboard/${guildId}/${row.href}`}
            className={`group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--accent)]/5 ${
              row.enabled === false ? "opacity-60 hover:opacity-100" : ""
            }`}
          >
            <Sprite name={row.sprite} size={32} />
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2">
                {row.title}
                {row.enabled !== null && (
                  // The muted uncommon green and poor grey item quality colours.
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${row.enabled ? "text-[#8fbf72]" : "text-[#8a857c]"}`}>
                    {row.enabled ? "On" : "Off"}
                  </span>
                )}
              </h2>
              <p className="text-sm text-[var(--muted)] first-letter:uppercase">{row.summary}</p>
            </div>
            <ChevronRight size={16} className="shrink-0 text-[var(--muted)] transition-colors group-hover:text-[var(--accent)]" />
          </Link>
        ))}
      </section>
    </div>
  );
}
