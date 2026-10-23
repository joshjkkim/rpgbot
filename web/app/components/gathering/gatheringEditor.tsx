"use client";

import RequirementsField, { type Requirements, type SkillOption } from "@/app/components/ui/requirementsField";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Field,
  FieldGrid,
  KeyedList,
  NumberField,
  Section,
  SelectField,
  TextField,
  Toggle,
} from "@/app/components/ui/form";
import { ContentBrowser, EntryTooltip, idFromName } from "@/app/components/ui/slots";
import { ChannelsField, ItemField } from "@/app/components/ui/pickers";
import { ConditionsEditor, LocationConditionsField, TraitsField, type GameType, type GatheringCondition, type LocationTrait } from "./twistsEditor";

// ─── Types (mirrored from havocish/src/types/gathering.ts) ──────────────────────

export type { GameType } from "./twistsEditor";

export interface GatheringLoot {
  itemId: string;
  /** A weight: shown as a share of the location's total. */
  chance: number;
  min: number;
  max: number;
}

export interface GatheringLocation {
  id: string;
  name: string;
  emoji: string;
  minSkill: number;
  minToolTier?: number;
  requirements?: Requirements;
  skillXp: number;
  loot: GatheringLoot[];
  difficulty?: Record<string, number>;
  traits?: LocationTrait[];
  conditions?: { conditionId: string; weight?: number }[];
  calmWeight?: number;
}

export interface GatheringActivity {
  id: string;
  name: string;
  emoji: string;
  skillName: string;
  enabled: boolean;
  /** Runs a full bar holds, and seconds per point refilled. Mirrored from havocish/src/types/gathering.ts. */
  energyMax?: number;
  energyRefillSeconds?: number;
  game: GameType;
  words?: Record<string, string>;
  locations: Record<string, GatheringLocation>;
}

export interface GatheringConfig {
  enabled: boolean;
  channelIds?: string[];
  skill: { maxLevel: number; curveType: string; curveParams: Record<string, number> };
  activities: Record<string, GatheringActivity>;
  conditions?: Record<string, GatheringCondition>;
}

export const DEFAULT_GATHERING: GatheringConfig = {
  enabled: false,
  skill: { maxLevel: 50, curveType: "polynomial", curveParams: { factor: 13, degree: 1.62 } },
  activities: {},
};

/**
 * Each game's words and difficulty numbers, with the bot's defaults
 * (havocish/src/commands/user/gather.ts and player/gathering.ts). A word left
 * blank uses the default, so owners only fill in what they want to change.
 */
