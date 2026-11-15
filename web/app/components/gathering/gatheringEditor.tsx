"use client";

import RequirementsField, { type Requirements, type SkillOption } from "@/app/components/ui/requirementsField";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  ColorField,
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
import { GRID_COLOUR_KEYS, GRID_COLOUR_LABELS, GRID_LOOKS, gridPalette, type GridColours, type GridLook } from "@content/gridLooks";
import { GRID_SETTINGS, gridSettings } from "@content/gridSettings";
import UploadButton from "@/app/components/ui/uploadButton";
import GridPreview from "./gridPreview";
import { normalizeGathering } from "@content/normalizeGathering";
import GamePreview from "./gamePreview";
import { sceneArtSlots, scenePalette, SCENE_COLOUR_LABELS, TIMING_SCENES, timingSceneOf, FIND_SCENES, findSceneOf, type TimingScene, type FindScene } from "@content/gatheringScenes";
import { PUZZLE_SCENES, puzzleSceneOf, type PuzzleScene } from "@content/puzzleDraw";
import { PUZZLE_SETTINGS, PUZZLE_WORDS, puzzleRules } from "@content/puzzle";
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
  timingScene?: TimingScene;
  findScene?: FindScene;
  puzzleScene?: PuzzleScene;
  /** A scene palette and optional colour overrides. */
  look?: GridLook;
  colours?: Partial<GridColours>;
  art?: Record<string, string>;
  words?: Record<string, string>;
  locations: Record<string, GatheringLocation>;
}

