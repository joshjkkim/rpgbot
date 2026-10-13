"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Field,
  FieldGrid,
  NumberField,
  Section,
  TextField,
  Toggle,
} from "@/app/components/ui/form";
import { ContentBrowser, EntryTooltip, idFromName } from "@/app/components/ui/slots";
import { ChannelsField, ItemField } from "@/app/components/ui/pickers";

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
  enemies?: Record<string, EnemyConfig>;
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

export default function CombatEditor({ value, onChange, shopItems }: Props) {
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
          label="XP lost (%)"
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
                <TextField label="Emoji" value={enemy.emoji ?? ""} onChange={(v) => upsertEnemy({ ...enemy, emoji: v })} />
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
                  <NumberField label="Min level" value={enemy.minLevel} min={0} onChange={(v) => upsertEnemy({ ...enemy, minLevel: v })} />
                  <NumberField
                    label="Max level"
                    value={enemy.maxLevel ?? 0}
                    min={0}
                    onChange={(v) => upsertEnemy({ ...enemy, maxLevel: v > 0 ? v : null })}
                    hint="0 means no upper limit."
                  />
                  <NumberField label="XP reward" value={enemy.xpReward} min={0} onChange={(v) => upsertEnemy({ ...enemy, xpReward: v })} />
                  <NumberField label="Gold reward" value={enemy.goldReward} min={0} onChange={(v) => upsertEnemy({ ...enemy, goldReward: v })} />
                </FieldGrid>
              </Field>

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

      <Section title="General" description="Whether members can fight at all." defaultOpen={!local.enabled}>
        <Toggle
          label="Enable combat"
          checked={!!local.enabled}
          onChange={(v) => updateRoot({ enabled: v })}
        />
      </Section>

      <Section title="Player stats" description="Each stat starts at its base and grows every level.">
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

      <Section title="Death penalties" description="What a member loses on defeat." defaultOpen={false}>
        <Field label="Against enemies (PvE)">{penaltyFields("pveDeathPenalty")}</Field>
        <div className="mt-5">
          <Field label="Against other members (PvP)">{penaltyFields("pvpDeathPenalty")}</Field>
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

    </div>
  );
}
