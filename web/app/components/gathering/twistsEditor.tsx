"use client";

import { Plus, Trash2 } from "lucide-react";
import { Field, FieldGrid, NumberField, SelectField, TextField } from "@/app/components/ui/form";
import { idFromName } from "@/app/components/ui/slots";

// ─── Types (mirrored from havocish/src/types/gathering.ts and player/twists.ts) ───

export type GameType = "grid" | "timing" | "find";

export type TwistRule =
  | "grid.adjacent" | "grid.clustered" | "grid.unstable"
  | "timing.falseAlarm" | "timing.twice" | "timing.fragile"
  | "find.glimpse" | "find.reshuffle" | "find.twin";

export interface TwistEffects {
  difficulty?: number;
  rareLoot?: number;
  yield?: number;
  xp?: number;
  energy?: number;
  rules?: TwistRule[];
}

export interface LocationTrait {
  name: string;
  emoji: string;
  line?: string;
  effects: TwistEffects;
}

export interface GatheringCondition {
  id: string;
  name: string;
  emoji: string;
  line?: string;
  effects: TwistEffects;
}

/** Mirrors the bot's RULES: the game each belongs to, and what it does. */
export const RULES: Record<TwistRule, { game: GameType; name: string; line: string }> = {
  "grid.adjacent": { game: "grid", name: "Only next to opened", line: "You can only open tiles next to ones you've uncovered." },
  "grid.clustered": { game: "grid", name: "Clustered finds", line: "Finds come in clusters: one find means more nearby." },
  "grid.unstable": { game: "grid", name: "Unstable", line: "Hit a hazard and you lose everything, not half." },
  "timing.falseAlarm": { game: "timing", name: "False alarms", line: "Some signals are false: don't jump at the first one." },
  "timing.twice": { game: "timing", name: "Twice", line: "It takes two good reactions in a row to land one." },
  "timing.fragile": { game: "timing", name: "Fragile", line: "One miss and the run is over." },
  "find.glimpse": { game: "find", name: "Glimpse", line: "You only see it for a moment: remember where it was." },
  "find.reshuffle": { game: "find", name: "Reshuffle", line: "A wrong pick scrambles everything." },
  "find.twin": { game: "find", name: "Twin", line: "There are two to find each round." },
};

const GAME_NAMES: Record<GameType, string> = { grid: "Grid", timing: "Timing", find: "Find it" };

