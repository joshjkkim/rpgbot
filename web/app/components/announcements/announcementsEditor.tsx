"use client";

import { Section, SelectField, TextField } from "@/app/components/ui/form";
import { ChannelField } from "@/app/components/ui/pickers";
import { RARITIES } from "@/app/components/shop/itemTooltip";
import type { DashboardConfig } from "@/app/lib/dashboardConfig";

/**
 * Every announcement in one place: what gets posted, where, in what words and
 * by whom. Each row edits the same setting its feature's page used to hold,
 * so the bot reads them exactly as before.
 */

type Config = NonNullable<DashboardConfig>;
// The sections are typed by their own editors; here they're read and written loosely, field by field.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

function Row({ title, said, children }: { title: string; said: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-sm border border-[var(--border)] bg-black/20 p-3">
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display">{title}</span>
        <span className="text-xs text-[var(--muted)]">said by {said}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export default function AnnouncementsEditor({ config, setConfig }: {
  config: Config;
  setConfig: (update: (prev: DashboardConfig | null) => DashboardConfig | null) => void;
}) {
  const c = config as Loose;
  /** Sets one field in one section, leaving the rest of the section as it is. */
  const set = (section: string, patch: Loose) =>
    setConfig((prev) => ({ ...prev, [section]: { ...((prev as Loose | null)?.[section] ?? {}), ...patch } }) as DashboardConfig);
  const characters = Object.values((c.characters?.list ?? {}) as Record<string, { id: string; name: string }>);
  const who = (id: string | null | undefined, fallback = "the bot") => characters.find((x) => x.id === id)?.name ?? fallback;
  const announcer = who(c.characters?.announcerId);
  const shopkeeper = who(c.characters?.shopkeeperId);
  const options = [{ value: "", label: "Nobody: the bot" }, ...characters.map((x) => ({ value: x.id, label: x.name }))];
  const setCharacters = (patch: Loose) => setConfig((prev) => ({ ...prev, characters: { list: {}, ...(prev as Loose | null)?.characters, ...patch } }) as DashboardConfig);
  const cards = c.style?.levelUpCards ?? {};

  return (
    <div className="space-y-4">
      <Section title="Who announces" description="Characters post under their own name and picture. Make them on the Characters page.">
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Announcer" value={c.characters?.announcerId ?? ""} options={options} onChange={(id) => setCharacters({ announcerId: id || null })} hint="Everything below except rare finds, and quests with a giver of their own." />
          <SelectField label="Shopkeeper" value={c.characters?.shopkeeperId ?? ""} options={options} onChange={(id) => setCharacters({ shopkeeperId: id || null })} hint="Rare finds." />
        </div>
      </Section>

      <Section title="What's posted where" description="Leave a channel empty to post where it happened. Messages can use {user}, and the placeholders listed under each.">
        <div className="space-y-3">
          {c.xp?.enabled !== false && (
            <Row title="Chat level-ups" said={announcer}>
              <ChannelField label="Channel" value={c.levels?.announceLevelUpInChannelId ?? ""} onChange={(v) => set("levels", { announceLevelUpInChannelId: v || null })} emptyLabel="Off" />
              <TextField label="Message" value={c.levels?.announceLevelUpMessage ?? ""} onChange={(v) => set("levels", { announceLevelUpMessage: v })} hint="{user}, {level}" />
            </Row>
          )}
          <Row title="Combat and skill level-up cards" said={announcer}>
            <ChannelField label="Also post in" value={cards.channelId ?? ""} onChange={(v) => set("style", { levelUpCards: { ...cards, channelId: v || null } })} emptyLabel="Only under the result" hint="A copy of each card, like a #level-ups channel. Turn the cards on or off on Style." />
          </Row>
          <Row title="Rare finds" said={shopkeeper}>
            <ChannelField label="Channel" value={c.rareFinds?.channelId ?? ""} onChange={(v) => set("rareFinds", { channelId: v || null })} emptyLabel="Off" />
            <SelectField label="Rare enough at" value={c.rareFinds?.minRarity ?? "epic"} options={RARITIES.filter((r) => r.value !== "poor").map((r) => ({ value: r.value, label: `${r.label} and up` }))} onChange={(v) => set("rareFinds", { minRarity: v })} />
          </Row>
          <Row title="Quests completed" said={`the quest's giver, else ${announcer}`}>
            <ChannelField label="Channel" value={c.quests?.announceAllId ?? ""} onChange={(v) => set("quests", { announceAllId: v || null })} emptyLabel="Where it happened" />
            <TextField label="Message" value={c.quests?.announceMessage ?? ""} onChange={(v) => set("quests", { announceMessage: v || null })} placeholder="📜 {user} completed {questName}!" hint="{user}, {questName}, {questDescription}. Empty: not announced." />
          </Row>
          <Row title="Achievements unlocked" said={announcer}>
            <ChannelField label="Channel" value={c.achievements?.announceAllId ?? ""} onChange={(v) => set("achievements", { announceAllId: v || null })} emptyLabel="Where it happened" />
            <TextField label="Message" value={c.achievements?.announceMessage ?? ""} onChange={(v) => set("achievements", { announceMessage: v || null })} placeholder="🏆 {user} unlocked {achievementName}!" hint="{user}, {achievementName}, {achievementDescription}. Empty: not announced." />
          </Row>
          <Row title="Collection milestones" said={announcer}>
            <ChannelField label="Channel" value={c.collections?.channelId ?? ""} onChange={(v) => set("collections", { sets: {}, ...c.collections, channelId: v || null })} emptyLabel="Where it happened" />
          </Row>
          <Row title="Roles at levels (places opening)" said={announcer}>
            <ChannelField label="Channel" value={c.unlocks?.channelId ?? ""} onChange={(v) => set("unlocks", { list: {}, ...c.unlocks, channelId: v || null })} emptyLabel="Where it happened" />
          </Row>
          <Row title="Daily rewards" said={announcer}>
            <ChannelField label="Channel" value={c.xp?.announceDailyInChannelId ?? ""} onChange={(v) => set("xp", { announceDailyInChannelId: v || null })} emptyLabel="Off" />
            <TextField label="Message" value={c.xp?.announceDailyMessage ?? ""} onChange={(v) => set("xp", { announceDailyMessage: v })} hint="{user}, {xp}, {gold}, {xpName}, {goldName}, {streak}" />
          </Row>
          {c.xp?.enabled !== false && (
            <Row title="Daily streaks" said={announcer}>
              <ChannelField label="Channel" value={c.xp?.streakAnnounceChannelId ?? ""} onChange={(v) => set("xp", { streakAnnounceChannelId: v || null })} emptyLabel="Off" />
              <TextField label="Message" value={c.xp?.streakAnnounceMessage ?? ""} onChange={(v) => set("xp", { streakAnnounceMessage: v })} hint="{user}, {streak}, {xp}, {gold}" />
            </Row>
          )}
          <Row title="Gifts" said={announcer}>
            <ChannelField label="Channel" value={c.shop?.gifting?.announceChannel ?? ""} onChange={(v) => set("shop", { gifting: { enabled: false, dm: false, levelReq: 0, message: null, ...c.shop?.gifting, announceChannel: v || null } })} emptyLabel="Off" />
            <TextField label="Message" value={c.shop?.gifting?.message ?? ""} onChange={(v) => set("shop", { gifting: { enabled: false, dm: false, levelReq: 0, announceChannel: null, ...c.shop?.gifting, message: v || null } })} hint="{giver}, {receiver}, {item}, {quantity}. Also the DM to the receiver, when that's on (Shop)." />
          </Row>
          <Row title="Role rewards" said={announcer}>
            <ChannelField label="Channel" value={c.roleRewards?.channelId ?? ""} onChange={(v) => set("roleRewards", { roles: {}, ...c.roleRewards, channelId: v || null })} emptyLabel="Quietly, no announcement" />
          </Row>
        </div>
      </Section>
    </div>
  );
}
