"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Field, FieldGrid, NumberField, Section, TextField, Toggle } from "@/app/components/ui/form";
import { ContentBrowser, EntryTooltip, idFromName } from "@/app/components/ui/slots";
import { ItemField } from "@/app/components/ui/pickers";
import UploadButton from "@/app/components/ui/uploadButton";
import { EnemyMovesField } from "@/app/components/combat/combatEditor";
import { DEFAULT_MOVES, DEFAULT_STATUSES, type EnemyMove, type MoveConfig, type StatusConfig } from "@/app/components/combat/moveText";
import { twemojiUrl } from "@/app/daily/emoji";

// ─── Types (mirrored from havocish/src/types/pets.ts) ───────────────────────────

export type PetStats = { hp: number; atk: number; def: number; spd: number };
export interface PetStage { atLevel: number; name?: string; emoji?: string; image?: string; moves?: EnemyMove[] }
export interface PetSpecies {
  id: string;
  name: string;
  emoji: string;
  image?: string;
  enabled?: boolean;
  base: PetStats;
  growth: PetStats;
  maxLevel?: number;
  moves: EnemyMove[];
  stages?: PetStage[];
  words?: Record<string, string>;
}
export interface PetsConfig {
  enabled: boolean;
  species: Record<string, PetSpecies>;
  maxOwned?: number;
  xpShare?: number;
  canBeHit?: boolean;
  foods?: Record<string, number>;
}

const DEFAULT_PETS: PetsConfig = { enabled: false, species: {} };
const STATS: Array<{ key: keyof PetStats; label: string }> = [
  { key: "hp", label: "❤️ HP" }, { key: "atk", label: "⚔️ Attack" }, { key: "def", label: "🛡️ Defense" }, { key: "spd", label: "💨 Speed" },
];
/** Every word players see, with the bot's defaults (havocish/src/commands/user/pet.ts). */
const WORDS: Array<{ key: string; label: string; fallback: string }> = [
  { key: "fed", label: "After feeding ({pet}, {item}, {xp})", fallback: "{pet} ate {item}. +{xp} XP" },
  { key: "levelUp", label: "Level up ({pet}, {level})", fallback: "{pet} reached level {level}!" },
  { key: "grew", label: "New stage ({pet}, {stage})", fallback: "{pet} grew: {stage}!" },
  { key: "feed", label: "Feed menu", fallback: "Feed it…" },
  { key: "switch", label: "Switch menu", fallback: "Switch pet…" },
  { key: "rename", label: "Rename button", fallback: "Rename" },
  { key: "release", label: "Release button", fallback: "Release" },
  { key: "releaseAsk", label: "Release question ({pet})", fallback: "Let {pet} go for good? This can't be undone." },
  { key: "released", label: "After releasing ({pet})", fallback: "{pet} wandered off. Goodbye, {pet}." },
  { key: "level", label: "Level", fallback: "Level" },
];

type ShopItems = Record<string, { name?: string; emoji?: string; actions?: Record<number, { type: string; petId?: string } | undefined> }>;
const smallButton = "inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]";
const removeButton = "text-[var(--muted)] transition-colors hover:text-red-400";

const statsAt = (s: PetSpecies, level: number): PetStats => {
  const n = Math.max(0, level - 1);
  const stat = (k: keyof PetStats) => Math.max(k === "hp" ? 1 : 0, Math.round((s.base?.[k] ?? 0) + (s.growth?.[k] ?? 0) * n));
  return { hp: stat("hp"), atk: stat("atk"), def: stat("def"), spd: stat("spd") };
};
const sortedStages = (s: PetSpecies) => [...(s.stages ?? [])].sort((a, b) => a.atLevel - b.atLevel);

