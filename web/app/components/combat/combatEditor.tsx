"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

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
  loserGoldToWinner?: boolean;
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
}

type Props = {
  value: CombatConfig | null | undefined;
  onChange: (next: CombatConfig) => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeNumber(raw: string, fallback: number) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function isValidId(id: string) {
  return /^[a-zA-Z0-9_-]{1,40}$/.test(id);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAT_ROWS: {
  label: string;
  icon: string;
  baseKey: keyof CombatConfig;
  perLevelKey: keyof CombatConfig;
  defaultBase: number;
  defaultPerLevel: number;
  step?: number;
}[] = [
  { label: "HP",                  icon: "❤️",  baseKey: "hpBase",             perLevelKey: "hpPerLevel",             defaultBase: 100, defaultPerLevel: 10   },
  { label: "Attack",              icon: "⚔️",  baseKey: "attackBase",         perLevelKey: "attackPerLevel",         defaultBase: 10,  defaultPerLevel: 2    },
  { label: "Defense",             icon: "🛡️", baseKey: "defenseBase",        perLevelKey: "defensePerLevel",        defaultBase: 5,   defaultPerLevel: 1    },
  { label: "Speed",               icon: "💨",  baseKey: "speedBase",          perLevelKey: "speedPerLevel",          defaultBase: 5,   defaultPerLevel: 1    },
  { label: "Crit Chance (%)",     icon: "🎯",  baseKey: "critChanceBase",     perLevelKey: "critChancePerLevel",     defaultBase: 5,   defaultPerLevel: 0.5, step: 0.1  },
  { label: "Crit Multiplier (×)", icon: "💥",  baseKey: "critMultiplierBase", perLevelKey: "critMultiplierPerLevel", defaultBase: 1.5, defaultPerLevel: 0.05, step: 0.01 },
];

const EMPTY_ENEMY: Omit<EnemyConfig, "id"> = {
  name: "",
  emoji: "👾",
  hp: 100,
  atk: 10,
  def: 5,
  spd: 5,
  critChance: 5,
  critMultiplier: 1.5,
  minLevel: 1,
  maxLevel: null,
  xpReward: 50,
  goldReward: 20,
  drops: [],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CombatEditor({ value, onChange }: Props) {
  const defaults: CombatConfig = useMemo(
    () => ({
      enabled: false,
      hpBase: 100,
      hpPerLevel: 10,
      attackBase: 10,
      attackPerLevel: 2,
      defenseBase: 5,
      defensePerLevel: 1,
      speedBase: 5,
      speedPerLevel: 1,
      critChanceBase: 5,
      critChancePerLevel: 0.5,
      critMultiplierBase: 1.5,
      critMultiplierPerLevel: 0.05,
      enemies: {},
      pveDeathPenalty: {},
      pvpDeathPenalty: {},
    }),
    []
  );

  const [local, setLocal] = useState<CombatConfig>(value ?? defaults);
  const [expanded, setExpanded] = useState({ general: true, stats: true, penalties: true, enemies: true });
  const [openEnemyId, setOpenEnemyId] = useState<string | null>(null);
  const [newEnemy, setNewEnemy] = useState<(Omit<EnemyConfig, "id"> & { id: string }) | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingDropFor, setEditingDropFor] = useState<string | null>(null);
  const [newDrop, setNewDrop] = useState<EnemyDrop>({ itemId: "", chance: 0.25, quantity: 1 });

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

  function updateDeathPenalty(type: "pveDeathPenalty" | "pvpDeathPenalty", patch: Partial<CombatDeathPenalty>) {
    commit({ ...local, [type]: { ...(local[type] ?? {}), ...patch } });
  }

  function updateEnemy(id: string, patch: Partial<EnemyConfig>) {
    const enemies = { ...(local.enemies ?? {}) };
    if (!enemies[id]) return;
    enemies[id] = { ...enemies[id], ...patch };
    commit({ ...local, enemies });
  }

  function deleteEnemy(id: string) {
    const enemies = { ...(local.enemies ?? {}) };
    delete enemies[id];
    commit({ ...local, enemies });
    if (openEnemyId === id) setOpenEnemyId(null);
  }

  function addEnemy() {
    if (!newEnemy) return;
    const id = newEnemy.id.trim().toLowerCase().replace(/\s+/g, "_");
    if (!isValidId(id)) {
      setCreateError("ID must be 1–40 chars: letters, numbers, _ or -");
      return;
    }
    if ((local.enemies ?? {})[id]) {
      setCreateError("An enemy with that ID already exists.");
      return;
    }
    const enemies = { ...(local.enemies ?? {}), [id]: { ...newEnemy, id } };
    commit({ ...local, enemies });
    setNewEnemy(null);
    setCreateError(null);
    setOpenEnemyId(id);
  }

  function addDropToEnemy(enemyId: string) {
    if (!newDrop.itemId.trim()) return;
    const enemies = { ...(local.enemies ?? {}) };
    const enemy = enemies[enemyId];
    if (!enemy) return;
    enemies[enemyId] = { ...enemy, drops: [...(enemy.drops ?? []), { ...newDrop }] };
    commit({ ...local, enemies });
    setNewDrop({ itemId: "", chance: 0.25, quantity: 1 });
    setEditingDropFor(null);
  }

  function removeDrop(enemyId: string, dropIndex: number) {
    const enemies = { ...(local.enemies ?? {}) };
    const enemy = enemies[enemyId];
    if (!enemy) return;
    const drops = [...(enemy.drops ?? [])];
    drops.splice(dropIndex, 1);
    enemies[enemyId] = { ...enemy, drops };
    commit({ ...local, enemies });
  }

  const sortedEnemies = useMemo(
    () => Object.values(local.enemies ?? {}).sort((a, b) => a.minLevel - b.minLevel || a.name.localeCompare(b.name)),
    [local.enemies]
  );

  const SectionHeader = ({ title, section }: { title: string; section: keyof typeof expanded }) => (
    <button
      type="button"
      onClick={() => setExpanded((p) => ({ ...p, [section]: !p[section] }))}
      className="flex w-full items-center justify-between rounded px-2 py-2 text-lg font-semibold hover:bg-gray-50"
    >
      <span>{title}</span>
      {expanded[section] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
    </button>
  );

  return (
    <div className="max-w-5xl space-y-6">

      {/* ── GENERAL ─────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border p-4">
        <SectionHeader title="Combat — General" section="general" />
        {expanded.general && (
          <div className="mt-4">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={!!local.enabled}
                onChange={(e) => updateRoot({ enabled: e.target.checked })}
              />
              <span className="font-medium">Enable Combat System</span>
            </label>
            <p className="mt-1 text-xs text-gray-500">
              When disabled the <code>/fight</code> command does nothing.
            </p>
          </div>
        )}
      </div>

      {/* ── STAT SCALING ────────────────────────────────────────────────────── */}
      <div className="rounded-lg border p-4">
        <SectionHeader title="Stat Scaling" section="stats" />
        {expanded.stats && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-gray-500">
              Player stats are computed as <strong>Base + (Level × Per Level)</strong>. Equipped items add on top.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500">
                    <th className="pb-2 pr-6 w-44">Stat</th>
                    <th className="pb-2 pr-4">Base</th>
                    <th className="pb-2">Per Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {STAT_ROWS.map((row) => (
                    <tr key={String(row.baseKey)}>
                      <td className="py-2 pr-6 font-medium whitespace-nowrap">
                        {row.icon} {row.label}
                      </td>
                      <td className="py-2 pr-4">
                        <input
                          type="number"
                          className="w-28 rounded border px-2 py-1 text-sm"
                          value={(local[row.baseKey] as number) ?? row.defaultBase}
                          onChange={(e) =>
                            updateRoot({ [row.baseKey]: safeNumber(e.target.value, row.defaultBase) })
                          }
                          step={row.step ?? 1}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          className="w-28 rounded border px-2 py-1 text-sm"
                          value={(local[row.perLevelKey] as number) ?? row.defaultPerLevel}
                          onChange={(e) =>
                            updateRoot({ [row.perLevelKey]: safeNumber(e.target.value, row.defaultPerLevel) })
                          }
                          step={row.step ?? 1}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── DEATH PENALTIES ─────────────────────────────────────────────────── */}
      <div className="rounded-lg border p-4">
        <SectionHeader title="Death Penalties" section="penalties" />
        {expanded.penalties && (
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">

            {/* PvE */}
            <div className="rounded border p-4 space-y-3">
              <div className="font-semibold text-sm">💀 PvE Death Penalty</div>
              <p className="text-xs text-gray-500">Applied when a player is defeated by an enemy.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Gold Lost (%)</label>
                  <input
                    type="number"
                    className="w-full rounded border px-2 py-1 text-sm"
                    value={local.pveDeathPenalty?.goldPercent ?? 0}
                    onChange={(e) => updateDeathPenalty("pveDeathPenalty", { goldPercent: safeNumber(e.target.value, 0) })}
                    min={0} max={100} step={0.1}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Gold Lost (flat min)</label>
                  <input
                    type="number"
                    className="w-full rounded border px-2 py-1 text-sm"
                    value={local.pveDeathPenalty?.goldFlat ?? 0}
                    onChange={(e) => updateDeathPenalty("pveDeathPenalty", { goldFlat: safeNumber(e.target.value, 0) })}
                    min={0}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-medium">XP Lost (%)</label>
                  <input
                    type="number"
                    className="w-full rounded border px-2 py-1 text-sm"
                    value={local.pveDeathPenalty?.xpPercent ?? 0}
                    onChange={(e) => updateDeathPenalty("pveDeathPenalty", { xpPercent: safeNumber(e.target.value, 0) })}
                    min={0} max={100} step={0.1}
                  />
                  <p className="text-xs text-amber-600">⚠️ XP loss not recommended for PvE.</p>
                </div>
              </div>
            </div>

            {/* PvP */}
            <div className="rounded border p-4 space-y-3">
              <div className="font-semibold text-sm">⚔️ PvP Death Penalty</div>
              <p className="text-xs text-gray-500">
                Applied when a player loses in PvP (wager-based PvP coming soon).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Gold Lost (%)</label>
                  <input
                    type="number"
                    className="w-full rounded border px-2 py-1 text-sm"
                    value={local.pvpDeathPenalty?.goldPercent ?? 0}
                    onChange={(e) => updateDeathPenalty("pvpDeathPenalty", { goldPercent: safeNumber(e.target.value, 0) })}
                    min={0} max={100} step={0.1}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Gold Lost (flat min)</label>
                  <input
                    type="number"
                    className="w-full rounded border px-2 py-1 text-sm"
                    value={local.pvpDeathPenalty?.goldFlat ?? 0}
                    onChange={(e) => updateDeathPenalty("pvpDeathPenalty", { goldFlat: safeNumber(e.target.value, 0) })}
                    min={0}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">XP Lost (%)</label>
                  <input
                    type="number"
                    className="w-full rounded border px-2 py-1 text-sm"
                    value={local.pvpDeathPenalty?.xpPercent ?? 0}
                    onChange={(e) => updateDeathPenalty("pvpDeathPenalty", { xpPercent: safeNumber(e.target.value, 0) })}
                    min={0} max={100} step={0.1}
                  />
                </div>
                <div className="space-y-1 flex items-end pb-1">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!local.pvpDeathPenalty?.loserGoldToWinner}
                      onChange={(e) => updateDeathPenalty("pvpDeathPenalty", { loserGoldToWinner: e.target.checked })}
                    />
                    Give loser's gold to winner
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── ENEMIES ─────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <SectionHeader title={`Enemies (${sortedEnemies.length})`} section="enemies" />
          <button
            type="button"
            className="ml-2 shrink-0 flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            onClick={() => {
              setNewEnemy({ ...EMPTY_ENEMY, id: "" });
              setCreateError(null);
            }}
          >
            <Plus size={14} /> Add Enemy
          </button>
        </div>

        {expanded.enemies && (
          <div className="mt-4 space-y-3">

            {/* New enemy form */}
            {newEnemy && (
              <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4 space-y-4">
                <div className="font-semibold text-sm text-blue-800">New Enemy</div>
                {createError && <p className="text-xs text-red-600">{createError}</p>}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {/* Identity */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium">ID *</label>
                    <input
                      className="w-full rounded border px-2 py-1 text-sm font-mono"
                      value={newEnemy.id}
                      onChange={(e) => setNewEnemy({ ...newEnemy, id: e.target.value })}
                      placeholder="goblin"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Name *</label>
                    <input
                      className="w-full rounded border px-2 py-1 text-sm"
                      value={newEnemy.name}
                      onChange={(e) => setNewEnemy({ ...newEnemy, name: e.target.value })}
                      placeholder="Goblin"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Emoji *</label>
                    <input
                      className="w-full rounded border px-2 py-1 text-sm"
                      value={newEnemy.emoji}
                      onChange={(e) => setNewEnemy({ ...newEnemy, emoji: e.target.value })}
                      placeholder="👺"
                    />
                  </div>
                  {/* Level range */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Min Level</label>
                    <input
                      type="number"
                      className="w-full rounded border px-2 py-1 text-sm"
                      value={newEnemy.minLevel}
                      onChange={(e) => setNewEnemy({ ...newEnemy, minLevel: safeNumber(e.target.value, 1) })}
                      min={1}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Max Level (blank = ∞)</label>
                    <input
                      type="number"
                      className="w-full rounded border px-2 py-1 text-sm"
                      value={newEnemy.maxLevel ?? ""}
                      onChange={(e) =>
                        setNewEnemy({
                          ...newEnemy,
                          maxLevel: e.target.value.trim() === "" ? null : safeNumber(e.target.value, 1),
                        })
                      }
                      placeholder="—"
                    />
                  </div>
                  {/* Combat stats */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium">❤️ HP</label>
                    <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={newEnemy.hp} onChange={(e) => setNewEnemy({ ...newEnemy, hp: safeNumber(e.target.value, 100) })} min={1} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">⚔️ ATK</label>
                    <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={newEnemy.atk} onChange={(e) => setNewEnemy({ ...newEnemy, atk: safeNumber(e.target.value, 10) })} min={0} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">🛡️ DEF</label>
                    <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={newEnemy.def} onChange={(e) => setNewEnemy({ ...newEnemy, def: safeNumber(e.target.value, 5) })} min={0} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">💨 SPD</label>
                    <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={newEnemy.spd} onChange={(e) => setNewEnemy({ ...newEnemy, spd: safeNumber(e.target.value, 5) })} min={0} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">🎯 Crit Chance (%)</label>
                    <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={newEnemy.critChance} onChange={(e) => setNewEnemy({ ...newEnemy, critChance: safeNumber(e.target.value, 5) })} min={0} max={100} step={0.1} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">💥 Crit Multiplier (×)</label>
                    <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={newEnemy.critMultiplier} onChange={(e) => setNewEnemy({ ...newEnemy, critMultiplier: safeNumber(e.target.value, 1.5) })} min={1} step={0.05} />
                  </div>
                  {/* Rewards */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium">🏆 XP Reward</label>
                    <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={newEnemy.xpReward} onChange={(e) => setNewEnemy({ ...newEnemy, xpReward: safeNumber(e.target.value, 50) })} min={0} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">💰 Gold Reward</label>
                    <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={newEnemy.goldReward} onChange={(e) => setNewEnemy({ ...newEnemy, goldReward: safeNumber(e.target.value, 20) })} min={0} />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    className="rounded border px-3 py-1.5 text-sm hover:bg-gray-100"
                    onClick={() => { setNewEnemy(null); setCreateError(null); }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                    disabled={!newEnemy.name.trim() || !newEnemy.id.trim()}
                    onClick={addEnemy}
                  >
                    Add Enemy
                  </button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {sortedEnemies.length === 0 && !newEnemy && (
              <p className="text-sm text-gray-500">
                No enemies configured yet. Click <strong>Add Enemy</strong> to create one.
              </p>
            )}

            {/* Enemy list */}
            {sortedEnemies.map((enemy) => (
              <div key={enemy.id} className="rounded-lg border">
                {/* Header row */}
                <div
                  className="flex cursor-pointer items-center justify-between p-3 hover:bg-gray-50 select-none"
                  onClick={() => setOpenEnemyId(openEnemyId === enemy.id ? null : enemy.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">{enemy.emoji}</span>
                    <div className="min-w-0">
                      <span className="font-semibold">{enemy.name}</span>
                      <span className="ml-2 font-mono text-xs text-gray-400">[{enemy.id}]</span>
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      Lv {enemy.minLevel}{enemy.maxLevel !== null ? `–${enemy.maxLevel}` : "+"}
                    </span>
                    <span className="hidden sm:block shrink-0 text-xs text-gray-400">
                      ❤️ {enemy.hp} · ⚔️ {enemy.atk} · 🛡️ {enemy.def} · 💨 {enemy.spd}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400">{enemy.drops?.length ?? 0} drop(s)</span>
                    <button
                      type="button"
                      className="rounded p-1 text-red-500 hover:bg-red-50"
                      onClick={(e) => { e.stopPropagation(); deleteEnemy(enemy.id); }}
                    >
                      <Trash2 size={16} />
                    </button>
                    {openEnemyId === enemy.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Expanded editor */}
                {openEnemyId === enemy.id && (
                  <div className="border-t p-4 space-y-5">
                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Name</label>
                        <input className="w-full rounded border px-2 py-1 text-sm" value={enemy.name} onChange={(e) => updateEnemy(enemy.id, { name: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Emoji</label>
                        <input className="w-full rounded border px-2 py-1 text-sm" value={enemy.emoji} onChange={(e) => updateEnemy(enemy.id, { emoji: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Min Level</label>
                        <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={enemy.minLevel} onChange={(e) => updateEnemy(enemy.id, { minLevel: safeNumber(e.target.value, 1) })} min={1} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Max Level (blank = ∞)</label>
                        <input
                          type="number"
                          className="w-full rounded border px-2 py-1 text-sm"
                          value={enemy.maxLevel ?? ""}
                          onChange={(e) =>
                            updateEnemy(enemy.id, {
                              maxLevel: e.target.value.trim() === "" ? null : safeNumber(e.target.value, 1),
                            })
                          }
                          placeholder="—"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">❤️ HP</label>
                        <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={enemy.hp} onChange={(e) => updateEnemy(enemy.id, { hp: safeNumber(e.target.value, 1) })} min={1} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">⚔️ ATK</label>
                        <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={enemy.atk} onChange={(e) => updateEnemy(enemy.id, { atk: safeNumber(e.target.value, 0) })} min={0} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">🛡️ DEF</label>
                        <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={enemy.def} onChange={(e) => updateEnemy(enemy.id, { def: safeNumber(e.target.value, 0) })} min={0} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">💨 SPD</label>
                        <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={enemy.spd} onChange={(e) => updateEnemy(enemy.id, { spd: safeNumber(e.target.value, 0) })} min={0} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">🎯 Crit Chance (%)</label>
                        <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={enemy.critChance} onChange={(e) => updateEnemy(enemy.id, { critChance: safeNumber(e.target.value, 5) })} min={0} max={100} step={0.1} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">💥 Crit Multiplier (×)</label>
                        <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={enemy.critMultiplier} onChange={(e) => updateEnemy(enemy.id, { critMultiplier: safeNumber(e.target.value, 1.5) })} min={1} step={0.05} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">🏆 XP Reward</label>
                        <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={enemy.xpReward} onChange={(e) => updateEnemy(enemy.id, { xpReward: safeNumber(e.target.value, 0) })} min={0} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">💰 Gold Reward</label>
                        <input type="number" className="w-full rounded border px-2 py-1 text-sm" value={enemy.goldReward} onChange={(e) => updateEnemy(enemy.id, { goldReward: safeNumber(e.target.value, 0) })} min={0} />
                      </div>
                    </div>

                    {/* Drops */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold">🎁 Item Drops</div>
                        <button
                          type="button"
                          className="flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                          onClick={() => {
                            setEditingDropFor(editingDropFor === enemy.id ? null : enemy.id);
                            setNewDrop({ itemId: "", chance: 0.25, quantity: 1 });
                          }}
                        >
                          <Plus size={12} /> Add Drop
                        </button>
                      </div>

                      {/* Add drop form */}
                      {editingDropFor === enemy.id && (
                        <div className="rounded border bg-green-50 p-3 mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs font-medium">Item ID</label>
                            <input
                              className="w-full rounded border px-2 py-1 text-xs font-mono"
                              value={newDrop.itemId}
                              onChange={(e) => setNewDrop({ ...newDrop, itemId: e.target.value })}
                              placeholder="health_potion"
                            />
                            <p className="text-xs text-gray-400">Must match a shop item ID.</p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Chance (0–1)</label>
                            <input
                              type="number"
                              className="w-full rounded border px-2 py-1 text-xs"
                              value={newDrop.chance}
                              onChange={(e) => setNewDrop({ ...newDrop, chance: safeNumber(e.target.value, 0.25) })}
                              min={0} max={1} step={0.01}
                            />
                            <p className="text-xs text-gray-400">e.g. 0.25 = 25%</p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Quantity</label>
                            <input
                              type="number"
                              className="w-full rounded border px-2 py-1 text-xs"
                              value={newDrop.quantity}
                              onChange={(e) => setNewDrop({ ...newDrop, quantity: safeNumber(e.target.value, 1) })}
                              min={1}
                            />
                          </div>
                          <div className="sm:col-span-4 flex justify-end gap-2">
                            <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-gray-100" onClick={() => setEditingDropFor(null)}>Cancel</button>
                            <button
                              type="button"
                              className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                              disabled={!newDrop.itemId.trim()}
                              onClick={() => addDropToEnemy(enemy.id)}
                            >
                              Add Drop
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Drop list */}
                      {(enemy.drops ?? []).length === 0 ? (
                        <p className="text-xs text-gray-400">No drops configured.</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-left text-gray-500">
                              <th className="pb-1 pr-3">#</th>
                              <th className="pb-1 pr-3">Item ID</th>
                              <th className="pb-1 pr-3">Chance</th>
                              <th className="pb-1 pr-3">Qty</th>
                              <th className="pb-1" />
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(enemy.drops ?? []).map((drop, i) => (
                              <tr key={i}>
                                <td className="py-1 pr-3 text-gray-400">{i}</td>
                                <td className="py-1 pr-3 font-mono">{drop.itemId}</td>
                                <td className="py-1 pr-3">{(drop.chance * 100).toFixed(1)}%</td>
                                <td className="py-1 pr-3">×{drop.quantity}</td>
                                <td className="py-1">
                                  <button
                                    type="button"
                                    className="text-red-500 hover:text-red-700"
                                    onClick={() => removeDrop(enemy.id, i)}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
