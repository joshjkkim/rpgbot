"use client";

import RequirementsField, { type Requirements, type SkillOption } from "@/app/components/ui/requirementsField";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Field,
  FieldGrid,
  NumberField,
  Section,
  SelectField,
  TextField,
  Toggle,
} from "@/app/components/ui/form";
import { ContentBrowser, EntryTooltip, idFromName } from "@/app/components/ui/slots";
import { ChannelsField, ItemField } from "@/app/components/ui/pickers";
import { ConditionFields } from "./movesEditor";
import { DEFAULT_ENEMY_MOVES, DEFAULT_MOVES, DEFAULT_STATUSES, type EnemyMove, type MoveConfig, type PlaceConfig, type StatusConfig } from "./moveText";

// ─── Types (mirrored from havocish) ─────────────────────────────────────────────

export interface EnemyDrop {
  itemId: string;
  chance: number; // 0–1
  quantity: number;
}

export interface EnemyConfig {
  id: string;
  name: string;
  emoji: string;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  critChance: number;
  critMultiplier: number;
  minLevel: number;
  maxLevel: number | null;
  xpReward: number;
  goldReward: number;
  drops: EnemyDrop[];
  /** Fought by the whole server at once; never by /fight or encounters. */
  boss?: boolean;
  requirements?: Requirements;
  /** Picked by weight each turn; empty means the default moves. */
  moves?: EnemyMove[];
  /** false: fought alone only. */
  party?: boolean;
  /** Battle scene picture in place of its emoji. */
  image?: string;
}

export interface CombatDeathPenalty {
  goldPercent?: number;
  goldFlat?: number;
  xpPercent?: number;
}

export interface CombatPvpConfig {
  enabled?: boolean;
  minWager?: number;
  maxWager?: number;
  rakePercent?: number;
  challengeTimeoutSeconds?: number;
  maxRounds?: number;
  cooldownSeconds?: number;
}

export interface CombatEncounterConfig {
  enabled?: boolean;
  chancePercent?: number;
  cooldownSeconds?: number;
  fleeSeconds?: number;
  channelIds?: string[];
}

export interface CombatBossConfig {
  enabled?: boolean;
  chancePercent?: number;
  cooldownSeconds?: number;
  durationSeconds?: number;
  attackCooldownSeconds?: number;
  channelIds?: string[];
}

export interface CombatConfig {
  enabled: boolean;
  /** Combat level's own curve and cap (mirrored from havocish/src/types/guild.ts). */
  curve?: { maxLevel: number; curveType: string; curveParams: Record<string, number> };
  hpBase?: number;
  hpPerLevel?: number;
  attackBase?: number;
  attackPerLevel?: number;
  defenseBase?: number;
  defensePerLevel?: number;
  speedBase?: number;
  speedPerLevel?: number;
  critChanceBase?: number;
  critChancePerLevel?: number;
  critMultiplierBase?: number;
  critMultiplierPerLevel?: number;
  /** Stats added per chat level, on top of Combat level. */
  chatBonus?: { hp?: number; atk?: number; def?: number; spd?: number; crit?: number };
  enemies?: Record<string, EnemyConfig>;
  moves?: Record<string, MoveConfig>;
  statuses?: Record<string, StatusConfig>;
  places?: Record<string, PlaceConfig>;
  /** Enemies below your level range pay less XP (mirrored from havocish/src/player/fight.ts easyXpShare). */
  easyXp?: { enabled?: boolean; perLevel?: number; floor?: number };
  /** Others joining a fight (mirrored from havocish/src/player/fight.ts partyRules). */
  party?: { enabled?: boolean; maxPlayers?: number; turnSeconds?: number; hpPerExtraPlayer?: number; levelRange?: boolean };
  allowEnemyChoice?: boolean;
  fightsIn?: "thread" | "channel";
  /** HP refill time and where a loss leaves you (mirrored from havocish/src/player/combat.ts). */
  hp?: { regenMinutes?: number; respawnPercent?: number };
  pveDeathPenalty?: CombatDeathPenalty;
  pvpDeathPenalty?: CombatDeathPenalty;
  pvp?: CombatPvpConfig;
  encounters?: CombatEncounterConfig;
  bosses?: CombatBossConfig;
}

