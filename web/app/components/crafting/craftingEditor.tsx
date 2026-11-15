"use client";

import RequirementsField, { type Requirements, type SkillOption } from "@/app/components/ui/requirementsField";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ColorField, Field, FieldGrid, NumberField, Section, SelectField, TextField, Toggle } from "@/app/components/ui/form";
import UploadButton from "@/app/components/ui/uploadButton";
import StationPreview from "@/app/components/crafting/stationPreview";
import { GRID_COLOUR_KEYS, GRID_LOOKS, gridPalette, type GridColours, type GridLook } from "@content/gridLooks";
import { STATION_ART_SLOTS, STATION_COLOUR_LABELS, STATION_SCENES, stationSceneOf, type StationScene } from "@content/stationScene";
import { ContentBrowser, EntryTooltip, idFromName } from "@/app/components/ui/slots";
import { ItemField } from "@/app/components/ui/pickers";

// ─── Types (mirrored from havocish/src/types/crafting.ts) ───────────────────────

export interface RecipeItem { itemId: string; quantity: number }

export interface Recipe {
  id: string;
  inputs: RecipeItem[];
  gold?: number;
  output: RecipeItem;
  minSkill: number;
  skillXp: number;
  hidden?: boolean;
  /** Timed style: minutes until ready (default 60). */
  minutes?: number;
  masterwork?: { itemId: string; chance: number; quantity: number }[];
  requirements?: Requirements;
}

export interface CraftingStation {
  id: string;
  name: string;
  emoji: string;
  skillName: string;
  enabled: boolean;
  style: "simple" | "forge" | "timed";
  masterworkChance?: number;
  timed?: { slots?: number; scene?: StationScene; look?: GridLook; colours?: Partial<GridColours>; art?: Record<string, string> };
  forge?: { zone?: [number, number]; centre?: [number, number]; ruinLoss?: number };
  words?: Record<string, string>;
  recipes: Record<string, Recipe>;
}

const STYLES = [
  { value: "forge" as const, label: "Forge meter: time the strike" },
  { value: "simple" as const, label: "Straightforward: a Craft button" },
  { value: "timed" as const, label: "Timed: put in, wait, collect" },
];
type Style = CraftingStation["style"];
const STYLE_HINTS: Record<Style, string> = {
  forge: "A bar sweeps across; members strike to stop it. The yellow zone makes the item, the green centre makes a masterwork, anywhere else ruins it. Higher skill widens both.",
  simple: "Have the ingredients, click Craft, get the item. No timing and no ruin.",
  timed: "Members put the ingredients in a slot and come back when it's ready: a garden, a nursery, a robot bay. Each recipe sets how long it takes. It keeps going while they're offline.",
};
const LOOK_OPTIONS = (Object.keys(GRID_LOOKS) as GridLook[]).map((l) => ({ value: l, label: GRID_LOOKS[l].label }));
const SCENE_OPTIONS = (Object.keys(STATION_SCENES) as StationScene[]).map((scene) => ({ value: scene, label: STATION_SCENES[scene].label }));

/** Minutes as a number and a unit, for the recipe's duration. */
const UNITS = [{ value: "1", label: "minutes" }, { value: "60", label: "hours" }, { value: "1440", label: "days" }];
function DurationField({ minutes, onChange }: { minutes: number; onChange: (minutes: number) => void }) {
  const [unit, setUnit] = useState(minutes % 1440 === 0 ? "1440" : minutes % 60 === 0 ? "60" : "1");
  return (
    <Field label="Takes" hint="Real time, including while the member is offline. 1 minute to 7 days.">
      <div className="flex items-end gap-2">
        <div className="w-28"><NumberField value={Math.round((minutes / Number(unit)) * 100) / 100} min={0} step={unit === "1" ? 1 : 0.5} onChange={(v) => onChange(Math.max(1, Math.min(10080, Math.round(v * Number(unit)))))} /></div>
        <div className="w-32"><SelectField value={unit} options={UNITS} onChange={setUnit} /></div>
      </div>
    </Field>
  );
}

