"use client";

import { Plus, Trash2 } from "lucide-react";
import RequirementsField, { type SkillOption } from "@/app/components/ui/requirementsField";
import { Field, FieldGrid, NumberField, Section, SelectField, TextField, Toggle } from "@/app/components/ui/form";
import { ContentBrowser, EntryTooltip, idFromName } from "@/app/components/ui/slots";
import {
  DEFAULT_MOVES, DEFAULT_STATUSES, EFFECT_LABELS, NEW_EFFECT, STAT_LABEL,
  describeMove, effectTarget,
  type EffectType, type MoveCondition, type MoveConfig, type MoveEffect, type MoveStat, type StatusConfig,
} from "./moveText";

/** Most moves need one or two; three keeps a button's text readable. */
const MAX_EFFECTS = 3;

const CONDITIONS: Array<{ value: MoveCondition["type"] | ""; label: string }> = [
  { value: "", label: "Always" },
  { value: "targetHasStatus", label: "If the target has a status" },
  { value: "selfHpBelow", label: "If your HP is below…" },
  { value: "targetHpBelow", label: "If the target's HP is below…" },
  { value: "targetCharging", label: "If the target is winding up" },
  { value: "targetGuarding", label: "If the target is guarding" },
];

const STATS = (Object.keys(STAT_LABEL) as MoveStat[]).map((s) => ({ value: s, label: STAT_LABEL[s] }));

/** The move as players read it in Discord, live while it's edited. */
function MovePreview({ move, statuses }: { move: MoveConfig; statuses: Record<string, StatusConfig> }) {
  const { does, drawbacks } = describeMove(move, statuses);
  return (
    <EntryTooltip
      title={`${move.emoji ?? ""} ${move.name}`}
      lines={[
        ...(does.length || drawbacks.length ? does : ["Does nothing yet: add an effect."]),
        ...drawbacks.map((d) => `⚠️ ${d}`),
      ]}
    />
  );
}

/** "When" for an effect, or for an enemy picking a move. */
export function ConditionFields({ value: when, onChange, statuses }: {
  value: MoveCondition | undefined;
  onChange: (next: MoveCondition | undefined) => void;
  statuses: Record<string, StatusConfig>;
}) {
  const statusOptions = Object.values(statuses).map((s) => ({ value: s.id, label: `${s.emoji} ${s.name}` }));
  return (
    <>
      <SelectField
        label="When"
        value={when?.type ?? ""}
        onChange={(t) => {
          if (!t) return onChange(undefined);
          onChange(
            t === "targetHasStatus" ? { type: t, statusId: Object.keys(statuses)[0] ?? "bleed" } :
            t === "selfHpBelow" || t === "targetHpBelow" ? { type: t, percent: 30 } : { type: t },
          );
        }}
        options={CONDITIONS}
      />
      {when?.type === "targetHasStatus" && (
        <SelectField label="Status" value={when.statusId} onChange={(v) => onChange({ ...when, statusId: v })} options={statusOptions} />
      )}
      {(when?.type === "selfHpBelow" || when?.type === "targetHpBelow") && (
        <NumberField label="HP below (%)" value={when.percent} min={1} max={100} step={5} onChange={(v) => onChange({ ...when, percent: v })} />
      )}
    </>
  );
}