type Props = {
  /** Shop items, so item fields can be dropdowns. */
  shopItems: Record<string, { name?: string; emoji?: string }>;
  value: CombatConfig | null | undefined;
  onChange: (next: CombatConfig) => void;
  /** Skills a requirement can name. */
  skills: SkillOption[];
  /** Which tab of the Combat page this is. */
  part: "enemies" | "players" | "events";
};

/** Each player stat is a base plus a per-level increment. */
const STATS: Array<{
  label: string;
  baseKey: keyof CombatConfig;
  perLevelKey: keyof CombatConfig;
  step?: number;
}> = [
  { label: "Health", baseKey: "hpBase", perLevelKey: "hpPerLevel" },
  { label: "Attack", baseKey: "attackBase", perLevelKey: "attackPerLevel" },
  { label: "Defence", baseKey: "defenseBase", perLevelKey: "defensePerLevel" },
  { label: "Speed", baseKey: "speedBase", perLevelKey: "speedPerLevel" },
  { label: "Crit chance", baseKey: "critChanceBase", perLevelKey: "critChancePerLevel", step: 0.01 },
  {
    label: "Crit multiplier",
    baseKey: "critMultiplierBase",
    perLevelKey: "critMultiplierPerLevel",
    step: 0.1,
  },
];

/** Mirrors the bot's default (havocish/src/types/guild.ts). */
const DEFAULT_CHAT_BONUS: NonNullable<CombatConfig["chatBonus"]> = { hp: 2, atk: 0.5 };
const CHAT_BONUS: Array<{ key: keyof NonNullable<CombatConfig["chatBonus"]>; label: string; step?: number }> = [
  { key: "hp", label: "Health", step: 1 },
  { key: "atk", label: "Attack" },
  { key: "def", label: "Defence" },
  { key: "spd", label: "Speed" },
  { key: "crit", label: "Crit chance %", step: 0.1 },
];