const GAMES: Record<GameType, {
  label: string;
  blurb: string;
  words: Array<{ key: string; label: string; fallback: string; hint?: string }>;
  difficulty: Array<{ key: string; label: string; fallback: number; hint?: string }>;
  difficultyLabel: string;
  /** One line on what the difficulty numbers add up to. */
  summary: (d: (key: string) => number) => string;
}> = {
  grid: {
    label: "Grid: push your luck",
    difficultyLabel: "How often players find something",
    blurb: "A 4×4 grid and a few tries. Each tile is a find, nothing, or a hazard that ends the run with half the haul. Players can leave any time.",
    words: [
      { key: "tile", label: "Hidden tile", fallback: "❔", hint: "Shown on tiles not yet revealed, like 🪨." },
      { key: "empty", label: "Empty tile", fallback: "·" },
      { key: "hazard", label: "Hazard", fallback: "💥" },
      { key: "hazardLine", label: "Hazard message", fallback: "Disaster! You get away with half of what you found." },
      { key: "leave", label: "Leave button", fallback: "Leave" },
      { key: "tries", label: "What tries are called", fallback: "tries", hint: "As in \"3 swings left\"." },
      { key: "verb", label: "Result verb", fallback: "found", hint: "As in \"@Ana mined Iron Ore ×2\"." },
    ],
    difficulty: [
      { key: "tries", label: "Tries", fallback: 5, hint: "Skill adds one every 12 levels." },
      { key: "finds", label: "Finds hidden", fallback: 5, hint: "Out of 16 tiles." },
      { key: "hazards", label: "Hazards hidden", fallback: 2, hint: "Skill removes one every 15 levels, never below 1." },
    ],
    summary: (d) => {
      const finds = Math.min(d("finds"), 15);
      const hazards = Math.min(d("hazards"), 16 - finds);
      return `${finds} finds · ${hazards} hazards · ${16 - finds - hazards} empty, out of 16 tiles, with ${d("tries")} tries. More finds mean something almost every run; fewer finds and better loot make a location feel rich but risky.`;
    },
  },
  timing: {
    label: "Timing: react to the signal",
    difficultyLabel: "How hard it is to land a find",
    blurb: "Players start an attempt, wait for the signal, and click in time. Uncommon and rarer finds then pull left or right before they're landed. A few attempts a run.",
    words: [
      { key: "start", label: "Start button", fallback: "Start", hint: "Like Cast." },
      { key: "waiting", label: "While waiting", fallback: "Wait for it…" },
      { key: "signal", label: "The signal", fallback: "❗ Now!", hint: "Like ❗ Bite!" },
      { key: "action", label: "React button", fallback: "Go", hint: "Like Reel. Clicking it before the signal fails the attempt." },
      { key: "early", label: "Clicked too early", fallback: "Too early, it got away." },
      { key: "late", label: "Clicked too late", fallback: "Too slow, it got away." },
      { key: "pull", label: "A find pulls", fallback: "It pulls {dir}!", hint: "{dir} becomes the left or right button's words." },
      { key: "left", label: "Left button", fallback: "⬅️ Left" },
      { key: "right", label: "Right button", fallback: "Right ➡️" },
      { key: "lost", label: "Wrong way", fallback: "Wrong way, it got away." },
      { key: "landed", label: "Landed", fallback: "Got it:", hint: "Followed by the item, like \"Landed: 🐟 Perch ×1\"." },
      { key: "attempts", label: "What attempts are called", fallback: "attempts", hint: "Like casts." },
      { key: "leave", label: "Leave button", fallback: "Leave" },
      { key: "verb", label: "Result verb", fallback: "got", hint: "As in \"@Ana caught Perch ×2\"." },
    ],
    difficulty: [
      { key: "attempts", label: "Attempts per run", fallback: 3 },
      { key: "windowMs", label: "Reaction window (ms)", fallback: 3000, hint: "Skill adds 30 ms a level. Never under 2500, since Discord clicks can arrive late." },
      { key: "maxRounds", label: "Most pulls", fallback: 3, hint: "Uncommon finds pull once, rare twice, epic and legendary three times, up to this." },
    ],
    summary: (d) =>
      `${d("attempts")} attempts a run, each one find if landed, with ${(d("windowMs") / 1000).toFixed(1)} s to react. Finds come from the loot table, so set rare items' chances to decide how often a fight-back happens.`,
  },
  find: {
    label: "Find it: spot the target",
    difficultyLabel: "How hard it is to spot",
    blurb: "A 4×4 patch of look-alikes hides the item being searched for. Players click it before time runs out; a wrong click costs two seconds. A few rounds a run.",
    words: [
      { key: "prompt", label: "The task", fallback: "Find the {target}!", hint: "{target} becomes the item's name." },
      { key: "decoys", label: "Look-alikes", fallback: "🌱 ☘️ 🍀 🌿 🍃 🌾", hint: "Emoji separated by spaces. Pick ones close to your items' emoji to make it harder." },
      { key: "wrong", label: "Wrong click", fallback: "Not that one!" },
      { key: "slow", label: "Ran out of time", fallback: "Too slow, it's gone." },
      { key: "rounds", label: "What rounds are called", fallback: "rounds" },
      { key: "leave", label: "Leave button", fallback: "Leave" },
      { key: "verb", label: "Result verb", fallback: "found", hint: "As in \"@Ana foraged Silverleaf ×3\"." },
    ],
    difficulty: [
      { key: "rounds", label: "Rounds per run", fallback: 3 },
      { key: "seconds", label: "Seconds per round", fallback: 8, hint: "Skill adds a second every 8 levels or so." },
      { key: "decoyKinds", label: "Kinds of look-alike", fallback: 3, hint: "More kinds make the target harder to pick out. Skill 20 removes one." },
    ],
    summary: (d) =>
      `${d("rounds")} rounds a run, each one find if spotted in ${d("seconds")} s among ${d("decoyKinds")} kinds of look-alike. Every item needs an emoji, since that's what players look for.`,
  },
};

const GAME_OPTIONS = (Object.keys(GAMES) as GameType[]).map((g) => ({ value: g, label: GAMES[g].label }));

type ShopItems = Record<string, { name?: string; emoji?: string }>;

