"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

export interface LevelAction {
  type: "assignRole" | "removeRole" | "sendMessage" | "runCommand";
  roleId?: string;
  message?: string;
  channelId?: string;
  command?: string;
}

export type LevelsConfig = {
  maxLevel: number | null;
  announceLevelUpInChannelId: string | null;
  announceLevelUpMessage: string;
  curveType: "linear" | "exponential" | "polynomial" | "logarithmic";
  curveParams: Record<string, number>;
  xpOverrides: Record<number, number>;
  levelActions: Record<number, LevelAction[]>;
};

type Props = {
  value: LevelsConfig | null | undefined;
  onChange: (next: LevelsConfig) => void;
};

const CURVES: LevelsConfig["curveType"][] = ["linear", "exponential", "polynomial", "logarithmic"];
const ACTION_TYPES: LevelAction["type"][] = ["assignRole", "removeRole", "sendMessage", "runCommand"];

function safeNumber(raw: string, fallback: number) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseNumberOrNull(raw: string) {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function numKey(k: string) {
  const n = Number(k);
  return Number.isFinite(n) ? n : null;
}

export default function LevelsEditor({ value, onChange }: Props) {
  const defaults: LevelsConfig = useMemo(
    () => ({
      maxLevel: null,
      announceLevelUpInChannelId: null,
      announceLevelUpMessage: "🎉 {user} reached level {level}!",
      curveType: "linear",
      curveParams: { base: 100, perLevel: 50 },
      xpOverrides: {},
      levelActions: {},
    }),
    []
  );

  const [local, setLocal] = useState<LevelsConfig>(value ?? defaults);
  const [expanded, setExpanded] = useState({
    general: true,
    curve: true,
    overrides: true,
    actions: true,
  });

  // draft creation rows for "level -> value"
  const [newOverrideLevel, setNewOverrideLevel] = useState<string>("");
  const [newOverrideXp, setNewOverrideXp] = useState<string>("");

  const [newActionLevel, setNewActionLevel] = useState<string>("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [openActionLevel, setOpenActionLevel] = useState<number | null>(null);

  useEffect(() => {
    setLocal(value ?? defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  function commit(next: LevelsConfig) {
    setLocal(next);
    onChange(next);
  }

  function updateRoot(patch: Partial<LevelsConfig>) {
    commit({ ...local, ...patch });
  }

  // ---------- Curve params helpers ----------
  function suggestedParams(curveType: LevelsConfig["curveType"]): Record<string, number> {
    switch (curveType) {
      case "linear":
        return { base: 100, perLevel: 50 };
      case "exponential":
        return { base: 100, growth: 1.15 }; // total ≈ base * growth^(level-1)
      case "polynomial":
        return { a: 10, power: 2, b: 0 }; // total ≈ a * level^power + b
      case "logarithmic":
        return { a: 200, b: 1, c: 0 }; // total ≈ a * ln(level + b) + c
      default:
        return {};
    }
  }

  // ---------- XP Overrides ----------
  const overrideRows = useMemo(() => {
    return Object.entries(local.xpOverrides ?? {})
      .map(([k, v]) => [Number(k), v] as const)
      .filter(([lvl]) => Number.isFinite(lvl))
      .sort((a, b) => a[0] - b[0]);
  }, [local.xpOverrides]);

  function upsertOverride(level: number, xpRequired: number) {
    const next = { ...(local.xpOverrides ?? {}) };
    next[level] = xpRequired;
    commit({ ...local, xpOverrides: next });
  }

  function deleteOverride(level: number) {
    const next = { ...(local.xpOverrides ?? {}) };
    delete next[level];
    commit({ ...local, xpOverrides: next });
  }

  // ---------- Level Actions ----------
  const actionLevelRows = useMemo(() => {
    return Object.entries(local.levelActions ?? {})
      .map(([k, v]) => [Number(k), v] as const)
      .filter(([lvl]) => Number.isFinite(lvl))
      .sort((a, b) => a[0] - b[0]);
  }, [local.levelActions]);

  function ensureLevelActions(level: number) {
    const next = { ...(local.levelActions ?? {}) };
    if (!next[level]) next[level] = [];
    commit({ ...local, levelActions: next });
  }

  function setLevelActions(level: number, actions: LevelAction[]) {
    const next = { ...(local.levelActions ?? {}) };
    next[level] = actions;
    commit({ ...local, levelActions: next });
  }

  function deleteLevelActions(level: number) {
    const next = { ...(local.levelActions ?? {}) };
    delete next[level];
    commit({ ...local, levelActions: next });
    if (openActionLevel === level) setOpenActionLevel(null);
  }

  function addAction(level: number) {
    const curr = (local.levelActions ?? {})[level] ?? [];
    const next: LevelAction[] = [...curr, { type: "sendMessage", message: "Congrats {user}!", channelId: local.announceLevelUpInChannelId ?? "" }];
    setLevelActions(level, next);
  }

  function updateAction(level: number, index: number, patch: Partial<LevelAction>) {
    const curr = (local.levelActions ?? {})[level] ?? [];
    const next = curr.map((a, i) => (i === index ? { ...a, ...patch } : a));
    setLevelActions(level, next);
  }

  function removeAction(level: number, index: number) {
    const curr = (local.levelActions ?? {})[level] ?? [];
    const next = curr.filter((_, i) => i !== index);
    setLevelActions(level, next);
  }

  const SectionHeader = ({
    title,
    section,
    right,
  }: {
    title: string;
    section: keyof typeof expanded;
    right?: React.ReactNode;
  }) => (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={() => setExpanded((p) => ({ ...p, [section]: !p[section] }))}
        className="flex w-full items-center justify-between rounded px-2 py-2 text-lg font-semibold hover:bg-gray-50"
      >
        <span>{title}</span>
        {expanded[section] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>
      {right ? <div className="ml-2 shrink-0">{right}</div> : null}
    </div>
  );

  return (
    <div className="max-w-5xl space-y-6">
      {/* GENERAL */}
      <div className="rounded-lg border p-4">
        <SectionHeader title="Levels — General" section="general" />
        {expanded.general && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium">Max Level (null = no cap)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={local.maxLevel ?? ""}
                  onChange={(e) => updateRoot({ maxLevel: parseNumberOrNull(e.target.value) })}
                  placeholder="(null)"
                />
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => updateRoot({ maxLevel: null })}
                >
                  Null
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Announce Channel ID</label>
              <div className="flex items-center gap-2">
                <input
                  className="w-full rounded border px-3 py-2 text-sm font-mono"
                  value={local.announceLevelUpInChannelId ?? ""}
                  onChange={(e) => updateRoot({ announceLevelUpInChannelId: e.target.value.trim() || null })}
                  placeholder="(blank = null)"
                />
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => updateRoot({ announceLevelUpInChannelId: null })}
                >
                  Null
                </button>
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="block text-sm font-medium">Announce Level Up Message</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={local.announceLevelUpMessage}
                onChange={(e) => updateRoot({ announceLevelUpMessage: e.target.value })}
                placeholder="🎉 {user} reached level {level}!"
              />
              <p className="text-xs text-gray-500">You can use placeholders like {`{user}`} and {`{level}`} if your bot supports them.</p>
            </div>
          </div>
        )}
      </div>

      {/* CURVE */}
      <div className="rounded-lg border p-4">
        <SectionHeader title="XP Curve" section="curve" />
        {expanded.curve && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Curve Type</label>
                <select
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={local.curveType}
                  onChange={(e) => {
                    const nextType = e.target.value as LevelsConfig["curveType"];
                    updateRoot({
                      curveType: nextType,
                      curveParams: suggestedParams(nextType),
                    });
                  }}
                >
                  {CURVES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">
                  Changing type resets params to defaults (so users don’t keep invalid keys).
                </p>
              </div>
            </div>

            <div className="rounded border p-3">
              <div className="text-sm font-semibold">Curve Params</div>
              <div className="mt-3 space-y-3">
                {Object.entries(local.curveParams ?? {}).length === 0 ? (
                  <div className="text-sm text-gray-600">No params.</div>
                ) : (
                  Object.entries(local.curveParams).map(([key, val]) => (
                    <div key={key} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="sm:col-span-1">
                        <div className="rounded border bg-gray-50 px-3 py-2 text-sm font-mono">{key}</div>
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          className="w-full rounded border px-3 py-2 text-sm"
                          value={val}
                          onChange={(e) => {
                            const next = { ...(local.curveParams ?? {}) };
                            next[key] = safeNumber(e.target.value, val);
                            updateRoot({ curveParams: next });
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <details className="rounded border bg-gray-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold">Param meaning (suggested)</summary>
              <div className="mt-2 text-sm text-gray-700 space-y-2">
                <div><span className="font-semibold">linear</span>: <span className="font-mono">base</span>, <span className="font-mono">perLevel</span></div>
                <div><span className="font-semibold">exponential</span>: <span className="font-mono">base</span>, <span className="font-mono">growth</span></div>
                <div><span className="font-semibold">polynomial</span>: <span className="font-mono">a</span>, <span className="font-mono">power</span>, <span className="font-mono">b</span></div>
                <div><span className="font-semibold">logarithmic</span>: <span className="font-mono">a</span>, <span className="font-mono">b</span>, <span className="font-mono">c</span></div>
              </div>
            </details>
          </div>
        )}
      </div>

      {/* XP OVERRIDES */}
      <div className="rounded-lg border p-4">
        <SectionHeader title="XP Overrides (level → total XP required)" section="overrides" />
        {expanded.overrides && (
          <div className="mt-4 space-y-4">
            {/* create row */}
            <div className="rounded border p-3">
              <div className="text-sm font-semibold">Add Override</div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-5">
                <div className="sm:col-span-2 space-y-2">
                  <label className="block text-xs font-medium text-gray-600">Level</label>
                  <input
                    type="number"
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={newOverrideLevel}
                    onChange={(e) => setNewOverrideLevel(e.target.value)}
                    placeholder="e.g. 10"
                  />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <label className="block text-xs font-medium text-gray-600">Total XP Required</label>
                  <input
                    type="number"
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={newOverrideXp}
                    onChange={(e) => setNewOverrideXp(e.target.value)}
                    placeholder="e.g. 5000"
                  />
                </div>
                <div className="sm:col-span-1 flex items-end">
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-center gap-2 rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:opacity-95"
                    onClick={() => {
                      setCreateError(null);
                      const lvl = numKey(newOverrideLevel);
                      const xp = numKey(newOverrideXp);

                      if (lvl === null || lvl < 1) return setCreateError("Override level must be a number >= 1.");
                      if (xp === null || xp < 0) return setCreateError("XP required must be a number >= 0.");

                      upsertOverride(lvl, xp);
                      setNewOverrideLevel("");
                      setNewOverrideXp("");
                    }}
                  >
                    <Plus size={16} />
                    Add
                  </button>
                </div>
              </div>

              {createError && (
                <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{createError}</div>
              )}
            </div>

            {/* list */}
            {overrideRows.length === 0 ? (
              <div className="rounded border bg-gray-50 p-3 text-sm text-gray-600">No overrides.</div>
            ) : (
              <div className="rounded border overflow-hidden">
                <div className="grid grid-cols-12 gap-0 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                  <div className="col-span-3">Level</div>
                  <div className="col-span-7">Total XP Required</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                {overrideRows.map(([lvl, xp]) => (
                  <div key={lvl} className="grid grid-cols-12 items-center gap-0 border-t px-3 py-2">
                    <div className="col-span-3 font-mono text-sm">{lvl}</div>
                    <div className="col-span-7">
                      <input
                        type="number"
                        className="w-full rounded border px-3 py-2 text-sm"
                        value={xp}
                        onChange={(e) => upsertOverride(lvl, safeNumber(e.target.value, xp))}
                      />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
                        onClick={() => deleteOverride(lvl)}
                      >
                        <Trash2 size={16} />
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* LEVEL ACTIONS */}
      <div className="rounded-lg border p-4">
        <SectionHeader title="Level Actions (level → actions[])" section="actions" />
        {expanded.actions && (
          <div className="mt-4 space-y-4">
            {/* add action level */}
            <div className="rounded border p-3">
              <div className="text-sm font-semibold">Add Level Action Group</div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-5">
                <div className="sm:col-span-4 space-y-2">
                  <label className="block text-xs font-medium text-gray-600">Level</label>
                  <input
                    type="number"
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={newActionLevel}
                    onChange={(e) => setNewActionLevel(e.target.value)}
                    placeholder="e.g. 5"
                  />
                </div>
                <div className="sm:col-span-1 flex items-end">
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-center gap-2 rounded bg-zinc-900 px-3 py-2 text-sm text-white hover:opacity-95"
                    onClick={() => {
                      setCreateError(null);
                      const lvl = numKey(newActionLevel);
                      if (lvl === null || lvl < 1) return setCreateError("Level must be a number >= 1.");

                      ensureLevelActions(lvl);
                      setOpenActionLevel(lvl);
                      setNewActionLevel("");
                    }}
                  >
                    <Plus size={16} />
                    Add
                  </button>
                </div>
              </div>
              {createError && (
                <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{createError}</div>
              )}
            </div>

            {actionLevelRows.length === 0 ? (
              <div className="rounded border bg-gray-50 p-3 text-sm text-gray-600">No level actions yet.</div>
            ) : (
              <div className="space-y-3">
                {actionLevelRows.map(([lvl, actions]) => {
                  const isOpen = openActionLevel === lvl;
                  return (
                    <div key={lvl} className="rounded border">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-3 text-left hover:bg-gray-50"
                        onClick={() => setOpenActionLevel(isOpen ? null : lvl)}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-semibold">Level {lvl}</span>
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                              {actions.length} action{actions.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>

                      {isOpen && (
                        <div className="border-t p-3 space-y-4">
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => addAction(lvl)}
                            >
                              <Plus size={16} />
                              Add Action
                            </button>

                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
                              onClick={() => deleteLevelActions(lvl)}
                            >
                              <Trash2 size={16} />
                              Delete Level Group
                            </button>
                          </div>

                          {actions.length === 0 ? (
                            <div className="rounded border bg-gray-50 p-3 text-sm text-gray-600">No actions in this level group.</div>
                          ) : (
                            actions.map((a, idx) => (
                              <div key={idx} className="rounded border p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-semibold">
                                    Action #{idx + 1}{" "}
                                    <span className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{a.type}</span>
                                  </div>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
                                    onClick={() => removeAction(lvl, idx)}
                                  >
                                    <Trash2 size={16} />
                                    Remove
                                  </button>
                                </div>

                                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <div className="space-y-2">
                                    <label className="block text-xs font-medium text-gray-600">Type</label>
                                    <select
                                      className="w-full rounded border px-3 py-2 text-sm"
                                      value={a.type}
                                      onChange={(e) => updateAction(lvl, idx, { type: e.target.value as LevelAction["type"] })}
                                    >
                                      {ACTION_TYPES.map((t) => (
                                        <option key={t} value={t}>
                                          {t}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {(a.type === "assignRole" || a.type === "removeRole") && (
                                    <div className="space-y-2">
                                      <label className="block text-xs font-medium text-gray-600">Role ID</label>
                                      <input
                                        className="w-full rounded border px-3 py-2 text-sm font-mono"
                                        value={a.roleId ?? ""}
                                        onChange={(e) => updateAction(lvl, idx, { roleId: e.target.value })}
                                        placeholder="discord role id"
                                      />
                                    </div>
                                  )}

                                  {a.type === "sendMessage" && (
                                    <>
                                      <div className="space-y-2 sm:col-span-2">
                                        <label className="block text-xs font-medium text-gray-600">Message</label>
                                        <input
                                          className="w-full rounded border px-3 py-2 text-sm"
                                          value={a.message ?? ""}
                                          onChange={(e) => updateAction(lvl, idx, { message: e.target.value })}
                                          placeholder="Congrats {user}!"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <label className="block text-xs font-medium text-gray-600">Channel ID</label>
                                        <input
                                          className="w-full rounded border px-3 py-2 text-sm font-mono"
                                          value={a.channelId ?? ""}
                                          onChange={(e) => updateAction(lvl, idx, { channelId: e.target.value })}
                                          placeholder="discord channel id"
                                        />
                                      </div>
                                    </>
                                  )}

                                  {a.type === "runCommand" && (
                                    <div className="space-y-2 sm:col-span-2">
                                      <label className="block text-xs font-medium text-gray-600">Command</label>
                                      <input
                                        className="w-full rounded border px-3 py-2 text-sm font-mono"
                                        value={a.command ?? ""}
                                        onChange={(e) => updateAction(lvl, idx, { command: e.target.value })}
                                        placeholder="e.g. /grant {user} something"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