export default function CombatEditor({ value, onChange, shopItems, skills, part }: Props) {
  const defaults: CombatConfig = useMemo(() => ({ enabled: false, enemies: {} }), []);

  const [local, setLocal] = useState<CombatConfig>(value ?? defaults);

  useEffect(() => {
    setLocal(value ?? defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  function commit(next: CombatConfig) {
    setLocal(next);
    onChange(next);
  }

  function updateRoot(patch: Partial<CombatConfig>) {
    commit({ ...local, ...patch });
  }

  function updateDeathPenalty(
    which: "pveDeathPenalty" | "pvpDeathPenalty",
    patch: Partial<CombatDeathPenalty>
  ) {
    updateRoot({ [which]: { ...(local[which] ?? {}), ...patch } });
  }

  function updatePvp(patch: Partial<CombatPvpConfig>) {
    updateRoot({ pvp: { ...(local.pvp ?? {}), ...patch } });
  }

  function updateEncounters(patch: Partial<CombatEncounterConfig>) {
    updateRoot({ encounters: { ...(local.encounters ?? {}), ...patch } });
  }

  function updateBosses(patch: Partial<CombatBossConfig>) {
    updateRoot({ bosses: { ...(local.bosses ?? {}), ...patch } });
  }

  function upsertEnemy(enemy: EnemyConfig) {
    updateRoot({ enemies: { ...(local.enemies ?? {}), [enemy.id]: enemy } });
  }

  const enemyEntries = useMemo(
    () =>
      Object.entries(local.enemies ?? {}).sort((a, b) =>
        (a[1].name || a[0]).localeCompare(b[1].name || b[0])
      ),
    [local.enemies]
  );

  function penaltyFields(which: "pveDeathPenalty" | "pvpDeathPenalty") {
    const penalty = local[which] ?? {};
    return (
      <FieldGrid>
        <NumberField
          label="Gold lost (%)"
          value={penalty.goldPercent ?? 0}
          min={0}
          max={100}
          step={0.1}
          onChange={(v) => updateDeathPenalty(which, { goldPercent: v })}
        />
        <NumberField
          label="Gold lost (flat)"
          value={penalty.goldFlat ?? 0}
          min={0}
          onChange={(v) => updateDeathPenalty(which, { goldFlat: v })}
        />
        <NumberField
          label="Combat XP lost (%)"
          value={penalty.xpPercent ?? 0}
          min={0}
          max={100}
          step={0.1}
          onChange={(v) => updateDeathPenalty(which, { xpPercent: v })}
          hint="Off by default; losing XP can undo a level."
        />
      </FieldGrid>
    );
  }

  return (
    <div className="space-y-4">
      {part === "enemies" && (
        <>
      <Section title="Enemies" description="What members can fight, and what beating them pays.">
        <ContentBrowser<EnemyConfig>
          entries={enemyEntries}
          newLabel="New enemy"
          empty="No enemies defined. There is nothing to fight yet."
          look={(id, enemy) => ({ icon: enemy.emoji, label: enemy.name || id, colour: enemy.boss ? "#d0894a" : undefined })}
          tooltip={(id, enemy) => (
            <EntryTooltip
              title={`${enemy.emoji ?? ""} ${enemy.name || id}`}
              colour={enemy.boss ? "#d0894a" : undefined}
              lines={[
                enemy.boss ? "World boss" : `Level ${enemy.minLevel}${enemy.maxLevel == null ? "+" : `–${enemy.maxLevel}`}`,
                `${enemy.hp} HP · ${enemy.atk} ATK · ${enemy.def} DEF`,
                `Rewards ${enemy.xpReward} XP · ${enemy.goldReward} gold${enemy.drops?.length ? ` · ${enemy.drops.length} drop${enemy.drops.length === 1 ? "" : "s"}` : ""}`,
              ]}
            />
          )}
          onCreate={(name) => {
            const id = idFromName(name, Object.keys(local.enemies ?? {}));
            upsertEnemy({
              id,
              name,
              emoji: "👾",
              hp: 50,
              atk: 8,
              def: 3,
              spd: 5,
              critChance: 5,
              critMultiplier: 1.5,
              minLevel: 1,
              maxLevel: null,
              xpReward: 25,
              goldReward: 10,
              drops: [],
            });
            return id;
          }}
          onRemove={(id) => {
            const next = { ...(local.enemies ?? {}) };
            delete next[id];
            updateRoot({ enemies: next });
          }}
          renderItem={(id, enemy) => (
            <div className="space-y-4">
              <FieldGrid>
                <TextField label="Name" value={enemy.name} onChange={(v) => upsertEnemy({ ...enemy, name: v })} />
                <TextField
                  label="Emoji"
                  value={enemy.emoji ?? ""}
                  onChange={(v) => upsertEnemy({ ...enemy, emoji: v })}
                  hint="Also its picture in battle scenes. Your server's own custom emoji work too."
                />
                <TextField
                  wide
                  label="Scene image (optional)"
                  value={enemy.image ?? ""}
                  onChange={(v) => upsertEnemy({ ...enemy, image: v.trim() || undefined })}
                  placeholder="https://…/goblin-king.png"
                  hint="A picture link to draw instead of the emoji. A transparent PNG looks best."
                />
              </FieldGrid>
              <Toggle
                label="World boss"
                checked={!!enemy.boss}
                onChange={(v) => upsertEnemy({ ...enemy, boss: v })}
                hint={enemy.boss
                  ? "The whole server fights it together. Its XP and gold are split by damage dealt, and the top damage dealer rolls its drops. Give it lots of HP."
                  : "Turn on to make this a world boss instead of a normal enemy."}
              />

              <Field label="Stats">
                <FieldGrid>
                  <NumberField label="HP" value={enemy.hp} min={1} onChange={(v) => upsertEnemy({ ...enemy, hp: v })} />
                  <NumberField label="Attack" value={enemy.atk} min={0} onChange={(v) => upsertEnemy({ ...enemy, atk: v })} />
                  <NumberField label="Defence" value={enemy.def} min={0} onChange={(v) => upsertEnemy({ ...enemy, def: v })} />
                  <NumberField label="Speed" value={enemy.spd} min={0} onChange={(v) => upsertEnemy({ ...enemy, spd: v })} />
                  <NumberField
                    label="Crit chance (%)"
                    value={enemy.critChance}
                    min={0}
                    max={100}
                    step={0.5}
                    onChange={(v) => upsertEnemy({ ...enemy, critChance: v })}
                    hint="5 means a 5% chance."
                  />
                  <NumberField
                    label="Crit multiplier"
                    value={enemy.critMultiplier}
                    min={1}
                    step={0.1}
                    onChange={(v) => upsertEnemy({ ...enemy, critMultiplier: v })}
                  />
                </FieldGrid>
              </Field>

              <Field label="Availability and rewards">
                <FieldGrid>
                  <NumberField label="Min Combat level" value={enemy.minLevel} min={0} onChange={(v) => upsertEnemy({ ...enemy, minLevel: v })} />
                  <NumberField
                    label="Max Combat level"
                    value={enemy.maxLevel ?? 0}
                    min={0}
                    onChange={(v) => upsertEnemy({ ...enemy, maxLevel: v > 0 ? v : null })}
                    hint="0 means no upper limit."
                  />
                  <NumberField label="Combat XP reward" value={enemy.xpReward} min={0} onChange={(v) => upsertEnemy({ ...enemy, xpReward: v })} />
                  <NumberField label="Gold reward" value={enemy.goldReward} min={0} onChange={(v) => upsertEnemy({ ...enemy, goldReward: v })} />
                </FieldGrid>
              </Field>

              {!enemy.boss && local.party?.enabled !== false && (
                <Toggle
                  label="Can be fought in a party"
                  checked={enemy.party !== false}
                  onChange={(v) => upsertEnemy({ ...enemy, party: v ? undefined : false })}
                  hint={enemy.party !== false ? "Others can click Join and help." : "Solo only: nobody can join a fight with it."}
                />
              )}

              {!enemy.boss && (
                <RequirementsField
                  items={shopItems}
                  value={enemy.requirements}
                  onChange={(next) => upsertEnemy({ ...enemy, requirements: next })}
                  skills={skills}
                  hint="Who can fight it, on top of its level range. Members who don't qualify never meet it in /fight or encounters."
                />
              )}

              <EnemyMovesField
                value={enemy.moves}
                onChange={(next) => upsertEnemy({ ...enemy, moves: next })}
                moves={local.moves ?? DEFAULT_MOVES}
                statuses={local.statuses ?? DEFAULT_STATUSES}
              />

              <Field label="Drops">
                <div className="space-y-3">
                  {(enemy.drops ?? []).length === 0 && (
                    <p className="text-xs text-[var(--muted)]">This enemy drops nothing.</p>
                  )}

                  {(enemy.drops ?? []).map((drop, index) => {
                    const patchDrop = (p: Partial<EnemyDrop>) =>
                      upsertEnemy({
                        ...enemy,
                        drops: enemy.drops.map((d, i) => (i === index ? { ...d, ...p } : d)),
                      });

                    return (
                      <div
                        key={index}
                        className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Drop {index + 1}</span>
                          <button
                            type="button"
                            aria-label="Remove drop"
                            onClick={() =>
                              upsertEnemy({
                                ...enemy,
                                drops: enemy.drops.filter((_, i) => i !== index),
                              })
                            }
                            className="text-[var(--muted)] transition-colors hover:text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <FieldGrid>
                          <ItemField items={shopItems}
                            label="Item"
                            value={drop.itemId}
                            onChange={(v) => patchDrop({ itemId: v })}
                            emptyLabel="Choose an item"
                          />
                          <NumberField
                            label="Chance"
                            value={drop.chance}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => patchDrop({ chance: v })}
                            hint="0–1, so 0.25 is a quarter of the time."
                          />
                          <NumberField
                            label="Quantity"
                            value={drop.quantity}
                            min={1}
                            onChange={(v) => patchDrop({ quantity: v })}
                          />
                        </FieldGrid>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() =>
                      upsertEnemy({
                        ...enemy,
                        drops: [...(enemy.drops ?? []), { itemId: "", chance: 0.25, quantity: 1 }],
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
                  >
                    <Plus size={14} /> Add drop
                  </button>
                </div>
              </Field>
            </div>
          )}
        />
      </Section>

        </>
      )}

      {part === "players" && (
        <>
      <Section title="General" description="Whether members can fight at all." defaultOpen={!local.enabled}>
        <Toggle
          label="Enable combat"
          checked={!!local.enabled}
          onChange={(v) => updateRoot({ enabled: v })}
        />
      </Section>

      <Section advanced title="Combat level curve" description="How fast Combat levels come, separate from chat levels." defaultOpen={false}>
        {(() => {
          const curve = local.curve ?? { maxLevel: 99, curveType: "polynomial", curveParams: { factor: 15, degree: 2.2 } };
          const setCurve = (p: Partial<NonNullable<CombatConfig["curve"]>>) => updateRoot({ curve: { ...curve, ...p } });
          const xpFor = (lvl: number) => Math.floor((curve.curveParams.factor ?? 15) * Math.pow(Math.max(0, lvl - 1), curve.curveParams.degree ?? 2.2));
          return (
            <FieldGrid>
              <NumberField label="Max Combat level" value={curve.maxLevel} min={2} onChange={(v) => setCurve({ maxLevel: v })} />
              <NumberField
                label="Curve factor"
                value={curve.curveParams.factor ?? 15}
                min={1}
                step={0.5}
                onChange={(v) => setCurve({ curveParams: { ...curve.curveParams, factor: v } })}
                hint={`Combat 10 takes ${xpFor(10).toLocaleString()} Combat XP, Combat 30 takes ${xpFor(30).toLocaleString()}.`}
              />
              <NumberField
                label="Curve steepness"
                value={curve.curveParams.degree ?? 2.2}
                min={1}
                step={0.05}
                onChange={(v) => setCurve({ curveParams: { ...curve.curveParams, degree: v } })}
                hint="Higher makes late levels slower compared with early ones."
              />
            </FieldGrid>
          );
        })()}
      </Section>

      <Section advanced title="Player stats" description="Each stat starts at its base and grows with every Combat level. Combat is the RPG's own level, earned by fighting, not chatting.">
        <div className="space-y-4">
          {STATS.map(({ label, baseKey, perLevelKey, step }) => (
            <Field key={label} label={label}>
              <FieldGrid>
                <NumberField
                  label="Base"
                  value={(local[baseKey] as number) ?? 0}
                  step={step}
                  onChange={(v) => updateRoot({ [baseKey]: v })}
                />
                <NumberField
                  label="Per level"
                  value={(local[perLevelKey] as number) ?? 0}
                  step={step}
                  onChange={(v) => updateRoot({ [perLevelKey]: v })}
                />
              </FieldGrid>
            </Field>
          ))}
        </div>
      </Section>

      <Section
        title="Health"
        description="HP carries over between fights and comes back on its own. Food and potions heal faster, so fighting makes gathering and cooking worth it."
      >
        <FieldGrid>
          <NumberField
            label="Full refill (minutes)"
            value={local.hp?.regenMinutes ?? 120}
            min={0}
            step={10}
            onChange={(v) => updateRoot({ hp: { ...local.hp, regenMinutes: v } })}
            hint={(local.hp?.regenMinutes ?? 120) > 0 ? "From 0 to full HP. 120 means a member who rests two hours is back to full." : "0 turns regen off: only food, potions and /daily heal."}
          />
          <NumberField
            label="HP after losing (%)"
            value={local.hp?.respawnPercent ?? 25}
            min={0}
            max={100}
            step={5}
            onChange={(v) => updateRoot({ hp: { ...local.hp, respawnPercent: v } })}
            hint="Where a lost fight or duel leaves you, so a loss means a break, not being stuck. World bosses leave you at 0."
          />
        </FieldGrid>
      </Section>

      <Section
        title="Chat level bonus"
        description="Chatting makes members a little stronger: each chat level adds these on top of their Combat stats. Keep them well below the per-Combat-level values so fighting stays the main way up. Set them all to 0 to turn it off."
      >
        <FieldGrid>
          {CHAT_BONUS.map(({ key, label, step }) => (
            <NumberField
              key={key}
              label={`${label} per chat level`}
              value={(local.chatBonus ?? DEFAULT_CHAT_BONUS)[key] ?? 0}
              min={0}
              step={step ?? 0.5}
              onChange={(v) => updateRoot({ chatBonus: { ...(local.chatBonus ?? DEFAULT_CHAT_BONUS), [key]: v } })}
            />
          ))}
        </FieldGrid>
      </Section>

      <Section
        title="Easy enemies"
        description="Beating enemies far below you pays less Combat XP, so moving on to tougher places is worth it. Gold and drops stay the same."
        defaultOpen={false}
      >
        <Toggle
          label="Lower XP from enemies below your level"
          checked={local.easyXp?.enabled !== false}
          onChange={(v) => updateRoot({ easyXp: { ...local.easyXp, enabled: v } })}
        />
        {local.easyXp?.enabled !== false && (
          <div className="mt-4">
            <FieldGrid>
              <NumberField
                label="Less per level over (%)"
                value={local.easyXp?.perLevel ?? 10}
                min={1}
                max={100}
                onChange={(v) => updateRoot({ easyXp: { ...local.easyXp, perLevel: v } })}
                hint="For each Combat level above the top of the enemy's range."
              />
              <NumberField
                label="Never below (%)"
                value={local.easyXp?.floor ?? 25}
                min={0}
                max={100}
                step={5}
                onChange={(v) => updateRoot({ easyXp: { ...local.easyXp, floor: v } })}
                hint={`With these, an enemy 5 levels below you pays ${Math.max(local.easyXp?.floor ?? 25, 100 - 5 * (local.easyXp?.perLevel ?? 10))}% XP.`}
              />
            </FieldGrid>
          </div>
        )}
      </Section>

      <Section advanced title="Death penalties" description="What a member loses on defeat." defaultOpen={false}>
        <Field label="Against enemies (PvE)">{penaltyFields("pveDeathPenalty")}</Field>
        <div className="mt-5">
          <Field label="Against other members (PvP)">{penaltyFields("pvpDeathPenalty")}</Field>
        </div>
      </Section>

        </>
      )}

      {part === "events" && (
        <>
      <Section title="Parties" description="Others joining a fight: a Join button on every fight with room, and each player picks their move privately.">
        <Toggle
          label="Let others join fights"
          checked={local.party?.enabled !== false}
          onChange={(v) => updateRoot({ party: { ...local.party, enabled: v } })}
          hint="The enemy aims at one player each turn and says who, so the party can guard and cover for each other."
        />
        <div className="mt-3">
          <Toggle
            label="Joiners must be in the enemy's level range"
            checked={local.party?.levelRange !== false}
            onChange={(v) => updateRoot({ party: { ...local.party, levelRange: v } })}
            hint={local.party?.levelRange !== false
              ? "A Combat 40 can't carry a Combat 5 through its fights. The enemy's requirements always apply."
              : "Off: anyone can join any fight, whatever their level. Handy for testing, or for servers that like carrying friends."}
          />
        </div>
        <div className="mt-4">
          <FieldGrid>
            <NumberField label="Most players" value={local.party?.maxPlayers ?? 3} min={2} max={5} onChange={(v) => updateRoot({ party: { ...local.party, maxPlayers: v } })} />
            <NumberField
              label="Turn timer (seconds)"
              value={local.party?.turnSeconds ?? 30}
              min={10}
              max={120}
              step={5}
              onChange={(v) => updateRoot({ party: { ...local.party, turnSeconds: v } })}
              hint="The round plays then even if someone hasn't picked; they attack."
            />
            <NumberField
              label="Enemy HP per extra player (%)"
              value={local.party?.hpPerExtraPlayer ?? 100}
              min={0}
              max={300}
              step={10}
              onChange={(v) => updateRoot({ party: { ...local.party, hpPerExtraPlayer: v } })}
              hint="100 means three players face three times the HP, so each earns about what they would alone. Everyone standing gets the full reward and their own drops; anyone knocked out gets half."
            />
          </FieldGrid>
        </div>
      </Section>

      <Section title="Duels" description="Auto-resolved fights between two members." defaultOpen={false}>
        <Toggle
          label="Enable duels"
          checked={!!local.pvp?.enabled}
          onChange={(v) => updatePvp({ enabled: v })}
          hint="Members can challenge each other with /duel. Combat must also be enabled."
        />

        <div className="mt-4">
          <FieldGrid>
            <NumberField
              label="Minimum wager"
              value={local.pvp?.minWager ?? 0}
              min={0}
              onChange={(v) => updatePvp({ minWager: v })}
              hint="0 allows friendly duels with nothing staked."
            />
            <NumberField
              label="Maximum wager"
              value={local.pvp?.maxWager ?? 0}
              min={0}
              onChange={(v) => updatePvp({ maxWager: v })}
              hint="0 means no upper limit."
            />
            <NumberField
              label="Rake (%)"
              value={local.pvp?.rakePercent ?? 0}
              min={0}
              max={100}
              step={0.5}
              onChange={(v) => updatePvp({ rakePercent: v })}
              hint="Cut of the pot removed from circulation. The wager itself only moves between players, so this is the part that drains gold."
            />
            <NumberField
              label="Challenge timeout (seconds)"
              value={local.pvp?.challengeTimeoutSeconds ?? 120}
              min={15}
              onChange={(v) => updatePvp({ challengeTimeoutSeconds: v })}
            />
            <NumberField
              label="Cooldown (seconds)"
              value={local.pvp?.cooldownSeconds ?? 0}
              min={0}
              onChange={(v) => updatePvp({ cooldownSeconds: v })}
              hint="How long a member waits after finishing a duel. 0 disables it — without one, a stronger member can re-challenge a weaker one repeatedly, and HP carries over between duels."
            />
            <NumberField
              label="Round cap"
              value={local.pvp?.maxRounds ?? 50}
              min={1}
              onChange={(v) => updatePvp({ maxRounds: v })}
              hint="Reaching it is a draw and no gold moves — two high-defence members can otherwise trade minimum hits forever."
            />
          </FieldGrid>
        </div>
      </Section>

      <Section title="Random encounters" description="Wild enemies that turn up while people chat." defaultOpen={false}>
        <Toggle
          label="Enable random encounters"
          checked={!!local.encounters?.enabled}
          onChange={(v) => updateEncounters({ enabled: v })}
          hint="Each message that earns XP has a small chance to make an enemy appear in that channel. The first member to click Fight takes it on. Combat must also be enabled, and you need at least one enemy."
        />

        <div className="mt-4">
          <FieldGrid>
            <NumberField
              label="Chance per message (%)"
              value={local.encounters?.chancePercent ?? 2}
              min={0}
              max={100}
              step={0.5}
              onChange={(v) => updateEncounters({ chancePercent: v })}
              hint="2% means roughly one encounter every 50 XP-earning messages."
            />
            <NumberField
              label="Cooldown (seconds)"
              value={local.encounters?.cooldownSeconds ?? 600}
              min={0}
              onChange={(v) => updateEncounters({ cooldownSeconds: v })}
              hint="Shortest gap between two encounters, so a lucky streak can't flood the chat."
            />
            <NumberField
              label="Leaves after (seconds)"
              value={local.encounters?.fleeSeconds ?? 120}
              min={15}
              onChange={(v) => updateEncounters({ fleeSeconds: v })}
              hint="How long an encounter waits for someone to fight it."
            />
            <ChannelsField
              wide
              label="Channels"
              value={local.encounters?.channelIds ?? []}
              onChange={(v) => updateEncounters({ channelIds: v })}
              hint={(local.encounters?.channelIds ?? []).length === 0
                ? "None picked, so any channel that gives XP. Pick some to keep encounters out of busy or serious channels."
                : undefined}
            />
          </FieldGrid>
        </div>
      </Section>

      <Section title="World bosses" description="Big enemies the whole server fights together." defaultOpen={false}>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Make a boss by turning on <span className="text-[var(--foreground)]">World boss</span> for an enemy below.
          Owners can summon one any time with <span className="font-mono">/boss summon</span>.
        </p>
        <Toggle
          label="Spawn bosses on their own"
          checked={!!local.bosses?.enabled}
          onChange={(v) => updateBosses({ enabled: v })}
          hint="Each message that earns XP has a small chance to wake a boss. Only one boss can be loose at a time."
        />

        <div className="mt-4">
          <FieldGrid>
            <NumberField
              label="Chance per message (%)"
              value={local.bosses?.chancePercent ?? 0.2}
              min={0}
              max={100}
              step={0.1}
              onChange={(v) => updateBosses({ chancePercent: v })}
              hint="0.2% is roughly one boss every 500 XP-earning messages."
            />
            <NumberField
              label="Cooldown (seconds)"
              value={local.bosses?.cooldownSeconds ?? 21600}
              min={0}
              onChange={(v) => updateBosses({ cooldownSeconds: v })}
              hint="Shortest gap between two random bosses. 21600 is 6 hours."
            />
            <NumberField
              label="Time to kill (seconds)"
              value={local.bosses?.durationSeconds ?? 1800}
              min={60}
              onChange={(v) => updateBosses({ durationSeconds: v })}
              hint="If it isn't defeated in time it escapes, and nobody is rewarded."
            />
            <NumberField
              label="Attack cooldown (seconds)"
              value={local.bosses?.attackCooldownSeconds ?? 20}
              min={0}
              onChange={(v) => updateBosses({ attackCooldownSeconds: v })}
              hint="How often one member can hit it, so the whole server has to pitch in."
            />
            <ChannelsField
              wide
              label="Channels"
              value={local.bosses?.channelIds ?? []}
              onChange={(v) => updateBosses({ channelIds: v })}
              hint={(local.bosses?.channelIds ?? []).length === 0
                ? "None picked, so any channel that gives XP. Summoned bosses appear wherever /boss summon is run."
                : undefined}
            />
          </FieldGrid>
        </div>
      </Section>
        </>
      )}
    </div>
  );
}

/** What an enemy does in a fight: moves picked by weight, some only when a condition holds. */
function EnemyMovesField({ value, onChange, moves, statuses }: {
  value: EnemyMove[] | undefined;
  onChange: (next: EnemyMove[] | undefined) => void;
  moves: Record<string, MoveConfig>;
  statuses: Record<string, StatusConfig>;
}) {
  const list = value ?? [];
  const options = Object.values(moves).map((m) => ({ value: m.id, label: `${m.emoji} ${m.name}` }));
  const total = list.reduce((sum, m) => sum + Math.max(0, m.weight ?? 1), 0);
  const set = (next: EnemyMove[]) => onChange(next.length ? next : undefined);
  return (
    <Field
      label="Moves"
      hint={list.length
        ? "Each turn it picks one by weight, among those off cooldown whose condition holds, and players see it coming."
        : `None picked, so it uses the defaults: ${DEFAULT_ENEMY_MOVES.map((m) => moves[m.moveId]?.name ?? DEFAULT_MOVES[m.moveId]?.name).join(", ")}.`}
    >
      <div className="space-y-3">
        {list.map((m, i) => {
          const patch = (p: Partial<EnemyMove>) => set(list.map((x, j) => (j === i ? { ...x, ...p } : x)));
          const share = total > 0 ? Math.round((Math.max(0, m.weight ?? 1) / total) * 100) : 0;
          return (
            <div key={i} className="flex items-end gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex-1">
                <FieldGrid>
                  <SelectField label="Move" value={m.moveId} onChange={(v) => patch({ moveId: v })} options={options} />
                  <NumberField label="Weight" value={m.weight ?? 1} min={0} onChange={(v) => patch({ weight: v })} hint={`About ${share}% of turns, when it can use it.`} />
                  <ConditionFields value={m.when} onChange={(when) => patch({ when })} statuses={statuses} />
                </FieldGrid>
              </div>
              <button
                type="button"
                aria-label="Remove move"
                onClick={() => set(list.filter((_, j) => j !== i))}
                className="mb-2 text-[var(--muted)] transition-colors hover:text-red-400"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => set([...(list.length ? list : DEFAULT_ENEMY_MOVES.filter((m) => moves[m.moveId])), ...(list.length ? [{ moveId: options[0]?.value ?? "attack", weight: 1 }] : [])])}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
        >
          <Plus size={14} /> {list.length ? "Add move" : "Customise moves"}
        </button>
      </div>
    </Field>
  );
}
