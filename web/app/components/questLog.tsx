import Link from "next/link";
import { Check } from "lucide-react";

type Toggle = { enabled?: boolean };

/** The slice of guild config the quest log reads. */
export type QuestLogConfig = {
  levels?: {
    announceLevelUpInChannelId?: string | null;
    levelActions?: Record<string, Array<{ type?: string; roleId?: string }>>;
  };
  shop?: Toggle & { items?: object };
  combat?: Toggle & { enemies?: object };
  quests?: Toggle & { quests?: object };
  achievements?: Toggle & { achievements?: object };
  logging?: Toggle & { mainChannelId?: string | null };
};

const has = (record?: object) => Object.keys(record ?? {}).length > 0;

function buildQuests(config: QuestLogConfig | null) {
  const { levels = {}, shop = {}, combat = {}, quests = {}, achievements = {}, logging = {} } = config ?? {};
  const givesRole = Object.values(levels.levelActions ?? {}).some(
    (actions) => Array.isArray(actions) && actions.some((a) => a?.type === "assignRole" && a.roleId)
  );

  return [
    {
      href: "levels",
      title: "Herald of Levels",
      done: !!levels.announceLevelUpInChannelId,
      todo: "Pick a channel for level-up announcements.",
    },
    {
      href: "levels",
      title: "Rewards of Rank",
      done: givesRole,
      todo: "Give a role at a level, under Level actions.",
    },
    {
      href: "shop",
      title: "Open for Business",
      done: !!shop.enabled && has(shop.items),
      todo: "Turn on the shop and stock an item.",
    },
    {
      href: "combat",
      title: "Call to Arms",
      done: !!combat.enabled && has(combat.enemies),
      todo: "Turn on combat and add an enemy.",
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
        <Link href={`/dashboard/${guildId}/presets`} className="btn btn-stone px-3 py-1.5 text-sm">
          Use a starter pack
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