export interface GatheringConfig {
  enabled: boolean;
  channelIds?: string[];
  skill: { maxLevel: number; curveType: string; curveParams: Record<string, number> };
  activities: Record<string, GatheringActivity>;
  conditions?: Record<string, GatheringCondition>;
  /** How long a condition lasts before locations roll again (default 6). */
  conditionHours?: number;
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
  difficulty: Array<{ key: string; label: string; fallback: number; hint?: string; min?: number; max?: number; toggle?: boolean }>;
  difficultyLabel: string;
  /** One line on what the difficulty numbers add up to. */
  summary: (d: (key: string) => number) => string;
}> = {
  puzzle: {
    label: "Puzzle: rotate to connect",
    difficultyLabel: "Puzzle rules",
    blurb: "Rotate tiles clockwise to connect an entrance to a goal. Every board has a solution within its move budget. Items and skill XP are earned by completing the connection.",
    words: [
      { key: "prompt", label: "Objective", fallback: PUZZLE_WORDS.prompt, hint: "{start} and {goal} include the named endpoints and their coordinates." },
      { key: "hint", label: "Instructions", fallback: PUZZLE_WORDS.hint },
      { key: "source", label: "Entrance name", fallback: PUZZLE_WORDS.source },
      { key: "goal", label: "Goal name", fallback: PUZZLE_WORDS.goal },
      { key: "moves", label: "Move counter", fallback: PUZZLE_WORDS.moves },
      { key: "rotate", label: "Tile button", fallback: PUZZLE_WORDS.rotate, hint: "{tile} is its coordinate, {shape} shows its connections." },
      { key: "turned", label: "After rotating", fallback: PUZZLE_WORDS.turned },
      { key: "solved", label: "Solved", fallback: PUZZLE_WORDS.solved },
      { key: "failed", label: "Out of moves", fallback: PUZZLE_WORDS.failed },
      { key: "leave", label: "Leave button", fallback: PUZZLE_WORDS.leave },
      { key: "verb", label: "Result verb", fallback: PUZZLE_WORDS.verb },
    ],
    difficulty: Object.entries(PUZZLE_SETTINGS).map(([key, setting]) => ({ key, ...setting })),
    summary: (d) => `A solvable 4×4 board with ${d("extraMoves")} extra moves and ${d("rewards")} loot rolls on completion. Skill adds a move every 10 levels; tools add their bonus.`,
  },
  grid: {
    label: "Grid: uncover a path",
    difficultyLabel: "Game rules",
    blurb: "Work through obstacles to uncover finds. Change the rules, artwork and words to make a mine, a ship to salvage, or somewhere entirely your own.",
    words: [
      { key: "rock", label: "Normal obstacle symbol", fallback: "🪨", hint: "On the buttons for ordinary obstacles." },
      { key: "hard", label: "Tough obstacle symbol", fallback: "⬛", hint: "Durability is set in each location's game rules." },
      { key: "loose", label: "Unstable obstacle symbol", fallback: "⚠️", hint: "Falls when cleared underneath, if falling hazards are enabled." },
      { key: "dark", label: "Out of the light", fallback: "▒" },
      { key: "empty", label: "Cleared space symbol", fallback: "·" },
      { key: "you", label: "Where the player stands", fallback: "🧍" },
      { key: "crack", label: "A swing that doesn't break it", fallback: "It cracks." },
      { key: "clean", label: "A clean strike", fallback: "Clean strike!", hint: "Does one more. Skill makes them likelier." },
      { key: "broke", label: "Broke through", fallback: "It breaks away." },
      { key: "got", label: "A find", fallback: "Got {item}!" },
      { key: "fall", label: "Loose rock lands on them", fallback: "Loose rock comes down on you! −{n} {tries}." },
      { key: "hint", label: "How to play", fallback: "Instructions follow your rules automatically.", hint: "Leave blank for instructions matching adjacency and falling hazards." },
      { key: "leave", label: "Leave button", fallback: "Leave" },
      { key: "tries", label: "What actions are called", fallback: "swings", hint: "For example, charges or attempts." },
      { key: "verb", label: "Result verb", fallback: "found", hint: "As in \"@Ana mined Iron Ore ×2\"." },
    ],
    difficulty: Object.entries(GRID_SETTINGS).map(([key, rule]) => ({ key, ...rule })),
    summary: (d) => `${d("ores")} finds in a 5×4 board, with ${d("swings")} actions before skill bonuses and conditions. Rules apply to this location; artwork and wording come from the activity.`,
  },
  timing: {
    label: "Timing: react to the signal",
    difficultyLabel: "How hard it is to land a find",
    blurb: "Players start an attempt, wait for the signal, and react in time. Rarer finds can add direction choices. Choose a setting and artwork to fit precision work, scanning, fishing or another activity.",
    words: [
      { key: "start", label: "Start button", fallback: "Start", hint: "Like Cast." },
      { key: "waiting", label: "While waiting", fallback: "Wait for it…" },
      { key: "signal", label: "The signal", fallback: "❗ Now!", hint: "Like ❗ Bite!" },
      { key: "action", label: "React button", fallback: "Go", hint: "Like Reel. Clicking it before the signal fails the attempt." },
      { key: "hint", label: "How to play", fallback: "Start an attempt, wait for the signal, then react. Match any direction shown to complete the attempt." },
      { key: "fake", label: "False alarm", fallback: "👀 Was that something…?" },
      { key: "again", label: "Second signal", fallback: "Again!" },
      { key: "finished", label: "Finished scene", fallback: "Run complete" },
      { key: "early", label: "Clicked too early", fallback: "Too early. Attempt missed." },
      { key: "late", label: "Clicked too late", fallback: "Too slow. Attempt missed." },
      { key: "pull", label: "Direction prompt", fallback: "Match {dir}!", hint: "{dir} becomes the left or right button's words." },
      { key: "left", label: "Left button", fallback: "⬅️ Left" },
      { key: "right", label: "Right button", fallback: "Right ➡️" },
      { key: "lost", label: "Wrong way", fallback: "Wrong direction. Attempt missed." },
      { key: "landed", label: "Landed", fallback: "Got it:", hint: "Followed by the item, like \"Landed: 🐟 Perch ×1\"." },
      { key: "attempts", label: "What attempts are called", fallback: "attempts", hint: "Like casts." },
      { key: "leave", label: "Leave button", fallback: "Leave" },
      { key: "verb", label: "Result verb", fallback: "got", hint: "As in \"@Ana caught Perch ×2\"." },
    ],
    difficulty: [
      { key: "attempts", label: "Attempts per run", fallback: 3 },
      { key: "windowMs", label: "Reaction window (ms)", fallback: 3000, hint: "Skill adds 30 ms a level. Never under 2500, since Discord clicks can arrive late." },
      { key: "maxRounds", label: "Maximum direction steps", fallback: 3, hint: "Uncommon finds add one direction step, rare two, epic and legendary three, up to this." },
    ],
    summary: (d) =>
      `${d("attempts")} attempts a run, each one find if completed, with ${(d("windowMs") / 1000).toFixed(1)} s to react. Rarer loot can add direction steps, up to the configured maximum.`,
  },
  find: {
    label: "Find it: spot the target",
    difficultyLabel: "How hard it is to spot",
    blurb: "A 4×4 patch of look-alikes hides the item being searched for. Players click it before time runs out; a wrong click costs two seconds. A few rounds a run.",
    words: [
      { key: "prompt", label: "The task", fallback: "Find the {target}!", hint: "{target} becomes the item's name." },
      { key: "hint", label: "How to play", fallback: "Pick the target before time runs out. Each wrong choice costs 2 seconds." },
      { key: "twinHint", label: "Two targets instruction", fallback: "There are two targets to find this round." },
      { key: "hidden", label: "Covered tile", fallback: "❔", hint: "Used by the Glimpse rule." },
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

const GAME_OPTIONS = (Object.keys(GAMES) as GameType[]).map((game) => ({ value: game, label: GAMES[game].label }));

const LOOK_OPTIONS = (Object.keys(GRID_LOOKS) as GridLook[]).map((l) => ({ value: l, label: GRID_LOOKS[l].label }));

type ShopItems = Record<string, { name?: string; emoji?: string; tool?: { activityId?: string; tier?: number } }>;

type Props = {
  guildId: string;
  shopItems: ShopItems;
  /** Skills a requirement can name. */
  skills: SkillOption[];
  value: GatheringConfig | null | undefined;
  onChange: (next: GatheringConfig) => void;
};

function LocationEditor({
  location,
  activityId,
  game,
  shopItems,
  skills,
  conditions,
  onChange,
}: {
  location: GatheringLocation;
  /** Its activity, to list the tools that open it. */
  activityId: string;
  game: GameType;
  shopItems: ShopItems;
  skills: SkillOption[];
  /** The server's daily conditions, for picking which this location can get. */
  conditions: Record<string, GatheringCondition>;
  onChange: (next: GatheringLocation) => void;
}) {
  const loot = location.loot ?? [];
  const settings: Record<string, number> = game === "grid" ? gridSettings(location.difficulty) : game === "puzzle" ? puzzleRules(location.difficulty) : location.difficulty ?? {};
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
          hint={(() => {
            const tier = location.minToolTier ?? 0;
            if (tier <= 0) return "0 means no tool needed.";
            // The tools live on the Items page; listing them here saves the trip when planning.
            const opens = Object.values(shopItems).filter((it) => it.tool?.activityId === activityId && (it.tool.tier ?? 0) >= tier);
            return opens.length
              ? `Opens with: ${opens.map((it) => `${it.emoji ?? ""} ${it.name}`.trim()).join(", ")}.`
              : `No tool of tier ${tier} for this activity yet. Make one on the Items page (Gathering tool).`;
          })()}
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
        hint={GAMES[game].summary((key) => settings[key as keyof typeof settings] ?? GAMES[game].difficulty.find((d) => d.key === key)?.fallback ?? 0)}
      >
          <FieldGrid>
            {GAMES[game].difficulty.map((d) => d.toggle ? (
              <Toggle key={d.key} label={d.label} checked={(settings[d.key as keyof typeof settings] ?? d.fallback) !== 0}
                onChange={(v) => onChange({ ...location, difficulty: { ...location.difficulty, [d.key]: v ? 1 : 0 } })} hint={d.hint} />
            ) : (
              <NumberField
                key={d.key}
                label={d.label}
                value={settings[d.key as keyof typeof settings] ?? d.fallback}
                min={d.min ?? 0}
                max={d.max}
                onChange={(v) => onChange({ ...location, difficulty: { ...(location.difficulty ?? {}), [d.key]: v } })}
                hint={d.hint}
              />
            ))}
          </FieldGrid>
      </Field>
    </div>
  );
}

export default function GatheringEditor({ guildId, value, onChange, shopItems, skills }: Props) {
  // A pack can add activities to a server that never saved gathering settings, so fill in the rest.
  const withDefaults = (v: GatheringConfig | null | undefined): GatheringConfig =>
    normalizeGathering({ ...DEFAULT_GATHERING, ...(v ?? {}), skill: { ...DEFAULT_GATHERING.skill, ...(v?.skill ?? {}) } });
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
    const sceneSlots = sceneArtSlots(game);
    const sceneColours = game === "grid" ? GRID_COLOUR_LABELS : SCENE_COLOUR_LABELS[game];
    const palette = game === "grid" ? gridPalette(a.look, a.colours) : scenePalette(game, a.look, a.colours, game === "find" ? a.findScene : game === "puzzle" ? a.puzzleScene : a.timingScene);
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
          <SelectField label="Game template" value={game} options={GAME_OPTIONS} onChange={(v) => upsertActivity({ ...a, game: v })} hint={GAMES[game].blurb} wide />
          {game === "timing" && <SelectField label="Scene" value={timingSceneOf(a.timingScene)} options={(Object.keys(TIMING_SCENES) as TimingScene[]).map((scene) => ({ value: scene, label: TIMING_SCENES[scene].label }))}
            onChange={(timingScene) => upsertActivity({ ...a, timingScene })} hint="Change the built-in setting. An uploaded Background replaces the built-in scenery." wide />}
          {game === "find" && <SelectField label="Scene" value={findSceneOf(a.findScene)} options={(Object.keys(FIND_SCENES) as FindScene[]).map((scene) => ({ value: scene, label: FIND_SCENES[scene].label }))}
            onChange={(findScene) => upsertActivity({ ...a, findScene })} hint="Change the search setting. An uploaded Background replaces the built-in scenery and search patches." wide />}
          {game === "puzzle" && <SelectField label="Scene" value={puzzleSceneOf(a.puzzleScene)} options={(Object.keys(PUZZLE_SCENES) as PuzzleScene[]).map((scene) => ({ value: scene, label: PUZZLE_SCENES[scene].label }))}
            onChange={(puzzleScene) => upsertActivity({ ...a, puzzleScene })} hint="Choose water channels, electrical circuits or rune conduits. The connection rules stay the same." wide />}
          <SelectField label="Palette" value={a.look ?? ""} options={[{ value: "" as const, label: game === "grid" ? "Default: mine" : game === "timing" ? `Default: ${TIMING_SCENES[timingSceneOf(a.timingScene)].label}` : game === "puzzle" ? `Default: ${PUZZLE_SCENES[puzzleSceneOf(a.puzzleScene)].label}` : `Default: ${FIND_SCENES[findSceneOf(a.findScene)].label}` }, ...LOOK_OPTIONS]}
            onChange={(v) => upsertActivity({ ...a, look: v || undefined, colours: undefined })} hint="Colors affect built-in artwork; uploaded images keep their colors. Choosing a palette resets color overrides." wide />
        </FieldGrid>
          <FieldGrid>
            {GRID_COLOUR_KEYS.map((k) => (
              <ColorField
                key={k}
                label={sceneColours[k]}
                value={palette[k]}
                onChange={(v) => upsertActivity({ ...a, colours: { ...a.colours, [k]: v } })}
              />
            ))}
          </FieldGrid>
        {game !== "grid" && (
          <Field label="Preview" hint="See the scene players receive in Discord, including your wording and finds.">
            <GamePreview key={`${a.id}:${game}`} activity={a} shopItems={shopItems} defaults={Object.fromEntries(GAMES[game].words.map((w) => [w.key, w.fallback]))} />
          </Field>
        )}
        {game === "grid" && (
          <Field label="Preview" hint="A sample board showing your artwork and colors. Finds take their item’s emoji color; visibility during play follows each location’s rules.">
            <GridPreview
              look={a.look}
              colours={a.colours}
              art={a.art}
              oreEmojis={[...new Set(Object.values(a.locations ?? {}).flatMap((l) => l.loot ?? []).map((x) => shopItems[x.itemId]?.emoji).filter((e): e is string => !!e))].slice(0, 4)}
            />
          </Field>
        )}

          <Section title="Scene artwork" description={game === "grid" ? "Replace any part of the scene with your own images. A background replaces the entrance and shows through cleared spaces unless you supply those too." : game === "timing" ? "Replace the environment, foreground and objects for waiting, signal and pulling states. Your instructions and direction choices still appear below the scene." : game === "puzzle" ? "Replace the background, tile surfaces, connectors and endpoints. Connector artwork rotates with each tile; the connected path stays highlighted." : "A background replaces all built-in scenery, patches and plants. Add your own patches or foreground if wanted. Searchable objects, discovery markers and Glimpse covers remain part of play."} defaultOpen={false}>
            <FieldGrid>
              {Object.entries(sceneSlots).map(([slot, info]) => (
                <Field key={slot} label={info.label} hint={`${info.hint} PNG, JPEG, GIF or WebP, up to 512 KB. Images fit the slot; transparent PNG works best for overlays.`}>
                  <UploadButton guildId={guildId} label={`Upload ${info.label.toLowerCase()}`} onUploaded={(url) => upsertActivity({ ...a, art: { ...a.art, [slot]: new URL(url).pathname } })} />
                  {a.art?.[slot] && (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- managed uploaded artwork */}
                      <img src={a.art[slot]} alt={`${info.label} artwork`} className="h-16 w-16 border border-[var(--border)] object-contain" />
                      <button type="button" aria-label={`Use default ${info.label.toLowerCase()}`} className="text-sm text-[var(--muted)] underline" onClick={() => {
                        const art = { ...a.art }; delete art[slot]; upsertActivity({ ...a, art });
                      }}>Use default</button>
                    </div>
                  )}
                </Field>
              ))}
            </FieldGrid>
          </Section>

        <Field label="Wording" hint="Everything players see in the game. Leave a box blank to use the default shown in it.">
          <FieldGrid>
            {[...GAMES[game].words, { key: "timeout", label: "Inactive run ended", fallback: game === "puzzle" ? PUZZLE_WORDS.timeout : "This run ended after inactivity. Your haul was kept." }].map((w) => (
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
                activityId={a.id}
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
        title="Conditions"
        description="Weather for your locations, or whatever fits your theme: every few hours each location can roll one of these, changing how it plays and what it pays. Make them here, then pick which each location can get."
        defaultOpen={false}
      >
        <div className="space-y-4">
          <SelectField
            label="Conditions change every"
            value={String(local.conditionHours ?? 6)}
            onChange={(v) => commit({ ...local, conditionHours: Number(v) === 6 ? undefined : Number(v) })}
            options={[1, 3, 6, 12, 24].map((h) => ({ value: String(h), label: h === 24 ? "Day (at midnight UTC)" : `${h} hour${h === 1 ? "" : "s"}` }))}
            hint="Everyone sees the same conditions. Shorter means members in every time zone see a few different ones."
          />
          <ConditionsEditor value={local.conditions} onChange={(conditions) => commit({ ...local, conditions })} />
        </div>
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