/** Every word members see, per style, with the bot's defaults (havocish/src/commands/user/craft.ts). */
const WORDS: Array<{ key: string; label: string; fallback: string; styles: Style[] }> = [
  { key: "craft", label: "Craft button", fallback: "Craft", styles: ["simple", "forge"] },
  { key: "made", label: "Result verb", fallback: "Crafted", styles: ["simple", "forge"] },
  { key: "masterwork", label: "Masterwork line", fallback: "✨ Masterwork!", styles: ["simple", "forge"] },
  { key: "strike", label: "Strike button", fallback: "🔨 Strike", styles: ["forge"] },
  { key: "forging", label: "While forging", fallback: "Forging", styles: ["forge"] },
  { key: "ruined", label: "Ruined line", fallback: "💥 Ruined!", styles: ["forge"] },
  { key: "hesitated", label: "Too slow line", fallback: "Too slow. The moment passed.", styles: ["forge"] },
  { key: "start", label: "Start button", fallback: "Start", styles: ["timed"] },
  { key: "started", label: "After starting ({item})", fallback: "Started {item}.", styles: ["timed"] },
  { key: "empty", label: "An empty slot", fallback: "Empty", styles: ["timed"] },
  { key: "waiting", label: "While waiting ({time})", fallback: "ready {time}", styles: ["timed"] },
  { key: "ready", label: "Ready to collect", fallback: "Ready!", styles: ["timed"] },
  { key: "collect", label: "Collect button", fallback: "Collect", styles: ["timed"] },
  { key: "collected", label: "Collected verb", fallback: "Collected", styles: ["timed"] },
  { key: "full", label: "Every slot in use", fallback: "Every slot is in use. Collect something first.", styles: ["timed"] },
  { key: "nothing", label: "Nothing ready yet", fallback: "Nothing is ready yet.", styles: ["timed"] },
  { key: "refunded", label: "A removed recipe refunded", fallback: "A removed recipe gave back what it took.", styles: ["timed"] },
];

export interface CraftingConfig {
  enabled: boolean;
  stations: Record<string, CraftingStation>;
}

const DEFAULT_CRAFTING: CraftingConfig = { enabled: false, stations: {} };

type ShopItems = Record<string, { name?: string; emoji?: string; actions?: Record<number, { type: string; stationId?: string; recipeId?: string } | undefined> }>;

const smallButton = "inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]";
const removeButton = "text-[var(--muted)] transition-colors hover:text-red-400";