function Picture({ emoji, image, size = 48 }: { emoji: string; image?: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- managed uploads and Twemoji, drawn pixelated
  return <img src={image || twemojiUrl(emoji || "🐾")} alt="" width={size} height={size} className="shrink-0" style={{ imageRendering: image ? "auto" : "pixelated" }} />;
}

/** The species at each stage, as members see it on /pet: picture, stage, stats and moves. */
export function StagePreview({ species, moves }: { species: PetSpecies; moves: Record<string, MoveConfig> }) {
  const max = Math.max(1, species.maxLevel ?? 30);
  const stops = [...new Set([1, ...sortedStages(species).map((s) => s.atLevel).filter((l) => l >= 1 && l <= max), max])].sort((a, b) => a - b);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {stops.map((level) => {
        const reached = sortedStages(species).filter((s) => s.atLevel <= level);
        const at = reached.at(-1);
        const st = statsAt(species, level);
        const known = [...new Set([...(species.moves ?? []), ...reached.flatMap((s) => s.moves ?? [])].map((m) => m.moveId))].map((id) => moves[id]).filter(Boolean);
        return (
          <div key={level} className="flex gap-3 rounded-sm border border-[var(--border)] bg-black/20 p-3">
            <Picture emoji={at?.emoji || species.emoji} image={at?.image || species.image} />
            <div className="min-w-0 text-sm">
              <div className="font-medium">{species.name || "New pet"}</div>
              <div className="text-xs text-[var(--muted)]">Level {level}{at?.name ? ` · ${at.name}` : ""}</div>
              <div className="mt-1 font-mono text-xs">❤️ {st.hp} · ⚔️ {st.atk} · 🛡️ {st.def} · 💨 {st.spd}</div>
              {known.length > 0 && <div className="mt-1 truncate text-xs text-[var(--muted)]">{known.map((m) => `${m!.emoji} ${m!.name}`).join(" · ")}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ImageField({ guildId, label, value, onChange }: { guildId: string; label: string; value?: string; onChange: (path: string | undefined) => void }) {
  return (
    <Field label={label} hint="Optional. PNG, JPEG, GIF or WebP, up to 512 KB. Square works best. Without one, the emoji is shown.">
      <UploadButton guildId={guildId} label={value ? "Replace picture" : "Upload a picture"} onUploaded={(url) => onChange(new URL(url).pathname)} />
      {value && (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- managed uploaded artwork */}
          <img src={value} alt="" className="h-12 w-12 border border-[var(--border)] object-contain" />
          <button type="button" className="text-sm text-[var(--muted)] underline" onClick={() => onChange(undefined)}>Use the emoji</button>
        </div>
      )}
    </Field>
  );
}

type Stations = Record<string, { name?: string; emoji?: string; style?: string; recipes?: Record<string, { output?: { petId?: string } }> }>;
const link = "text-[var(--accent)] underline";

export default function PetsEditor({ guildId, value, onChange, shopItems, moves, statuses, stations = {} }: {
  guildId: string;
  /** Crafting stations, to link the nurseries that hatch each species. */
  stations?: Stations;
  value: PetsConfig | null | undefined;
  onChange: (next: PetsConfig) => void;
  shopItems: ShopItems;
  moves: Record<string, MoveConfig> | undefined;
  statuses: Record<string, StatusConfig> | undefined;
}) {
  const [local, setLocal] = useState<PetsConfig>(value ?? DEFAULT_PETS);
  // ?open=<species id> opens that species, for links from the Crafting page.
  const [open, setOpen] = useState<string | null>(useSearchParams().get("open"));
  // A new value from outside (a reload, Save) replaces the local copy, checked while rendering.
  const valueKey = JSON.stringify(value ?? null);
  const [seen, setSeen] = useState(valueKey);
  if (valueKey !== seen) {
    setSeen(valueKey);
    setLocal(value ?? DEFAULT_PETS);
  }
  const allMoves = moves ?? DEFAULT_MOVES;
  const allStatuses = statuses ?? DEFAULT_STATUSES;

  function commit(next: PetsConfig) {
    setLocal(next);
    onChange(next);
  }
  const upsert = (s: PetSpecies) => commit({ ...local, species: { ...(local.species ?? {}), [s.id]: s } });
  const entries = useMemo(() => Object.entries(local.species ?? {}).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0])), [local.species]);
  const foods = Object.entries(local.foods ?? {});
  const setFoods = (next: [string, number][]) => commit({ ...local, foods: Object.fromEntries(next) });

  function renderSpecies(id: string, s: PetSpecies) {
    const stages = s.stages ?? [];
    const setStage = (i: number, p: Partial<PetStage>) => upsert({ ...s, stages: stages.map((x, j) => (j === i ? { ...x, ...p } : x)) });
    const givenBy = Object.entries(shopItems).filter(([, it]) => Object.values(it.actions ?? {}).some((a) => a?.type === "givePet" && a.petId === id));
    const hatchedAt = Object.entries(stations).filter(([, st]) => Object.values(st.recipes ?? {}).some((r) => r.output?.petId === id));
    return (
      <div className="space-y-5">
        <Toggle label="Active" checked={s.enabled !== false} onChange={(v) => upsert({ ...s, enabled: v })} hint="An inactive species can't be given or hatched. Members who have one keep it, but it doesn't show." />
        <FieldGrid>
          <TextField label="Name" value={s.name} onChange={(v) => upsert({ ...s, name: v })} hint="Also the name a new pet starts with. Members can rename theirs." />
          <TextField label="Emoji" value={s.emoji ?? ""} onChange={(v) => upsert({ ...s, emoji: v })} />
          <NumberField label="Max level" value={s.maxLevel ?? 30} min={1} max={100} onChange={(v) => upsert({ ...s, maxLevel: v })} hint="Never above the skill cap set on the Gathering page. Pets level on the same curve as skills." />
        </FieldGrid>
        <ImageField guildId={guildId} label="Picture" value={s.image} onChange={(image) => upsert({ ...s, image })} />
        <Field label="Stats at level 1" hint="A pet fights beside its owner, so keep it well below a player's own stats.">
          <FieldGrid>{STATS.map((k) => <NumberField key={k.key} label={k.label} value={s.base?.[k.key] ?? 0} min={0} onChange={(v) => upsert({ ...s, base: { ...s.base, [k.key]: v } })} />)}</FieldGrid>
        </Field>
        <Field label="Gained per level" hint="Decimals add up: 0.5 attack per level is +1 every two levels.">
          <FieldGrid>{STATS.map((k) => <NumberField key={k.key} label={k.label} value={s.growth?.[k.key] ?? 0} min={0} step={0.1} onChange={(v) => upsert({ ...s, growth: { ...s.growth, [k.key]: v } })} />)}</FieldGrid>
        </Field>
        <EnemyMovesField
          value={s.moves}
          onChange={(next) => upsert({ ...s, moves: next ?? [] })}
          moves={allMoves}
          statuses={allStatuses}
          hint="Each turn, right after its owner, it picks one by weight among those whose condition holds. Effects aimed at itself (heals, guards, boosts) land on its owner instead."
        />
        <Field label="Stages" hint="From a level on, it looks different and can learn more moves. The latest stage reached is the one shown.">
          <div className="space-y-3">
            {stages.map((st, i) => (
              <div key={i} className="space-y-3 rounded-sm border border-[var(--border)] bg-black/20 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{st.emoji ?? ""} {st.name || `Stage ${i + 1}`}</span>
                  <button type="button" aria-label="Remove stage" onClick={() => upsert({ ...s, stages: stages.filter((_, j) => j !== i) })} className={removeButton}><Trash2 size={14} /></button>
                </div>
                <FieldGrid>
                  <NumberField label="From level" value={st.atLevel} min={1} onChange={(v) => setStage(i, { atLevel: v })} />
                  <TextField label="Stage name" value={st.name ?? ""} placeholder="Young" onChange={(v) => setStage(i, { name: v || undefined })} />
                  <TextField label="Emoji" value={st.emoji ?? ""} placeholder={s.emoji} onChange={(v) => setStage(i, { emoji: v || undefined })} />
                </FieldGrid>
                <ImageField guildId={guildId} label="Picture" value={st.image} onChange={(image) => setStage(i, { image })} />
                <EnemyMovesField value={st.moves} onChange={(next) => setStage(i, { moves: next })} moves={allMoves} statuses={allStatuses} hint="Added to its moves from this stage on." />
              </div>
            ))}
            <button type="button" className={smallButton} onClick={() => upsert({ ...s, stages: [...stages, { atLevel: (sortedStages(s).at(-1)?.atLevel ?? 0) + 10 }] })}><Plus size={14} /> Add stage</button>
          </div>
        </Field>
        <Field label="Preview" hint="What /pet shows at each stage.">
          <StagePreview species={s} moves={allMoves} />
        </Field>
        <Field label="How members get one" hint="Hatch it in a timed station on the Crafting page (Makes a pet), or give an item the Give a pet use action on the Items page.">
          <div className="space-y-1 text-sm">
            {hatchedAt.length > 0 && <p>Hatches at {hatchedAt.map(([sid, st], i) => (
              <span key={sid}>{i > 0 && ", "}<Link href={`/dashboard/${guildId}/crafting?open=${sid}`} className={link}>{`${st.emoji ?? ""} ${st.name ?? sid}`.trim()}</Link></span>
            ))}</p>}
            {givenBy.length > 0 && <p>Given by {givenBy.map(([iid, it], i) => (
              <span key={iid}>{i > 0 && ", "}<Link href={`/dashboard/${guildId}/items?open=${iid}`} className={link}>{`${it.emoji ?? ""} ${it.name}`.trim()}</Link></span>
            ))}</p>}
            {!hatchedAt.length && !givenBy.length && <p className="text-xs text-[var(--muted)]">Nothing gives it yet. Set one up on the <Link href={`/dashboard/${guildId}/crafting`} className={link}>Crafting</Link> or <Link href={`/dashboard/${guildId}/items`} className={link}>Items</Link> page.</p>}
          </div>
        </Field>
        <Field label="Wording" hint="Leave a box blank to use the default shown in it.">
          <FieldGrid>
            {WORDS.map((w) => (
              <TextField key={w.key} label={w.label} value={s.words?.[w.key] ?? ""} placeholder={w.fallback} onChange={(v) => {
                const words = { ...(s.words ?? {}) };
                if (v) words[w.key] = v; else delete words[w.key];
                upsert({ ...s, words });
              }} />
            ))}
          </FieldGrid>
        </Field>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Section title="Species" description="The kinds of pet members can have. Each levels up, changes as it grows and fights beside its owner.">
        <ContentBrowser<PetSpecies>
          entries={entries}
          newLabel="New species"
          empty="No species yet. Make one, like a wolf, a drake or a drone."
          look={(sid, s) => ({ icon: s.emoji, label: s.name || sid, faded: s.enabled === false })}
          tooltip={(sid, s) => <EntryTooltip title={`${s.emoji ?? ""} ${s.name || sid}`} lines={[`Up to level ${s.maxLevel ?? 30}`, `${(s.stages ?? []).length} stages · ${(s.moves ?? []).length} moves`, s.enabled === false && "Inactive"]} />}
          onCreate={(name) => {
            const sid = idFromName(name, Object.keys(local.species ?? {}));
            upsert({ id: sid, name, emoji: "🐾", enabled: true, base: { hp: 40, atk: 5, def: 2, spd: 6 }, growth: { hp: 5, atk: 0.8, def: 0.4, spd: 0.3 }, maxLevel: 30, moves: [{ moveId: "attack", weight: 1 }], stages: [] });
            return sid;
          }}
          onRemove={(sid) => {
            const next = { ...(local.species ?? {}) };
            delete next[sid];
            commit({ ...local, species: next });
          }}
          renderItem={renderSpecies}
          selected={open && local.species?.[open] ? open : null}
          onSelect={setOpen}
        />
      </Section>

      <Section title="Food" description="Items members feed their pet in /pet, and the pet XP each gives.">
        <div className="space-y-2">
          {foods.map(([itemId, xp], i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1"><ItemField items={shopItems} label={i === 0 ? "Item" : undefined} value={itemId} onChange={(v) => setFoods(foods.map((f, j) => (j === i ? [v, f[1]] : f)))} emptyLabel="Choose an item" /></div>
              <div className="w-28"><NumberField label={i === 0 ? "Pet XP" : undefined} value={xp} min={1} onChange={(v) => setFoods(foods.map((f, j) => (j === i ? [f[0], v] : f)))} /></div>
              <button type="button" aria-label="Remove food" onClick={() => setFoods(foods.filter((_, j) => j !== i))} className={`${removeButton} mb-2.5`}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className={smallButton} onClick={() => setFoods([...foods, ["", 10]])}><Plus size={14} /> Add food</button>
        </div>
      </Section>

      <Section title="General" description="Whether members can have pets, and how they work in fights." defaultOpen={!local.enabled}>
        <Toggle label="Enable pets" checked={!!local.enabled} onChange={(v) => commit({ ...local, enabled: v })} hint="Members see theirs with /pet." />
        <FieldGrid>
          <NumberField label="Pets a member can keep" value={local.maxOwned ?? 10} min={1} max={50} onChange={(v) => commit({ ...local, maxOwned: v })} hint="One is active at a time; members switch in /pet." />
          <NumberField label="Fight XP share (%)" value={local.xpShare ?? 50} min={0} max={200} onChange={(v) => commit({ ...local, xpShare: v })} hint="On a win, the active pet gets this share of the XP its owner got. 0 means pets only level from food." />
        </FieldGrid>
        <Toggle label="Enemies can hit pets" checked={!!local.canBeHit} onChange={(v) => commit({ ...local, canBeHit: v })}
          hint={local.canBeHit ? "Enemies sometimes target a pet instead of its owner. At 0 HP it sits out the rest of that fight. Pets are never lost, and start every fight at full HP." : "Enemies only ever target players, so bringing a pet has no risk."} />
      </Section>
    </div>
  );
}
