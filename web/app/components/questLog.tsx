import Link from "next/link";
import { Check } from "lucide-react";

type Toggle = { enabled?: boolean };

/** The slice of guild config the quest log reads. */
export type QuestLogConfig = {
  xp?: Toggle;
  levels?: {
    announceLevelUpInChannelId?: string | null;
    levelActions?: Record<string, Array<{ type?: string; roleId?: string }>>;
  };
  shop?: Toggle & { items?: object };
  combat?: Toggle & { enemies?: object; places?: Record<string, { channelIds?: string[] }> };
  gathering?: Toggle & { activities?: object };
  crafting?: Toggle & { stations?: object };
  collections?: { sets?: object };
  quests?: Toggle & { quests?: object };
  achievements?: Toggle & { achievements?: object };
  logging?: Toggle & { mainChannelId?: string | null };
};

const has = (record?: object) => Object.keys(record ?? {}).length > 0;

function buildQuests(config: QuestLogConfig | null) {
  const { xp = {}, levels = {}, shop = {}, combat = {}, quests = {}, achievements = {}, logging = {}, gathering = {}, crafting = {}, collections = {} } = config ?? {};
  const givesRole = Object.values(levels.levelActions ?? {}).some(
    (actions) => Array.isArray(actions) && actions.some((a) => a?.type === "assignRole" && a.roleId)
  );

  // Servers that keep another leveling bot have no level quests to do.
  const leveling = xp.enabled === false ? [] : [
    {
      href: "leveling",
      title: "Herald of Levels",
      done: !!levels.announceLevelUpInChannelId,
      todo: "Pick a channel for level-up announcements.",
    },
    {
      href: "leveling",
      title: "Rewards of Rank",
      done: givesRole,
      todo: "Give a role at a level, under Level actions.",
    },
  ];

  return [
    ...leveling,
    {
      href: "combat",
      title: "Call to Arms",
      done: !!combat.enabled && has(combat.enemies),
      todo: "Turn on combat and add an enemy, or take some from the Library.",
    },
    {
      href: "combat",
      title: "Lay of the Land",
      done: Object.values(combat.places ?? {}).some((p) => (p.channelIds?.length ?? 0) > 0),
      todo: "Give a place its channels, so the enemies met there fit it (Combat → Places).",
    },
    {
      href: "gathering",
      title: "Hands to the Harvest",
      done: !!gathering.enabled && has(gathering.activities),
      todo: "Turn on gathering and add an activity.",
    },
    {
      href: "crafting",
      title: "The Forge Is Lit",
      done: !!crafting.enabled && has(crafting.stations),
      todo: "Turn on crafting and add a station with a recipe.",
    },
    {
      href: "shop",
      title: "Open for Business",
      done: !!shop.enabled && has(shop.items),
      todo: "Turn on the shop and stock an item.",
    },
    {
      href: "quests",
      title: "A Task for Adventurers",
      done: !!quests.enabled && has(quests.quests),
      todo: "Turn on quests and write one.",
    },
    {
      href: "achievements",
      title: "Deeds Worth Noting",
      done: !!achievements.enabled && has(achievements.achievements),
      todo: "Turn on achievements and add one.",
    },
    {
      href: "collections",
      title: "Sets to Complete",
      done: has(collections.sets),
      todo: "Make a collection with a reward along the way.",
    },
    {
      href: "logging",
      title: "The Watchful Eye",
      done: !!logging.enabled && !!logging.mainChannelId,
      todo: "Turn on logging and set a main channel.",
    },
  ];
}

/**
 * Setup checklist for a new server, styled as a quest log. Each quest ticks
 * itself off from the saved config and links to the page that completes it.
 */
export default function QuestLog({ guildId, config }: { guildId: string; config: QuestLogConfig | null }) {
  const quests = buildQuests(config);
  const done = quests.filter((q) => q.done).length;

  if (done === quests.length) {
    return (
      <p className="frame flex items-center gap-2.5 px-4 py-3 text-sm text-[var(--muted)]">
        <Check size={14} className="text-[#8fbf72]" />
        All quests complete. Your server is ready for adventurers.
      </p>
    );
  }

  return (
    <section className="frame p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>
          Quest Log{" "}
          <span className="font-sans text-sm tabular-nums text-[var(--muted)]">
            ({done}/{quests.length})
          </span>
        </h2>
        <Link href={`/dashboard/${guildId}/setup`} className="btn px-3 py-1.5 text-sm">
          ⚡ Setup wizard
        </Link>
      </div>

      <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
        {quests.map((q) => (
          <li key={q.title}>
            <Link href={`/dashboard/${guildId}/${q.href}`} className="group flex items-start gap-3 py-2">
              <span className="slot mt-0.5 h-5 w-5 shrink-0 text-[#8fbf72]" aria-hidden>
                {q.done && <Check size={12} strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span
                  className={`block font-display ${
                    q.done ? "text-[var(--muted)]" : "transition-colors group-hover:text-[var(--gold)]"
                  }`}
                >
                  {q.title}
                  <span className="sr-only">{q.done ? " (complete)" : ""}</span>
                </span>
                {!q.done && <span className="block text-xs text-[var(--muted)]">{q.todo}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