function RecipeEditor({ recipe, station, shopItems, skills, onChange, onRemove }: {
  recipe: Recipe;
  station: CraftingStation;
  shopItems: ShopItems;
  skills: SkillOption[];
  onChange: (next: Recipe) => void;
  onRemove: () => void;
}) {
  const inputs = recipe.inputs ?? [];
  const masterwork = recipe.masterwork ?? [];
  const total = masterwork.reduce((s, m) => s + (m.chance > 0 && shopItems[m.itemId] ? m.chance : 0), 0);
  const out = shopItems[recipe.output?.itemId ?? ""];
  // The recipe scrolls that teach this one.
  const taughtBy = Object.values(shopItems).filter((it) => Object.values(it.actions ?? {})
    .some((a) => a?.type === "learnRecipe" && a.stationId === station.id && a.recipeId === recipe.id));

  return (
    <div className="space-y-4 rounded-sm border border-[var(--border)] bg-black/20 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{out ? `${out.emoji ?? ""} ${out.name}`.trim() : "New recipe"}</span>
        <button type="button" aria-label="Remove recipe" onClick={onRemove} className={removeButton}><Trash2 size={14} /></button>
      </div>

      <FieldGrid>
        <ItemField items={shopItems} label="Makes" value={recipe.output?.itemId ?? ""} onChange={(v) => onChange({ ...recipe, output: { ...recipe.output, itemId: v } })} emptyLabel="Choose an item" />
        <NumberField label="How many" value={recipe.output?.quantity ?? 1} min={1} onChange={(v) => onChange({ ...recipe, output: { ...recipe.output, quantity: v } })} />
        <NumberField label={`${station.skillName || "Skill"} needed`} value={recipe.minSkill ?? 1} min={1} onChange={(v) => onChange({ ...recipe, minSkill: v })} />
        <NumberField label="Skill XP per craft" value={recipe.skillXp ?? 20} min={0} onChange={(v) => onChange({ ...recipe, skillXp: v })} />
        <NumberField label="Gold it also costs" value={recipe.gold ?? 0} min={0} onChange={(v) => onChange({ ...recipe, gold: v > 0 ? v : undefined })} />
        {station.style === "timed" && <DurationField minutes={recipe.minutes ?? 60} onChange={(minutes) => onChange({ ...recipe, minutes })} />}
      </FieldGrid>

      <Toggle
        label="Hidden until learned"
        checked={!!recipe.hidden}
        onChange={(v) => onChange({ ...recipe, hidden: v || undefined })}
        hint={!recipe.hidden
          ? "Members see it in /craft from the start."
          : taughtBy.length
            ? `Shown as ??? until a member reads ${taughtBy.map((it) => `${it.emoji ?? ""} ${it.name}`.trim()).join(" or ")}.`
            : "No item teaches it yet. On the Items page, give an item the \"Teach a recipe\" use action, then drop or sell it somewhere."}
      />

      <Field label="Ingredients" hint={station.style === "timed" ? "Taken when it starts. Leave empty for something that makes itself, like a robot that gathers." : "Used up by each craft."}>
        <div className="space-y-2">
          {inputs.map((i, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="flex-1">
                <ItemField items={shopItems} label={index === 0 ? "Item" : undefined} value={i.itemId} onChange={(v) => onChange({ ...recipe, inputs: inputs.map((x, k) => (k === index ? { ...x, itemId: v } : x)) })} emptyLabel="Choose an item" />
              </div>
              <div className="w-24">
                <NumberField label={index === 0 ? "Amount" : undefined} value={i.quantity ?? 1} min={1} onChange={(v) => onChange({ ...recipe, inputs: inputs.map((x, k) => (k === index ? { ...x, quantity: v } : x)) })} />
              </div>
              <button type="button" aria-label="Remove ingredient" onClick={() => onChange({ ...recipe, inputs: inputs.filter((_, k) => k !== index) })} className={`${removeButton} mb-2.5`}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" onClick={() => onChange({ ...recipe, inputs: [...inputs, { itemId: "", quantity: 1 }] })} className={smallButton}><Plus size={14} /> Add ingredient</button>
        </div>
      </Field>

      <RequirementsField
        items={shopItems}
        value={recipe.requirements}
        onChange={(next) => onChange({ ...recipe, requirements: next })}
        skills={skills}
        hint="On top of the station skill it needs. Locked recipes show what's missing in /craft."
      />

      <Field
        label="Masterwork table"
        hint={`What a masterwork gives instead (${station.style === "forge" ? "a strike dead centre" : `${station.masterworkChance ?? 0}% of crafts at this station`}). Chances are weights. Leave empty to give a bonus copy instead.`}
      >
        <div className="space-y-2">
          {masterwork.map((m, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="flex-1">
                <ItemField items={shopItems} label={index === 0 ? "Item" : undefined} value={m.itemId} onChange={(v) => onChange({ ...recipe, masterwork: masterwork.map((x, k) => (k === index ? { ...x, itemId: v } : x)) })} emptyLabel="Choose an item" />
              </div>
              <div className="w-24">
                <NumberField label={index === 0 ? "Weight" : undefined} value={m.chance} min={0} onChange={(v) => onChange({ ...recipe, masterwork: masterwork.map((x, k) => (k === index ? { ...x, chance: v } : x)) })} />
              </div>
              <span className="mb-2.5 w-12 text-right font-mono text-xs text-[var(--muted)]">
                {total > 0 && shopItems[m.itemId] && m.chance > 0 ? `${Math.round((m.chance / total) * 100)}%` : "0%"}
              </span>
              <button type="button" aria-label="Remove masterwork result" onClick={() => onChange({ ...recipe, masterwork: masterwork.filter((_, k) => k !== index) })} className={`${removeButton} mb-2.5`}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" onClick={() => onChange({ ...recipe, masterwork: [...masterwork, { itemId: "", chance: 10, quantity: 1 }] })} className={smallButton}><Plus size={14} /> Add masterwork result</button>
        </div>
      </Field>
    </div>
  );
}

export default function CraftingEditor({ guildId, value, onChange, shopItems, skills }: {
  guildId: string;
  value: CraftingConfig | null | undefined;
  onChange: (next: CraftingConfig) => void;
  shopItems: ShopItems;
  /** Skills a requirement can name. */
  skills: SkillOption[];
}) {
  const [local, setLocal] = useState<CraftingConfig>(value ?? DEFAULT_CRAFTING);
  useEffect(() => {
    setLocal(value ?? DEFAULT_CRAFTING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  function commit(next: CraftingConfig) {
    setLocal(next);
    onChange(next);
  }
  const upsertStation = (s: CraftingStation) => commit({ ...local, stations: { ...(local.stations ?? {}), [s.id]: s } });

  const entries = useMemo(
    () => Object.entries(local.stations ?? {}).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0])),
    [local.stations],
  );

  function renderStation(id: string, st: CraftingStation) {
    const recipes = Object.values(st.recipes ?? {}).sort((a, b) => (a.minSkill ?? 1) - (b.minSkill ?? 1));
    const setRecipe = (r: Recipe) => upsertStation({ ...st, recipes: { ...(st.recipes ?? {}), [r.id]: r } });
    const setTimed = (p: Partial<NonNullable<CraftingStation["timed"]>>) => upsertStation({ ...st, timed: { ...(st.timed ?? {}), ...p } });
    return (
      <div className="space-y-5">
        <Toggle label="Active" checked={st.enabled !== false} onChange={(v) => upsertStation({ ...st, enabled: v })} />
        <FieldGrid>
          <TextField label="Name" value={st.name} onChange={(v) => upsertStation({ ...st, name: v })} hint="Members pick it in /craft." />
          <TextField label="Emoji" value={st.emoji ?? ""} onChange={(v) => upsertStation({ ...st, emoji: v })} />
          <TextField label="Skill name" value={st.skillName} onChange={(v) => upsertStation({ ...st, skillName: v })} hint="Like Smithing or Engineering." />
          <SelectField
            label="Crafting style"
            value={st.style ?? "simple"}
            options={STYLES}
            onChange={(v) => upsertStation({ ...st, style: v })}
            hint={STYLE_HINTS[st.style ?? "simple"]}
          />
          {st.style !== "forge" && (
            <NumberField
              label="Masterwork chance (%)"
              value={st.masterworkChance ?? 0}
              min={0}
              max={100}
              step={0.5}
              onChange={(v) => upsertStation({ ...st, masterworkChance: v })}
              hint={st.style === "timed" ? "The chance a collected slot gives a masterwork result: a rare harvest. 0 turns them off." : "The chance a craft gives a masterwork result. 0 turns masterworks off."}
            />
          )}
          {st.style === "timed" && (
            <NumberField label="Slots" value={st.timed?.slots ?? 3} min={1} max={12} onChange={(v) => setTimed({ slots: v })}
              hint="How many can wait at once. A slot only fills again once it's collected, so this also caps what members earn while away." />
          )}
        </FieldGrid>
        {st.style === "timed" && (() => {
          const t = st.timed ?? {};
          const scene = stationSceneOf(t.scene);
          const palette = gridPalette(t.look ?? "soil", { ...(!t.look && STATION_SCENES[scene].colours), ...(t.colours ?? {}) });
          const firstOutput = recipes.map((r) => shopItems[r.output?.itemId ?? ""]?.emoji).find(Boolean);
          return (
            <>
              <FieldGrid>
                <SelectField label="Scene" value={scene} options={SCENE_OPTIONS} onChange={(v) => setTimed({ scene: v })} hint="The built-in setting. Upload a Background to replace it." />
                <SelectField label="Palette" value={t.look ?? ""} options={[{ value: "" as const, label: `Default: ${STATION_SCENES[scene].label}` }, ...LOOK_OPTIONS]}
                  onChange={(v) => setTimed({ look: v || undefined, colours: undefined })} hint="Choosing a palette resets color overrides. Uploaded images keep their colors." />
              </FieldGrid>
              <FieldGrid>
                {GRID_COLOUR_KEYS.map((k) => (
                  <ColorField key={k} label={STATION_COLOUR_LABELS[k]} value={palette[k]} onChange={(v) => setTimed({ colours: { ...t.colours, [k]: v } })} />
                ))}
              </FieldGrid>
              <Field label="Preview" hint="What members see at the top of /craft, using your first recipe's item.">
                <StationPreview scene={scene} look={t.look} colours={t.colours} art={t.art} slots={Math.max(1, Math.min(12, t.slots ?? 3))} {...(firstOutput && { symbol: firstOutput })} />
              </Field>
              <Section title="Scene artwork" description="Replace the background, each slot's base, what's shown while waiting and what's shown when ready. The item's own symbol is drawn on top." defaultOpen={false}>
                <FieldGrid>
                  {Object.entries(STATION_ART_SLOTS).map(([slot, info]) => (
                    <Field key={slot} label={info.label} hint={`${info.hint} PNG, JPEG, GIF or WebP, up to 512 KB.`}>
                      <UploadButton guildId={guildId} label={`Upload ${info.label.toLowerCase()}`} onUploaded={(url) => setTimed({ art: { ...t.art, [slot]: new URL(url).pathname } })} />
                      {t.art?.[slot] && (
                        <div className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element -- managed uploaded artwork */}
                          <img src={t.art[slot]} alt={`${info.label} artwork`} className="h-16 w-16 border border-[var(--border)] object-contain" />
                          <button type="button" aria-label={`Use default ${info.label.toLowerCase()}`} className="text-sm text-[var(--muted)] underline" onClick={() => {
                            const art = { ...t.art }; delete art[slot]; setTimed({ art });
                          }}>Use default</button>
                        </div>
                      )}
                    </Field>
                  ))}
                </FieldGrid>
              </Section>
            </>
          );
        })()}
        {st.style === "forge" && (() => {
          const f = st.forge ?? {};
          const zone = f.zone ?? [0.3, 0.5];
          const centre = f.centre ?? [0.06, 0.1];
          const pct = (n: number) => Math.round(n * 100);
          const setForge = (p: Partial<NonNullable<CraftingStation["forge"]>>) => upsertStation({ ...st, forge: { ...f, ...p } });
          return (
            <Field label="Forge meter" hint="Shares of the 15-cell bar. Skill eases from the first number to the second.">
              <FieldGrid>
                <NumberField label="Zone at skill 1 (%)" value={pct(zone[0])} min={5} max={100} onChange={(v) => setForge({ zone: [v / 100, zone[1]] })} />
                <NumberField label="Zone at top skill (%)" value={pct(zone[1])} min={5} max={100} onChange={(v) => setForge({ zone: [zone[0], v / 100] })} />
                <NumberField label="Centre at skill 1 (%)" value={pct(centre[0])} min={1} max={100} onChange={(v) => setForge({ centre: [v / 100, centre[1]] })} hint="At least one cell, always." />
                <NumberField label="Centre at top skill (%)" value={pct(centre[1])} min={1} max={100} onChange={(v) => setForge({ centre: [centre[0], v / 100] })} />
                <NumberField label="Ingredients lost on a ruin (%)" value={pct(f.ruinLoss ?? 0.5)} min={0} max={100} onChange={(v) => setForge({ ruinLoss: v / 100 })} hint="0 makes a ruin cost nothing. A ruin never costs gold or gives XP." />
              </FieldGrid>
            </Field>
          );
        })()}
        <Field label="Wording" hint="Leave a box blank to use the default shown in it.">
          <FieldGrid>
            {WORDS.filter((w) => w.styles.includes(st.style ?? "simple")).map((w) => (
              <TextField
                key={w.key}
                label={w.label}
                value={st.words?.[w.key] ?? ""}
                placeholder={w.fallback}
                onChange={(v) => {
                  const words = { ...(st.words ?? {}) };
                  if (v) words[w.key] = v;
                  else delete words[w.key];
                  upsertStation({ ...st, words });
                }}
              />
            ))}
          </FieldGrid>
        </Field>
        <Field label="Recipes" hint="Better recipes open as the skill grows. One must need skill 1, or nobody can start.">
          <div className="space-y-3">
            {recipes.length === 0 && <p className="text-xs text-[var(--muted)]">No recipes yet.</p>}
            {recipes.map((r) => (
              <RecipeEditor
                key={r.id}
                recipe={r}
                station={st}
                shopItems={shopItems}
                skills={skills}
                onChange={setRecipe}
                onRemove={() => {
                  const next = { ...(st.recipes ?? {}) };
                  delete next[r.id];
                  upsertStation({ ...st, recipes: next });
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                const rid = idFromName(`recipe ${recipes.length + 1}`, Object.keys(st.recipes ?? {}));
                setRecipe({ id: rid, inputs: [], output: { itemId: "", quantity: 1 }, minSkill: 1, skillXp: 20 });
              }}
              className={smallButton}
            >
              <Plus size={14} /> Add recipe
            </button>
          </div>
        </Field>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Section title="Stations" description="Crafting skills members train with /craft. Each station has its own recipes.">
        <ContentBrowser<CraftingStation>
          entries={entries}
          newLabel="New station"
          empty="No stations yet. Make one, like Smithing or Cooking."
          look={(id, st) => ({ icon: st.emoji, label: st.name || id, faded: st.enabled === false })}
          tooltip={(id, st) => (
            <EntryTooltip
              title={`${st.emoji ?? ""} ${st.name || id}`}
              lines={[`${st.skillName} · ${st.style === "forge" ? "forge meter" : st.style === "timed" ? `timed, ${st.timed?.slots ?? 3} slots` : "straightforward"}`, `${Object.keys(st.recipes ?? {}).length} recipes`, st.enabled === false && "Inactive"]}
            />
          )}
          onCreate={(name) => {
            const id = idFromName(name, Object.keys(local.stations ?? {}));
            upsertStation({ id, name, emoji: "⚒️", skillName: name, enabled: true, style: "forge", masterworkChance: 5, words: {}, recipes: {} });
            return id;
          }}
          onRemove={(id) => {
            const next = { ...(local.stations ?? {}) };
            delete next[id];
            commit({ ...local, stations: next });
          }}
          renderItem={renderStation}
        />
      </Section>

      <Section title="General" description="Whether members can craft at all." defaultOpen={!local.enabled}>
        <Toggle
          label="Enable crafting"
          checked={!!local.enabled}
          onChange={(v) => commit({ ...local, enabled: v })}
          hint="Members craft with /craft. You can also switch this in /config. Crafting skills use the skill curve set on the Gathering page."
        />
      </Section>
    </div>
  );
}