/** What a set of effects does, in a line, for previews and lists. */
export function describeEffects(e: TwistEffects | undefined, game?: GameType): string {
  if (!e) return "No effect yet.";
  const parts = [
    e.difficulty ? `${e.difficulty > 0 ? "Harder" : "Easier"} (${e.difficulty > 0 ? "+" : ""}${e.difficulty})` : "",
    e.rareLoot && e.rareLoot !== 100 ? `rare finds ×${(e.rareLoot / 100).toFixed(e.rareLoot % 100 ? 1 : 0)}` : "",
    e.yield ? `+${e.yield} per find` : "",
    e.xp && e.xp !== 100 ? `skill XP ×${(e.xp / 100).toFixed(e.xp % 100 ? 1 : 0)}` : "",
    e.energy ? `costs ${1 + e.energy} energy` : "",
    ...(e.rules ?? []).filter((r) => !game || RULES[r]?.game === game).map((r) => RULES[r]?.name ?? r),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No effect yet.";
}

/** The effects themselves. With `game`, only that game's rules are offered; without, all of them by game. */
export function EffectsEditor({ value, onChange, game }: { value: TwistEffects; onChange: (next: TwistEffects) => void; game?: GameType }) {
  const set = (patch: Partial<TwistEffects>) => onChange({ ...value, ...patch });
  const rules = new Set(value.rules ?? []);
  const toggle = (r: TwistRule) => {
    const next = new Set(rules);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    set({ rules: next.size ? [...next] : undefined });
  };
  const games = game ? [game] : (Object.keys(GAME_NAMES) as GameType[]);
  return (
    <div className="space-y-3">
      <FieldGrid>
        <NumberField label="Difficulty" value={value.difficulty ?? 0} min={-3} max={3} onChange={(v) => set({ difficulty: v || undefined })} hint="+1 is a step harder, −1 easier. Each game reads it its own way." />
        <NumberField label="Rare finds (%)" value={value.rareLoot ?? 100} min={0} max={500} step={10} onChange={(v) => set({ rareLoot: v === 100 ? undefined : v })} hint="200 makes rare-and-up items twice as likely." />
        <NumberField label="Extra per find" value={value.yield ?? 0} min={0} max={10} onChange={(v) => set({ yield: v || undefined })} />
        <NumberField label="Skill XP (%)" value={value.xp ?? 100} min={0} max={500} step={10} onChange={(v) => set({ xp: v === 100 ? undefined : v })} />
        <NumberField label="Extra energy" value={value.energy ?? 0} min={0} max={5} onChange={(v) => set({ energy: v || undefined })} hint="On top of the usual 1 a run." />
      </FieldGrid>
      <Field label="Rules" hint={game ? "Change how the game plays here." : "Each rule only works on locations whose activity plays that game."}>
        <div className="space-y-2">
          {games.map((g) => (
            <div key={g} className="flex flex-wrap items-center gap-1.5">
              {!game && <span className="w-16 text-xs text-[var(--muted)]">{GAME_NAMES[g]}</span>}
              {(Object.keys(RULES) as TwistRule[]).filter((r) => RULES[r].game === g).map((r) => (
                <button
                  key={r}
                  type="button"
                  title={RULES[r].line}
                  aria-pressed={rules.has(r)}
                  onClick={() => toggle(r)}
                  className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                    rules.has(r) ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--border-bright)]"
                  }`}
                >
                  {RULES[r].name}
                </button>
              ))}
            </div>
          ))}
        </div>
      </Field>
    </div>
  );
}

const cardClass = "rounded-md border border-[var(--border)] bg-[var(--surface)] p-3";
const smallButton = "inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]";

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="text-[var(--muted)] transition-colors hover:text-red-400">
      <Trash2 size={14} />
    </button>
  );
}

/** A location's traits: its fixed character. */
export function TraitsField({ value, onChange, game }: { value: LocationTrait[] | undefined; onChange: (next: LocationTrait[] | undefined) => void; game: GameType }) {
  const traits = value ?? [];
  const set = (next: LocationTrait[]) => onChange(next.length ? next : undefined);
  return (
    <Field label="Traits" hint="What makes this place itself, every day: “Pitch dark”, “Fast water”. Shown when a run starts.">
      <div className="space-y-3">
        {traits.map((t, i) => {
          const patch = (p: Partial<LocationTrait>) => set(traits.map((x, j) => (j === i ? { ...x, ...p } : x)));
          return (
            <div key={i} className={cardClass}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm">{t.emoji} <span className="font-medium">{t.name || "Unnamed"}</span> <span className="text-xs text-[var(--muted)]">{describeEffects(t.effects, game)}</span></p>
                <RemoveButton label="Remove trait" onClick={() => set(traits.filter((_, j) => j !== i))} />
              </div>
              <div className="space-y-3">
                <FieldGrid>
                  <TextField label="Name" value={t.name} onChange={(v) => patch({ name: v })} />
                  <TextField label="Emoji" value={t.emoji} onChange={(v) => patch({ emoji: v })} />
                  <TextField wide label="Line" value={t.line ?? ""} onChange={(v) => patch({ line: v || undefined })} placeholder="Without one, its rules describe themselves." />
                </FieldGrid>
                <EffectsEditor value={t.effects ?? {}} onChange={(effects) => patch({ effects })} game={game} />
              </div>
            </div>
          );
        })}
        <button type="button" onClick={() => set([...traits, { name: "New trait", emoji: "✦", effects: {} }])} className={smallButton}>
          <Plus size={14} /> Add a trait
        </button>
      </div>
    </Field>
  );
}

/** Which of the server's conditions a location can get on a day, and how likely each is. */
export function LocationConditionsField({ value, calmWeight, onChange, conditions }: {
  value: { conditionId: string; weight?: number }[] | undefined;
  calmWeight: number | undefined;
  onChange: (next: { conditions?: { conditionId: string; weight?: number }[]; calmWeight?: number }) => void;
  conditions: Record<string, GatheringCondition>;
}) {
  const list = value ?? [];
  const calm = calmWeight ?? 2;
  const total = calm + list.reduce((sum, c) => sum + (c.weight ?? 1), 0);
  const options = Object.values(conditions).map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }));
  const set = (next: typeof list) => onChange({ conditions: next.length ? next : undefined, calmWeight });
  if (!options.length) {
    return <Field label="Daily conditions"><p className="text-xs text-[var(--muted)]">Make conditions under Daily conditions below, then pick which this place can get.</p></Field>;
  }
  return (
    <Field label="Daily conditions" hint="Each day this place rolls one of these, or none. Everyone sees the same, and it changes at midnight UTC.">
      <div className="space-y-2">
        {list.map((c, i) => (
          <div key={i} className="flex items-end gap-3">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <SelectField label="Condition" value={c.conditionId} onChange={(v) => set(list.map((x, j) => (j === i ? { ...x, conditionId: v } : x)))} options={options.some((o) => o.value === c.conditionId) ? options : [{ value: c.conditionId, label: `Deleted (${c.conditionId})` }, ...options]} />
              <NumberField label="Weight" value={c.weight ?? 1} min={0} onChange={(v) => set(list.map((x, j) => (j === i ? { ...x, weight: v } : x)))} hint={`About ${Math.round(((c.weight ?? 1) / total) * 100)}% of days.`} />
            </div>
            <div className="mb-2"><RemoveButton label="Remove condition" onClick={() => set(list.filter((_, j) => j !== i))} /></div>
          </div>
        ))}
        {list.length > 0 && (
          <NumberField label="Calm days (weight)" value={calm} min={0} onChange={(v) => onChange({ conditions: list, calmWeight: v === 2 ? undefined : v })} hint={`About ${Math.round((calm / total) * 100)}% of days have no condition.`} />
        )}
        <button type="button" onClick={() => set([...list, { conditionId: options[0]!.value, weight: 1 }])} className={smallButton}>
          <Plus size={14} /> Add a condition
        </button>
      </div>
    </Field>
  );
}

/** The server's conditions: made once, given to any location. */
export function ConditionsEditor({ value, onChange }: { value: Record<string, GatheringCondition> | undefined; onChange: (next: Record<string, GatheringCondition>) => void }) {
  const all = value ?? {};
  const upsert = (c: GatheringCondition) => onChange({ ...all, [c.id]: c });
  return (
    <div className="space-y-3">
      {Object.values(all).map((c) => (
        <div key={c.id} className={cardClass}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm">{c.emoji} <span className="font-medium">{c.name}</span> <span className="text-xs text-[var(--muted)]">{describeEffects(c.effects)}</span></p>
            <RemoveButton label={`Remove ${c.name}`} onClick={() => {
              const next = { ...all };
              delete next[c.id];
              onChange(next);
            }} />
          </div>
          <div className="space-y-3">
            <FieldGrid>
              <TextField label="Name" value={c.name} onChange={(v) => upsert({ ...c, name: v })} />
              <TextField label="Emoji" value={c.emoji} onChange={(v) => upsert({ ...c, emoji: v })} />
              <TextField wide label="Line" value={c.line ?? ""} onChange={(v) => upsert({ ...c, line: v || undefined })} placeholder="Rain lashes down." hint="Shown as “⛈️ Storm today: …” when a run starts." />
            </FieldGrid>
            <EffectsEditor value={c.effects ?? {}} onChange={(effects) => upsert({ ...c, effects })} />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const id = idFromName("New condition", Object.keys(all));
          upsert({ id, name: "New condition", emoji: "🌤️", effects: {} });
        }}
        className={smallButton}
      >
        <Plus size={14} /> Add a condition
      </button>
    </div>
  );
}
