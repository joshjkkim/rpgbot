"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Field,
  FieldGrid,
  KeyedList,
  NumberField,
  Section,
  TextField,
  Toggle,
} from "@/app/components/ui/form";

// ─── Types (mirrored from rpgbot) ─────────────────────────────────────────────

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
}

type Props = {
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

export default function CombatEditor({ value, onChange }: Props) {
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
      <Section title="General" description="Whether members can fight at all.">
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
              label="Round cap"
              value={local.pvp?.maxRounds ?? 50}
              min={1}
              onChange={(v) => updatePvp({ maxRounds: v })}
              hint="Reaching it is a draw and no gold moves — two high-defence members can otherwise trade minimum hits forever."
            />
          </FieldGrid>
        </div>
      </Section>

      <Section title="Enemies" description="What members can fight, and what beating them pays." defaultOpen={false}>
        <KeyedList<EnemyConfig>
          entries={enemyEntries}
          addPlaceholder="Enemy ID, e.g. slime"
          addLabel="Add enemy"
          empty="No enemies defined. There is nothing to fight yet."
          itemLabel={(id, enemy) => `${enemy.emoji ?? ""} ${enemy.name || id}`.trim()}
          onAdd={(rawId) => {
            const id = rawId.trim();
            if (!/^[a-zA-Z0-9_-]{2,40}$/.test(id)) return;
            if ((local.enemies ?? {})[id]) return;
            upsertEnemy({
              id,
              name: id,
              emoji: "👾",
              hp: 50,
              atk: 8,
              def: 3,
              spd: 5,
              critChance: 0.05,
              critMultiplier: 1.5,
              minLevel: 1,
              maxLevel: null,
              xpReward: 25,
              goldReward: 10,
              drops: [],
            });
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

              <Field label="Stats">
                <FieldGrid>
                  <NumberField label="HP" value={enemy.hp} min={1} onChange={(v) => upsertEnemy({ ...enemy, hp: v })} />
                  <NumberField label="Attack" value={enemy.atk} min={0} onChange={(v) => upsertEnemy({ ...enemy, atk: v })} />
                  <NumberField label="Defence" value={enemy.def} min={0} onChange={(v) => upsertEnemy({ ...enemy, def: v })} />
                  <NumberField label="Speed" value={enemy.spd} min={0} onChange={(v) => upsertEnemy({ ...enemy, spd: v })} />
                  <NumberField
                    label="Crit chance"
                    value={enemy.critChance}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => upsertEnemy({ ...enemy, critChance: v })}
                    hint="0–1, so 0.05 is 5%."
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
                          <TextField
                            label="Item ID"
                            value={drop.itemId}
                            onChange={(v) => patchDrop({ itemId: v })}
                            placeholder="Must exist in the shop"
                            mono
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
    </div>
  );
}
