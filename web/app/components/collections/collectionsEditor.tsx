"use client";

import { Plus, Trash2 } from "lucide-react";
import { Field, FieldGrid, NumberField, Section, SelectField, TextField } from "@/app/components/ui/form";
import { ChannelField, ItemField, RoleField } from "@/app/components/ui/pickers";
import { ContentBrowser, EntryTooltip, idFromName } from "@/app/components/ui/slots";
import type { LevelAction } from "@/app/components/levels/levelsEditor";

// ─── Types (mirrored from havocish/src/types/guild.ts) ───

export type CollectionEntry = { kind: "item" | "enemy"; id: string };
export type CollectionMilestone = { at: number; actions: LevelAction[] };
export interface CollectionConfig {
  id: string;
  name: string;
  emoji: string;
  description?: string;
  entries: CollectionEntry[];
  milestones?: CollectionMilestone[];
}
export type CollectionsConfig = { channelId?: string | null; sets: Record<string, CollectionConfig> };

type Named = Record<string, { name?: string; emoji?: string }>;

const REWARD_TYPES = [
  { value: "giveGold" as const, label: "Give gold" },
  { value: "giveItem" as const, label: "Give item" },
  { value: "giveCombatXp" as const, label: "Give Combat XP" },
  { value: "assignRole" as const, label: "Give a role" },
];

const smallButton = "inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]";

function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="mb-2.5 text-[var(--muted)] transition-colors hover:text-red-400">
      <Trash2 size={14} />
    </button>
  );
}

/** A milestone's rewards: gold, an item, Combat XP or a role, as many as the owner likes. */
function RewardRows({ value, onChange, items }: { value: LevelAction[]; onChange: (next: LevelAction[]) => void; items: Named }) {
  return (
    <div className="space-y-2">
      {value.map((a, i) => {
        const patch = (p: Partial<LevelAction>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)));
        return (
          <div key={i} className="flex items-end gap-2">
            <div className="grid flex-1 gap-3 sm:grid-cols-3">
              <SelectField label={i === 0 ? "Reward" : undefined} value={a.type} options={REWARD_TYPES} onChange={(t) => patch({ type: t })} />
              {a.type === "giveItem" ? (
                <>
                  <ItemField items={items} label={i === 0 ? "Item" : undefined} value={a.itemId ?? ""} onChange={(id) => patch({ itemId: id })} emptyLabel="Choose an item" />
                  <NumberField label={i === 0 ? "Quantity" : undefined} value={a.quantity ?? 1} min={1} onChange={(q) => patch({ quantity: q })} />
                </>
              ) : a.type === "assignRole" ? (
                <RoleField label={i === 0 ? "Role" : undefined} value={a.roleId ?? ""} onChange={(r) => patch({ roleId: r })} emptyLabel="Choose a role" />
              ) : (
                <NumberField label={i === 0 ? "Amount" : undefined} value={a.amount ?? 0} min={0} onChange={(n) => patch({ amount: n })} />
              )}
            </div>
            <Remove label="Remove reward" onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...value, { type: "giveGold", amount: 100 }])} className={smallButton}>
        <Plus size={14} /> Add reward
      </button>
    </div>
  );
}