type Props = {
  shopItems: ShopItems;
  /** Skills a requirement can name. */
  skills: SkillOption[];
  value: GatheringConfig | null | undefined;
  onChange: (next: GatheringConfig) => void;
};

function LocationEditor({
  location,
  game,
  shopItems,
  skills,
  conditions,
  onChange,
}: {
  location: GatheringLocation;
  game: GameType;
  shopItems: ShopItems;
  skills: SkillOption[];
  /** The server's daily conditions, for picking which this location can get. */
  conditions: Record<string, GatheringCondition>;
  onChange: (next: GatheringLocation) => void;
}) {
  const loot = location.loot ?? [];
  // Shares are of what can actually drop: entries for deleted items get nothing.
  const total = loot.reduce((sum, l) => sum + (l.chance > 0 && shopItems[l.itemId] ? l.chance : 0), 0);
  const patchLoot = (index: number, p: Partial<GatheringLoot>) =>
    onChange({ ...location, loot: loot.map((l, i) => (i === index ? { ...l, ...p } : l)) });

  return (
    <div className="space-y-4">
      <FieldGrid>
        <TextField label="Name" value={location.name} onChange={(v) => onChange({ ...location, name: v })} />
        <TextField label="Emoji" value={location.emoji ?? ""} onChange={(v) => onChange({ ...location, emoji: v })} />
        <NumberField
          label="Skill needed"
          value={location.minSkill ?? 1}
          min={1}
          onChange={(v) => onChange({ ...location, minSkill: v })}
          hint="Players see it once their skill reaches this."
        />
        <NumberField
          label="Tool tier needed"
          value={location.minToolTier ?? 0}
          min={0}
          onChange={(v) => onChange({ ...location, minToolTier: v > 0 ? v : undefined })}
          hint="0 means no tool needed. Make tools on the Items page."
        />
        <NumberField
          label="Skill XP per run"
          value={location.skillXp ?? 20}
          min={0}
          onChange={(v) => onChange({ ...location, skillXp: v })}
          hint="About 20 a run takes 25 runs to reach skill 10."
        />
      </FieldGrid>

      <TraitsField value={location.traits} onChange={(traits) => onChange({ ...location, traits })} game={game} />
      <LocationConditionsField
        value={location.conditions}
        calmWeight={location.calmWeight}
        conditions={conditions}
        onChange={(next) => onChange({ ...location, conditions: next.conditions, calmWeight: next.calmWeight })}
      />

      <RequirementsField
        items={shopItems}
        value={location.requirements}
        onChange={(next) => onChange({ ...location, requirements: next })}
        skills={skills}
        hint="On top of the skill and tool it needs. A location a member doesn't qualify for is skipped when /gather picks one for them."
      />

      <Field label="Loot" hint="Each find picks one entry. Chances are weights, so 3 and 1 means a 75% and 25% split.">
        <div className="space-y-2">
          {loot.length === 0 && <p className="text-xs text-[var(--muted)]">Nothing to find here yet.</p>}
          {loot.map((l, index) => {
            const share = total > 0 && l.chance > 0 && shopItems[l.itemId] ? Math.round((l.chance / total) * 1000) / 10 : 0;
            return (
              <div key={index} className="rounded-sm border border-[var(--border)] bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-[var(--muted)]">
                  <span>{share}% of finds</span>
                  <button
                    type="button"
                    aria-label="Remove loot"
                    onClick={() => onChange({ ...location, loot: loot.filter((_, i) => i !== index) })}
                    className="transition-colors hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <FieldGrid>
                  <ItemField items={shopItems} label="Item" value={l.itemId} onChange={(v) => patchLoot(index, { itemId: v })} emptyLabel="Choose an item" />
                  <NumberField label="Chance (weight)" value={l.chance} min={0} onChange={(v) => patchLoot(index, { chance: v })} />
                  <NumberField label="Min amount" value={l.min ?? 1} min={1} onChange={(v) => patchLoot(index, { min: v })} />
                  <NumberField label="Max amount" value={l.max ?? 1} min={1} onChange={(v) => patchLoot(index, { max: v })} />
                </FieldGrid>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => onChange({ ...location, loot: [...loot, { itemId: "", chance: 10, min: 1, max: 1 }] })}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
          >
            <Plus size={14} /> Add loot
          </button>
        </div>
      </Field>

      <Field
        label={GAMES[game].difficultyLabel}
        hint={GAMES[game].summary((key) => location.difficulty?.[key] ?? GAMES[game].difficulty.find((d) => d.key === key)?.fallback ?? 0)}
      >
          <FieldGrid>
            {GAMES[game].difficulty.map((d) => (
              <NumberField
                key={d.key}
                label={d.label}
                value={location.difficulty?.[d.key] ?? d.fallback}
                min={0}
                onChange={(v) => onChange({ ...location, difficulty: { ...(location.difficulty ?? {}), [d.key]: v } })}
                hint={d.hint}
              />
            ))}
          </FieldGrid>
      </Field>
    </div>
  );
}

export default function GatheringEditor({ value, onChange, shopItems, skills }: Props) {
  // A pack can add activities to a server that never saved gathering settings, so fill in the rest.
  const withDefaults = (v: GatheringConfig | null | undefined): GatheringConfig =>
    ({ ...DEFAULT_GATHERING, ...(v ?? {}), skill: { ...DEFAULT_GATHERING.skill, ...(v?.skill ?? {}) } });
  const [local, setLocal] = useState<GatheringConfig>(withDefaults(value));

  useEffect(() => {
    setLocal(withDefaults(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  function commit(next: GatheringConfig) {
    setLocal(next);
    onChange(next);
  }

  function upsertActivity(a: GatheringActivity) {
    commit({ ...local, activities: { ...(local.activities ?? {}), [a.id]: a } });
  }

  const entries = useMemo(
    () => Object.entries(local.activities ?? {}).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0])),
    [local.activities]
  );

  function renderActivity(id: string, a: GatheringActivity) {
    const game = GAMES[a.game] ? a.game : "grid";
    const words = a.words ?? {};
    const locations = Object.entries(a.locations ?? {}).sort((x, y) => (x[1].minSkill ?? 1) - (y[1].minSkill ?? 1));
    const setWord = (key: string, v: string) => {
      const next = { ...words };
      // Blank means "use the default", so the bot's wording keeps working.
      if (v) next[key] = v;
      else delete next[key];
      upsertActivity({ ...a, words: next });
    };

    return (
      <div className="space-y-5">
        <Toggle label="Active" checked={a.enabled !== false} onChange={(v) => upsertActivity({ ...a, enabled: v })} />
        <FieldGrid>
          <TextField label="Name" value={a.name} onChange={(v) => upsertActivity({ ...a, name: v })} hint="Players pick it in /gather." />
          <TextField label="Emoji" value={a.emoji ?? ""} onChange={(v) => upsertActivity({ ...a, emoji: v })} />
          <TextField label="Skill name" value={a.skillName} onChange={(v) => upsertActivity({ ...a, skillName: v })} hint="Like Mining or Salvaging." />
          <NumberField
            label="Energy (runs)"
            value={a.energyMax ?? 10}
            min={1}
            onChange={(v) => upsertActivity({ ...a, energyMax: v })}
            hint="Each run uses one. A full bar is one sitting's worth of play."
          />
          <NumberField
            label="Minutes per energy"
            value={Math.round(((a.energyRefillSeconds ?? 360) / 60) * 10) / 10}
            min={0.5}
            step={0.5}
            onChange={(v) => upsertActivity({ ...a, energyRefillSeconds: Math.round(v * 60) })}
            hint={`A full bar refills in about ${Math.round(((a.energyMax ?? 10) * (a.energyRefillSeconds ?? 360)) / 60)} minutes. Each activity has its own bar.`}
          />
          <SelectField label="Minigame" value={game} options={GAME_OPTIONS} onChange={(v) => upsertActivity({ ...a, game: v })} hint={GAMES[game].blurb} wide />
        </FieldGrid>

        <Field label="Wording" hint="Everything players see in the game. Leave a box blank to use the default shown in it.">
          <FieldGrid>
            {GAMES[game].words.map((w) => (
              <TextField key={w.key} label={w.label} value={words[w.key] ?? ""} placeholder={w.fallback} onChange={(v) => setWord(w.key, v)} hint={w.hint} />
            ))}
          </FieldGrid>
        </Field>

        <Field label="Locations" hint="Better locations open as the skill grows. One must need skill 1, or nobody can start.">
          <KeyedList<GatheringLocation>
            entries={locations}
            addPlaceholder="New location name"
            onAdd={(name) => {
              const lid = idFromName(name, Object.keys(a.locations ?? {}));
              upsertActivity({
                ...a,
                locations: { ...(a.locations ?? {}), [lid]: { id: lid, name, emoji: "📍", minSkill: 1, skillXp: 20, loot: [] } },
              });
            }}
            onRemove={(lid) => {
              const next = { ...(a.locations ?? {}) };
              delete next[lid];
              upsertActivity({ ...a, locations: next });
            }}
            empty="No locations yet. Add one so players have somewhere to go."
            itemLabel={(_, l) => `${l.emoji ?? ""} ${l.name} · skill ${l.minSkill ?? 1}+`}
            renderItem={(lid, l) => (
              <LocationEditor
                location={l}
                game={game}
                shopItems={shopItems}
                skills={skills}
                conditions={local.conditions ?? {}}
                onChange={(next) => upsertActivity({ ...a, locations: { ...(a.locations ?? {}), [lid]: next } })}
              />
            )}
          />
        </Field>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Section title="Activities" description="Skills players train with /gather, each played as a minigame you word yourself.">
        <ContentBrowser<GatheringActivity>
          entries={entries}
          newLabel="New activity"
          empty="No activities yet. Make one, or add a starter pack."
          look={(id, a) => ({ icon: a.emoji, label: a.name || id, faded: a.enabled === false })}
          tooltip={(id, a) => (
            <EntryTooltip
              title={`${a.emoji ?? ""} ${a.name || id}`}
              lines={[
                `${a.skillName} · ${GAMES[a.game]?.label ?? a.game}`,
                `${Object.keys(a.locations ?? {}).length} location${Object.keys(a.locations ?? {}).length === 1 ? "" : "s"} · ⚡ ${a.energyMax ?? 10}, +1 every ${Math.round((a.energyRefillSeconds ?? 360) / 60)} min`,
                a.enabled === false && "Inactive",
              ]}
            />
          )}
          onCreate={(name) => {
            const id = idFromName(name, Object.keys(local.activities ?? {}));
            upsertActivity({
              id,
              name,
              emoji: "⛏️",
              skillName: name,
              enabled: true,
              energyMax: 10,
              energyRefillSeconds: 360,
              game: "grid",
              words: {},
              locations: { start: { id: "start", name: "First location", emoji: "📍", minSkill: 1, skillXp: 20, loot: [] } },
            });
            return id;
          }}
          onRemove={(id) => {
            const next = { ...(local.activities ?? {}) };
            delete next[id];
            commit({ ...local, activities: next });
          }}
          renderItem={renderActivity}
        />
      </Section>

      <Section
        title="Daily conditions"
        description="Weather for your locations, or whatever fits your theme: each day a location can roll one of these, changing how it plays and what it pays. Make them here, then pick which each location can get."
        defaultOpen={false}
      >
        <ConditionsEditor value={local.conditions} onChange={(conditions) => commit({ ...local, conditions })} />
      </Section>

      <Section title="General" description="Whether members can gather at all." defaultOpen={!local.enabled}>
        <Toggle
          label="Enable gathering"
          checked={!!local.enabled}
          onChange={(v) => commit({ ...local, enabled: v })}
          hint="Members play activities with /gather. You can also switch this in /config."
        />
      </Section>

      <Section advanced title="Channels and skill curve" description="Where gathering works, and how fast skills grow." defaultOpen={false}>
        <div className="space-y-4">
          <ChannelsField
            wide
            label="Channels"
            value={local.channelIds ?? []}
            onChange={(v) => commit({ ...local, channelIds: v })}
            hint={(local.channelIds ?? []).length === 0 ? "None picked, so any channel." : undefined}
          />
          <FieldGrid>
            <NumberField
              label="Max skill"
              value={local.skill?.maxLevel ?? 50}
              min={1}
              onChange={(v) => commit({ ...local, skill: { ...local.skill, maxLevel: v } })}
            />
            <NumberField
              label="Curve factor"
              value={local.skill?.curveParams?.factor ?? 13}
              min={1}
              step={0.5}
              onChange={(v) => commit({ ...local, skill: { ...local.skill, curveParams: { ...local.skill.curveParams, factor: v } } })}
              hint="Higher makes every skill level cost more."
            />
            <NumberField
              label="Curve steepness"
              value={local.skill?.curveParams?.degree ?? 1.62}
              min={1}
              step={0.01}
              onChange={(v) => commit({ ...local, skill: { ...local.skill, curveParams: { ...local.skill.curveParams, degree: v } } })}
              hint="Higher makes late levels slower compared with early ones."
            />
          </FieldGrid>
        </div>
      </Section>
    </div>
  );
}