function EffectFields({ effect, onChange, statuses }: {
  effect: MoveEffect;
  onChange: (next: MoveEffect) => void;
  statuses: Record<string, StatusConfig>;
}) {
  const statusOptions = Object.values(statuses).map((s) => ({ value: s.id, label: `${s.emoji} ${s.name}` }));
  const set = (patch: Partial<MoveEffect>) => onChange({ ...effect, ...patch } as MoveEffect);

  return (
    <div className="space-y-3">
      <FieldGrid>
        <SelectField
          label="Does"
          value={effect.type}
          onChange={(t: EffectType) => onChange({ ...NEW_EFFECT[t], ...(effect.chance != null && { chance: effect.chance }) })}
          options={(Object.keys(EFFECT_LABELS) as EffectType[]).map((t) => ({ value: t, label: EFFECT_LABELS[t] }))}
        />
        {effect.type !== "guard" && effect.type !== "counter" && (
          <SelectField
            label="Lands on"
            value={effectTarget(effect)}
            onChange={(v) => set({ target: v })}
            options={[{ value: "target", label: "The target" }, { value: "self", label: "Whoever uses it" }]}
            hint={effectTarget(effect) === "self" && (effect.type === "hit" || effect.type === "stun") ? "A drawback: it hurts the user." : undefined}
          />
        )}

        {effect.type === "hit" && (
          <>
            <NumberField label="Power (%)" value={Math.round(effect.power * 100)} min={0} step={10} onChange={(v) => set({ power: v / 100 })} hint="100 is a normal hit." />
            <NumberField label="Hits" value={effect.hits ?? 1} min={1} max={10} onChange={(v) => set({ hits: v > 1 ? v : undefined })} />
            <NumberField label="Ignores defense (%)" value={effect.pierce ?? 0} min={0} max={100} step={5} onChange={(v) => set({ pierce: v || undefined })} />
            <NumberField label="Heals for (% of damage)" value={effect.lifesteal ?? 0} min={0} max={100} step={5} onChange={(v) => set({ lifesteal: v || undefined })} />
          </>
        )}
        {effect.type === "guard" && (
          <NumberField label="Blocks (%)" value={effect.percent} min={0} max={100} step={5} onChange={(v) => set({ percent: v })} />
        )}
        {effect.type === "counter" && (
          <>
            <NumberField label="Deals back (% of damage)" value={effect.percent ?? 0} min={0} max={200} step={5} onChange={(v) => set({ percent: v })} />
            <Toggle label="Stuns the attacker" checked={!!effect.stun} onChange={(v) => set({ stun: v || undefined })} />
          </>
        )}
        {effect.type === "heal" && (
          <NumberField label="% of max HP" value={effect.percent} min={-100} max={100} step={5} onChange={(v) => set({ percent: v })} hint="Negative loses HP instead, never below 1." />
        )}
        {effect.type === "boost" && (
          <>
            <SelectField label="Stat" value={effect.stat} onChange={(v) => set({ stat: v })} options={STATS} />
            <NumberField label="Change (%)" value={effect.percent} min={-100} max={500} step={5} onChange={(v) => set({ percent: v })} hint="Negative lowers it." />
            <NumberField label="Turns" value={effect.turns} min={1} max={20} onChange={(v) => set({ turns: v })} hint="1 is just this turn." />
          </>
        )}
        {effect.type === "status" && (
          <>
            <SelectField label="Status" value={effect.statusId} onChange={(v) => set({ statusId: v })} options={statusOptions.length ? statusOptions : [{ value: effect.statusId, label: effect.statusId }]} />
            <NumberField label="Turns" value={effect.turns} min={1} max={20} onChange={(v) => set({ turns: v })} />
          </>
        )}
        {effect.type === "cleanse" && (
          <Toggle label="Only harmful effects" checked={!!effect.harmfulOnly} onChange={(v) => set({ harmfulOnly: v || undefined })} />
        )}
      </FieldGrid>

      <FieldGrid>
        <NumberField label="Chance (%)" value={effect.chance ?? 100} min={0} max={100} step={5} onChange={(v) => set({ chance: v >= 100 ? undefined : v })} />
        <ConditionFields value={effect.when} onChange={(when) => set({ when })} statuses={statuses} />
      </FieldGrid>
    </div>
  );
}

