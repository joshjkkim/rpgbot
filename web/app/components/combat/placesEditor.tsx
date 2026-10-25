"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ColorField, Field, FieldGrid, NumberField, Section, SelectField, TextField, Toggle } from "@/app/components/ui/form";
import { ContentBrowser, EntryTooltip, idFromName } from "@/app/components/ui/slots";
import { ChannelField, PlaceChannelsField, RoleField, useRoleOptions } from "@/app/components/ui/pickers";
import RequirementsField, { type Requirements, type SkillOption } from "@/app/components/ui/requirementsField";
import type { CombatConfig } from "./combatEditor";
import type { PlaceConfig } from "./moveText";

const FIGHT_STYLES = [
  { value: "thread" as const, label: "In a thread, off one line in chat" },
  { value: "channel" as const, label: "Right in the channel" },
];

// Mirrored from havocish/src/types/guild.ts (UnlockConfig).
export type UnlockConfig = { id: string; roleId: string; requirements?: Requirements; placeId?: string };
export type UnlocksConfig = { list: Record<string, UnlockConfig>; channelId?: string | null };

/** Places: the server's channels as its map, each with the enemies met there, and the role that opens it. */
export default function PlacesEditor({ value, onChange, unlocks, onUnlocks, skills, items }: {
  value: CombatConfig;
  onChange: (next: CombatConfig) => void;
  unlocks: UnlocksConfig | undefined;
  onUnlocks: (next: UnlocksConfig) => void;
  skills: SkillOption[];
  items: Record<string, { name?: string; emoji?: string }>;
}) {
  const unlockList = unlocks?.list ?? {};
  // One unlock per place, keyed by its id (as packs ship them).
  const unlockFor = (placeId: string) => Object.values(unlockList).find((u) => u.placeId === placeId);
  const setUnlock = (placeId: string, u: UnlockConfig | null) => {
    const next = Object.fromEntries(Object.entries(unlockList).filter(([, x]) => x.placeId !== placeId));
    if (u) next[u.id] = u;
    onUnlocks({ ...unlocks, list: next });
  };
  const places = value.places ?? {};
  const enemies = Object.values(value.enemies ?? {}).filter((e) => !e.boss);
  const enemyOptions = enemies.map((e) => ({ value: e.id, label: `${e.emoji} ${e.name} (Combat ${e.minLevel}${e.maxLevel == null ? "+" : `–${e.maxLevel}`})` }));
  const upsert = (p: PlaceConfig) => onChange({ ...value, places: { ...places, [p.id]: p } });
  const entries = Object.entries(places).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]));

  return (
    <div className="space-y-4">
      <Section
        title="Places"
        description="Tie enemies to channels, so the server's channel list becomes its map: wolves in #the-woods, the Lich only in #the-crypt. /fight and random encounters there draw from the place's enemies. A place can cover a whole category."
      >
        <ContentBrowser<PlaceConfig>
          entries={entries}
          newLabel="New place"
          empty="No places yet. Everywhere, members meet any enemy that suits their level."
          look={(id, p) => ({ icon: p.emoji, label: p.name || id, faded: !p.channelIds?.length })}
          tooltip={(id, p) => (
            <EntryTooltip
              title={`${p.emoji ?? ""} ${p.name || id}`}
              lines={[
                `${p.channelIds?.length ?? 0} channel${p.channelIds?.length === 1 ? "" : "s"} · ${(p.fights ?? "thread") === "thread" ? "fights in threads" : "fights in the channel"}`,
                (p.enemies ?? []).map((e) => value.enemies?.[e.enemyId]?.emoji ?? "?").join(" ") || "No enemies",
              ]}
            />
          )}
          onCreate={(name) => {
            const id = idFromName(name, Object.keys(places));
            upsert({ id, name, emoji: "🌲", channelIds: [], enemies: [] });
            return id;
          }}
          onRemove={(id) => {
            const next = { ...places };
            delete next[id];
            onChange({ ...value, places: next });
          }}
          renderItem={(id, place) => {
            const pool = place.enemies ?? [];
            const total = pool.reduce((sum, e) => sum + Math.max(0, e.weight ?? 1), 0);
            const setPool = (next: PlaceConfig["enemies"]) => upsert({ ...place, enemies: next });
            return (
              <div className="space-y-4">
                <FieldGrid>
                  <TextField label="Name" value={place.name} onChange={(v) => upsert({ ...place, name: v })} />
                  <TextField label="Emoji" value={place.emoji ?? ""} onChange={(v) => upsert({ ...place, emoji: v })} />
                  <TextField
                    wide
                    label="How enemies turn up"
                    value={place.arrival ?? ""}
                    onChange={(v) => upsert({ ...place, arrival: v || undefined })}
                    placeholder="prowls out of the treeline"
                    hint={`Random encounters here read “A wild Grey Wolf ${place.arrival || "appears"}!”`}
                  />
                </FieldGrid>

                <FieldGrid>
                  <ColorField
                    label="Scene colour"
                    value={place.colour ?? "#2f4a3a"}
                    onChange={(v) => upsert({ ...place, colour: v })}
                    hint="The sky in fights here, behind a faint pattern of the place's emoji."
                  />
                  <TextField
                    label="Scene image (optional)"
                    value={place.image ?? ""}
                    onChange={(v) => upsert({ ...place, image: v.trim() || undefined })}
                    placeholder="https://…/darkwood.png"
                    hint="A picture link to use as the backdrop instead. Wide images work best."
                  />
                </FieldGrid>

                <PlaceChannelsField
                  label="Channels"
                  value={place.channelIds ?? []}
                  onChange={(v) => upsert({ ...place, channelIds: v })}
                  hint="Pick channels, or a 📁 category for every channel in it. A channel picked on its own belongs to that place rather than its category's."
                />

                <SelectField
                  label="Fights show"
                  value={place.fights ?? "thread"}
                  onChange={(v) => upsert({ ...place, fights: v })}
                  options={FIGHT_STYLES}
                  hint={(place.fights ?? "thread") === "thread"
                    ? "For chat channels: chat sees one line, the fight opens in a thread off it, and the line shows the result when it ends."
                    : "For RPG channels: the whole fight plays out in the channel."}
                />

                <Field label="Enemies here" hint="Each fight picks one by weight, among those that suit the member's Combat level.">
                  <div className="space-y-3">
                    {pool.map((p, i) => {
                      const share = total > 0 ? Math.round((Math.max(0, p.weight ?? 1) / total) * 100) : 0;
                      return (
                        <div key={i} className="flex items-end gap-3">
                          <div className="grid flex-1 gap-3 sm:grid-cols-2">
                            <SelectField
                              label="Enemy"
                              value={p.enemyId}
                              onChange={(v) => setPool(pool.map((x, j) => (j === i ? { ...x, enemyId: v } : x)))}
                              options={enemyOptions.some((o) => o.value === p.enemyId) ? enemyOptions : [{ value: p.enemyId, label: `Deleted (${p.enemyId})` }, ...enemyOptions]}
                            />
                            <NumberField
                              label="Weight"
                              value={p.weight ?? 1}
                              min={0}
                              onChange={(v) => setPool(pool.map((x, j) => (j === i ? { ...x, weight: v } : x)))}
                              hint={`About ${share}% when all of them suit.`}
                            />
                          </div>
                          <button
                            type="button"
                            aria-label="Remove enemy"
                            onClick={() => setPool(pool.filter((_, j) => j !== i))}
                            className="mb-2 text-[var(--muted)] transition-colors hover:text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                    {enemyOptions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPool([...pool, { enemyId: enemyOptions.find((o) => !pool.some((p) => p.enemyId === o.value))?.value ?? enemyOptions[0]!.value, weight: 1 }])}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
                      >
                        <Plus size={14} /> Add enemy
                      </button>
                    )}
                  </div>
                </Field>
                <UnlockBlock
                  place={place}
                  unlock={unlockFor(id)}
                  entryLevel={pool.length ? Math.min(99, ...pool.map((p) => value.enemies?.[p.enemyId]?.minLevel ?? 1)) : 1}
                  onChange={(u) => setUnlock(id, u)}
                  skills={skills}
                  items={items}
                />
                <p className="font-mono text-xs text-[var(--muted)]">id: {id}</p>
              </div>
            );
          }}
        />
        <ChannelField
          label="Announce unlocks in"
          value={unlocks?.channelId ?? ""}
          onChange={(ch) => onUnlocks({ list: unlockList, ...unlocks, channelId: ch || null })}
          emptyLabel="Where it happened"
          hint="“🗺️ @member unlocked ⚰️ The Barrow Crypt!”, from your announcer character if you have one."
        />
      </Section>

      <Section title="Everywhere else" description="Channels outside every place, and picking enemies by name.">
        <div className="space-y-4">
          <SelectField
            label="Fights outside places show"
            value={value.fightsIn ?? "channel"}
            onChange={(v) => onChange({ ...value, fightsIn: v })}
            options={FIGHT_STYLES}
          />
          <Toggle
            label="Members can pick an enemy with /fight"
            checked={!!value.allowEnemyChoice}
            onChange={(v) => onChange({ ...value, allowEnemyChoice: v || undefined })}
            hint={value.allowEnemyChoice
              ? "Anyone can name any enemy their level allows, wherever they are."
              : "Off: /fight finds an enemy where you are. Managers can still pick one, for testing."}
          />
        </div>
      </Section>
    </div>
  );
}

/**
 * "Locked until Combat 14: members who get there are given @Crypt Dweller."
 * The level leads because that's what an owner is deciding; the role is how
 * Discord shows it. Other conditions sit behind "More conditions".
 */
function UnlockBlock({ place, unlock, entryLevel, onChange, skills, items }: {
  place: PlaceConfig;
  unlock: UnlockConfig | undefined;
  entryLevel: number;
  onChange: (u: UnlockConfig | null) => void;
  skills: SkillOption[];
  items: Record<string, { name?: string; emoji?: string }>;
}) {
  const roles = useRoleOptions();
  const [more, setMore] = useState(false);
  if (!unlock) {
    return (
      <button
        type="button"
        onClick={() => onChange({ id: place.id, roleId: "", placeId: place.id, requirements: { combatLevel: Math.max(1, entryLevel) } })}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
      >
        🔒 Lock this place until a Combat level
      </button>
    );
  }
  const req = unlock.requirements ?? {};
  const set = (p: Partial<UnlockConfig>) => onChange({ ...unlock, ...p });
  const others = Object.keys(req).filter((k) => k !== "combatLevel").length;
  const roleName = roles?.find((r) => r.id === unlock.roleId)?.name;
  return (
    <div className="space-y-3 rounded-sm border border-[var(--border)] bg-black/20 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <span className="mb-2 text-sm">🔒 Locked until Combat</span>
        <div className="w-24">
          <NumberField value={req.combatLevel ?? 1} min={1} onChange={(v) => set({ requirements: { ...req, combatLevel: v } })} />
        </div>
        <span className="mb-2 text-sm">. Members who get there are given</span>
        <div className="min-w-48 flex-1">
          <RoleField value={unlock.roleId} emptyLabel="Pick a role" onChange={(roleId) => set({ roleId })} />
        </div>
      </div>
      <p className="text-sm text-[var(--muted)]">
        {unlock.roleId
          ? <>In Discord, hide {place.name}&apos;s channels from everyone without {roleName ?? "that role"}. They appear the moment a member earns it: “🗺️ @member unlocked {place.emoji} {place.name}!”</>
          : "Pick the role that can see this place's channels (make one in Discord first, e.g. @Crypt Dweller)."}
      </p>
      <div className="flex flex-wrap gap-3 text-xs">
        <button type="button" onClick={() => setMore((m) => !m)} className="text-[var(--accent)] hover:underline">
          {more ? "Hide other conditions" : others ? `More conditions (${others})` : "More conditions: a skill, a collection…"}
        </button>
        <button type="button" onClick={() => onChange(null)} className="text-[var(--muted)] transition-colors hover:text-red-400">Unlock it for everyone</button>
      </div>
      {more && (
        <RequirementsField value={req} onChange={(requirements) => set({ requirements: requirements ?? {} })} skills={skills} items={items} hint="Members need all of these. The Combat level here is the same one as above." />
      )}
    </div>
  );
}