/** Owner-made collections: what counts toward each, and the rewards along the way. */
export default function CollectionsEditor({ value, onChange, items, enemies }: {
  value: CollectionsConfig | undefined;
  onChange: (next: CollectionsConfig) => void;
  items: Named;
  enemies: Named;
}) {
  const v = value ?? { sets: {} };
  const sets = v.sets ?? {};
  const upsert = (c: CollectionConfig) => onChange({ ...v, sets: { ...sets, [c.id]: c } });
  const itemOptions = Object.entries(items).map(([id, it]) => ({ value: id, label: `${it.emoji ?? ""} ${it.name ?? id}`.trim() }));
  const enemyOptions = Object.entries(enemies).map(([id, e]) => ({ value: id, label: `${e.emoji ?? ""} ${e.name ?? id}`.trim() }));

  return (
    <div className="space-y-4">
      <Section
        title="Collections"
        description="Groups of things to find and beat: raw materials, crafted gear, a bestiary, whatever fits your server. Items count once a member has ever had them; enemies once they've beaten one. Give rewards at milestones along the way, with the best at the end, and lock recipes, moves, places or quests behind finishing one (Requirements → Has completed)."
      >
        <ContentBrowser<CollectionConfig>
          entries={Object.entries(sets).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]))}
          newLabel="New collection"
          empty="No collections yet. Members see “no collections yet” in /collection until you make one."
          look={(id, c) => ({ icon: c.emoji, label: c.name || id })}
          tooltip={(id, c) => (
            <EntryTooltip
              title={`${c.emoji} ${c.name || id}`}
              lines={[`${c.entries?.length ?? 0} to collect`, `${c.milestones?.length ?? 0} reward milestone${c.milestones?.length === 1 ? "" : "s"}`]}
            />
          )}
          onCreate={(name) => {
            const id = idFromName(name, Object.keys(sets));
            upsert({ id, name, emoji: "📖", entries: [], milestones: [] });
            return id;
          }}
          onRemove={(id) => {
            const next = { ...sets };
            delete next[id];
            onChange({ ...v, sets: next });
          }}
          renderItem={(id, c) => {
            const entries = c.entries ?? [];
            const milestones = c.milestones ?? [];
            const setEntries = (next: CollectionEntry[]) => upsert({ ...c, entries: next });
            const setMilestones = (next: CollectionMilestone[]) => upsert({ ...c, milestones: next });
            return (
              <div className="space-y-4">
                <FieldGrid>
                  <TextField label="Name" value={c.name} onChange={(n) => upsert({ ...c, name: n })} />
                  <TextField label="Emoji" value={c.emoji} onChange={(e) => upsert({ ...c, emoji: e })} />
                  <TextField wide label="Description" value={c.description ?? ""} onChange={(d) => upsert({ ...c, description: d || undefined })} placeholder="Every ore and gem the mountains hold." />
                </FieldGrid>

                <Field label={`To collect (${entries.length})`} hint="Items count once found, enemies once beaten. Missing ones show as ??? to members.">
                  <div className="space-y-2">
                    {entries.map((e, i) => (
                      <div key={i} className="flex items-end gap-2">
                        <div className="grid flex-1 gap-3 sm:grid-cols-[8rem_1fr]">
                          <SelectField
                            value={e.kind}
                            options={[{ value: "item" as const, label: "Item" }, { value: "enemy" as const, label: "Enemy" }]}
                            onChange={(kind) => setEntries(entries.map((x, j) => (j === i ? { kind, id: "" } : x)))}
                          />
                          <SelectField
                            value={e.id}
                            options={[{ value: "", label: e.kind === "item" ? "Choose an item" : "Choose an enemy" }, ...(e.kind === "item" ? itemOptions : enemyOptions)]}
                            onChange={(pick) => setEntries(entries.map((x, j) => (j === i ? { ...x, id: pick } : x)))}
                          />
                        </div>
                        <Remove label="Remove entry" onClick={() => setEntries(entries.filter((_, j) => j !== i))} />
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setEntries([...entries, { kind: "item", id: "" }])} className={smallButton}><Plus size={14} /> Add an item</button>
                      <button type="button" onClick={() => setEntries([...entries, { kind: "enemy", id: "" }])} className={smallButton}><Plus size={14} /> Add an enemy</button>
                    </div>
                  </div>
                </Field>

                <Field label="Rewards" hint="Each pays once, when a member reaches that many. Set one at the full count for finishing it, and make that the best one.">
                  <div className="space-y-3">
                    {milestones.map((m, i) => (
                      <div key={i} className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                        <div className="flex items-end gap-2">
                          <div className="w-40">
                            <NumberField
                              label="At"
                              value={m.at}
                              min={1}
                              onChange={(at) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, at } : x)))}
                              hint={entries.length && m.at >= entries.length ? "Finishing it" : `of ${entries.length}`}
                            />
                          </div>
                          <div className="flex-1" />
                          <Remove label="Remove milestone" onClick={() => setMilestones(milestones.filter((_, j) => j !== i))} />
                        </div>
                        <RewardRows items={items} value={m.actions ?? []} onChange={(actions) => setMilestones(milestones.map((x, j) => (j === i ? { ...x, actions } : x)))} />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setMilestones([...milestones, { at: Math.max(1, entries.length), actions: [{ type: "giveGold", amount: 100 }] }])}
                      className={smallButton}
                    >
                      <Plus size={14} /> Add a milestone
                    </button>
                  </div>
                </Field>
                <p className="font-mono text-xs text-[var(--muted)]">id: {id}</p>
              </div>
            );
          }}
        />
      </Section>

      <Section title="Announcements" defaultOpen={false}>
        <ChannelField
          label="Announce milestones in"
          value={v.channelId ?? ""}
          onChange={(ch) => onChange({ ...v, channelId: ch || null })}
          emptyLabel="Where it happened"
          hint="“📖 @member completed ⛏️ Ores & Gems! +500 gold”. Without a channel, it posts where the find or fight happened."
        />
      </Section>
    </div>
  );
}