export default function MovesEditor({ moves, statuses, onMoves, onStatuses, skills }: {
  moves: Record<string, MoveConfig> | undefined;
  statuses: Record<string, StatusConfig> | undefined;
  onMoves: (next: Record<string, MoveConfig>) => void;
  onStatuses: (next: Record<string, StatusConfig>) => void;
  skills: SkillOption[];
}) {
  // Until a server makes its own, it has the built-ins; the first edit saves a copy.
  const all = moves ?? DEFAULT_MOVES;
  const allStatuses = statuses ?? DEFAULT_STATUSES;
  const upsert = (m: MoveConfig) => onMoves({ ...all, [m.id]: m });
  const entries = Object.entries(all).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]));

  return (
    <div className="space-y-4">
      <Section
        title="Moves"
        description="What fighters do on their turn. Every move, a player's or an enemy's, is up to three effects. Put an effect on whoever uses it to give a strong move a cost. Enemies use the moves in their list (Enemies tab); players get the ones marked for players."
      >
        <ContentBrowser<MoveConfig>
          entries={entries}
          newLabel="New move"
          empty="No moves yet."
          look={(id, m) => ({ icon: m.emoji, label: m.name || id, faded: !m.players })}
          tooltip={(_, m) => <MovePreview move={m} statuses={allStatuses} />}
          onCreate={(name) => {
            const id = idFromName(name, Object.keys(all));
            upsert({ id, name, emoji: "✨", effects: [{ type: "hit", power: 1 }], players: {} });
            return id;
          }}
          onRemove={(id) => {
            const next = { ...all };
            delete next[id];
            onMoves(next);
          }}
          renderItem={(id, move) => {
            const effects = move.effects ?? [];
            const setEffects = (next: MoveEffect[]) => upsert({ ...move, effects: next });
            return (
              <div className="space-y-4">
                <MovePreview move={move} statuses={allStatuses} />

                <FieldGrid>
                  <TextField label="Name" value={move.name} onChange={(v) => upsert({ ...move, name: v })} />
                  <TextField label="Emoji" value={move.emoji ?? ""} onChange={(v) => upsert({ ...move, emoji: v })} />
                  <TextField
                    wide
                    label="Warning line"
                    value={move.telegraph ?? ""}
                    onChange={(v) => upsert({ ...move, telegraph: v || undefined })}
                    placeholder="raises its club high…"
                    hint="Shown before an enemy uses it, after its name: “Ogre raises its club high…”. It's how players read what's coming."
                  />
                </FieldGrid>

                <Field label="Effects">
                  <div className="space-y-3">
                    {effects.length === 0 && <p className="text-xs text-[var(--muted)]">No effects: this move does nothing.</p>}
                    {effects.map((effect, i) => (
                      <div key={i} className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Effect {i + 1}</span>
                          <button
                            type="button"
                            aria-label="Remove effect"
                            onClick={() => setEffects(effects.filter((_, j) => j !== i))}
                            className="text-[var(--muted)] transition-colors hover:text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <EffectFields
                          effect={effect}
                          statuses={allStatuses}
                          onChange={(next) => setEffects(effects.map((e, j) => (j === i ? next : e)))}
                        />
                      </div>
                    ))}
                    {effects.length < MAX_EFFECTS && (
                      <button
                        type="button"
                        onClick={() => setEffects([...effects, NEW_EFFECT.hit])}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
                      >
                        <Plus size={14} /> Add effect
                      </button>
                    )}
                  </div>
                </Field>

                <Field label="Rules">
                  <FieldGrid>
                    <NumberField label="Cooldown (turns)" value={move.cooldown ?? 0} min={0} max={20} onChange={(v) => upsert({ ...move, cooldown: v || undefined })} hint="Turns before it can be used again." />
                    <NumberField label="Uses per fight" value={move.usesPerFight ?? 0} min={0} max={20} onChange={(v) => upsert({ ...move, usesPerFight: v || undefined })} hint="0 means no limit." />
                    <NumberField label="Wind-up (turns)" value={move.charge ?? 0} min={0} max={5} onChange={(v) => upsert({ ...move, charge: v || undefined })} hint="Turns spent winding up before it goes off. A stun cancels it." />
                    <Toggle label="Strikes first" checked={!!move.firstStrike} onChange={(v) => upsert({ ...move, firstStrike: v || undefined })} hint="Goes before the other side's move, whatever the speeds." />
                  </FieldGrid>
                </Field>

                <Field label="Players">
                  <div className="space-y-3">
                    <Toggle
                      label="Players can use this"
                      checked={!!move.players}
                      onChange={(v) => upsert({ ...move, players: v ? {} : undefined })}
                      hint={move.players ? "Members who meet the requirements get it." : "Enemies only. Gear can still give it to players."}
                    />
                    {move.players && (
                      <>
                        <Toggle
                          label="Must be learned"
                          checked={!!move.players.learned}
                          onChange={(v) => upsert({ ...move, players: { ...move.players, learned: v || undefined } })}
                          hint="Only from a move scroll or gear, not by meeting the requirements."
                        />
                        <RequirementsField
                          value={move.players.requirements}
                          onChange={(next) => upsert({ ...move, players: { ...move.players, requirements: next } })}
                          skills={skills}
                          hint="Who can use it. A Combat level here makes it a move you unlock."
                        />
                      </>
                    )}
                  </div>
                </Field>
                <p className="font-mono text-xs text-[var(--muted)]">id: {id}</p>
              </div>
            );
          }}
        />
      </Section>

      <Section
        title="Statuses"
        description="Lasting effects moves can put on: each one changes HP every turn by a share of max HP. Negative hurts (Bleeding, Poisoned), positive heals (Regenerating)."
        defaultOpen={false}
      >
        <div className="space-y-3">
          {Object.values(allStatuses).map((s) => {
            const set = (patch: Partial<StatusConfig>) => onStatuses({ ...allStatuses, [s.id]: { ...s, ...patch } });
            return (
              <div key={s.id} className="flex items-end gap-3">
                <div className="grid flex-1 gap-3 sm:grid-cols-3">
                  <TextField label="Name" value={s.name} onChange={(v) => set({ name: v })} />
                  <TextField label="Emoji" value={s.emoji} onChange={(v) => set({ emoji: v })} />
                  <NumberField label="HP per turn (% of max)" value={s.hpPercentPerTurn} min={-50} max={50} onChange={(v) => set({ hpPercentPerTurn: v })} />
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${s.name}`}
                  onClick={() => {
                    const next = { ...allStatuses };
                    delete next[s.id];
                    onStatuses(next);
                  }}
                  className="mb-2 text-[var(--muted)] transition-colors hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => {
              const id = idFromName("New status", Object.keys(allStatuses));
              onStatuses({ ...allStatuses, [id]: { id, name: "New status", emoji: "✨", hpPercentPerTurn: -5 } });
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
          >
            <Plus size={14} /> Add status
          </button>
        </div>
      </Section>
    </div>
  );
}
