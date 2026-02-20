"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

export interface AchievementCondition {
  type: "stat" | "level" | "xp" | "gold" | "streak";
  statKey?: string;
  operator: ">=" | "<=" | "==" | ">" | "<" | "!=";
  value: number;
}

export interface AchievementReward {
  xp?: number;
  gold?: number;
  itemId?: string;
  quantity?: number;
  roleId?: string;
  message?: string;
  channelId?: string;
}

export interface AchievementConfig {
  id: string;
  name: string;
  description: string;
  category: "xp" | "social" | "daily" | "economy" | "vc" | "misc";
  conditions: AchievementCondition;
  reward?: AchievementReward;
  secret?: boolean;
  overrideChannelId?: string | null;
  overrideAnnouncement?: string | null;
}

export type AchievementsConfig = {
  enabled: boolean;
  progress: boolean;
  achievements: Record<string, AchievementConfig>;
  announceAllId: string | null;
  announceMessage: string | null;
};

type Props = {
  value: AchievementsConfig | null | undefined;
  onChange: (next: AchievementsConfig) => void;
};

type NewAchievementDraft = Omit<AchievementConfig, "id"> & { id: string };

function safeNumber(raw: string, fallback: number) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeId(id: string) {
  return id.trim();
}

// same rule I used earlier; tweak/remove if you want
function isValidId(id: string) {
  return /^[a-zA-Z0-9_-]{2,60}$/.test(id);
}

const CATEGORY_OPTIONS: AchievementConfig["category"][] = ["xp", "social", "daily", "economy", "vc", "misc"];
const CONDITION_TYPES: AchievementCondition["type"][] = ["stat", "level", "xp", "gold", "streak"];
const OPS: AchievementCondition["operator"][] = [">=", "<=", "==", ">", "<", "!="];

export default function AchievementsEditor({ value, onChange }: Props) {
  const defaults: AchievementsConfig = useMemo(
    () => ({
      enabled: false,
      progress: true,
      achievements: {},
      announceAllId: null,
      announceMessage: null,
    }),
    []
  );

  const [local, setLocal] = useState<AchievementsConfig>(value ?? defaults);

  const [expanded, setExpanded] = useState({
    general: true,
    achievements: true,
  });

  const [openAchievementId, setOpenAchievementId] = useState<string | null>(null);

  const [newAchievement, setNewAchievement] = useState<NewAchievementDraft | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    setLocal(value ?? defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  function commit(next: AchievementsConfig) {
    setLocal(next);
    onChange(next);
  }

  function updateRoot(patch: Partial<AchievementsConfig>) {
    commit({ ...local, ...patch });
  }

  function updateAchievement(id: string, patch: Partial<AchievementConfig>) {
    const curr = local.achievements?.[id];
    if (!curr) return;

    const nextAch = { ...(local.achievements ?? {}) };
    nextAch[id] = { ...curr, ...patch, id }; // <-- lock id after creation
    commit({ ...local, achievements: nextAch });
  }

  function deleteAchievement(id: string) {
    const nextAch = { ...(local.achievements ?? {}) };
    delete nextAch[id];
    commit({ ...local, achievements: nextAch });
    if (openAchievementId === id) setOpenAchievementId(null);
  }

  const sortedAchievements = useMemo(() => {
    return Object.values(local.achievements ?? {}).sort((a, b) => a.name.localeCompare(b.name));
  }, [local.achievements]);

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
        <SectionHeader title="Achievements — General" section="general" />

        {expanded.general && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={!!local.enabled}
                onChange={(e) => updateRoot({ enabled: e.target.checked })}
              />
              <span className="font-medium">Enabled</span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={!!local.progress}
                onChange={(e) => updateRoot({ progress: e.target.checked })}
              />
              <span className="font-medium">Progress tracking</span>
            </label>

            <div className="space-y-2 sm:col-span-2">
              <label className="block text-sm font-medium">Announce Channel ID (announceAllId)</label>
              <div className="flex items-center gap-2">
                <input
                  className="w-full rounded border px-3 py-2 text-sm font-mono"
                  value={local.announceAllId ?? ""}
                  onChange={(e) => updateRoot({ announceAllId: e.target.value.trim() || null })}
                  placeholder="(blank = null)"
                />
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => updateRoot({ announceAllId: null })}
                >
                  Null
                </button>
              </div>
              <p className="text-xs text-gray-500">If set, all achievements can announce here unless overridden.</p>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <label className="block text-sm font-medium">Announce Message Template (announceMessage)</label>
              <div className="flex items-center gap-2">
                <input
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={local.announceMessage ?? ""}
                  onChange={(e) => updateRoot({ announceMessage: e.target.value || null })}
                  placeholder="(blank = null)"
                />
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => updateRoot({ announceMessage: null })}
                >
                  Null
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ACHIEVEMENTS */}
      <div className="rounded-lg border p-4">
        <SectionHeader
          title="Achievements"
          section="achievements"
          right={
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => {
                setCreateError(null);
                setNewAchievement({
                  id: "",
                  name: "New Achievement",
                  description: "",
                  category: "misc",
                  conditions: {
                    type: "xp",
                    operator: ">=",
                    value: 100,
                  },
                  reward: undefined,
                  secret: false,
                  overrideChannelId: null,
                  overrideAnnouncement: null,
                });
                setExpanded((p) => ({ ...p, achievements: true }));
              }}
            >
              <Plus size={16} />
              Add
            </button>
          }
        />

        {expanded.achievements && (
          <div className="mt-4 space-y-3">
            {/* CREATE DRAFT */}
            {newAchievement && (
              <div className="rounded border p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Create Achievement</div>
                  <button
                    type="button"
                    className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
                    onClick={() => {
                      setNewAchievement(null);
                      setCreateError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <label className="block text-sm font-medium">Achievement ID (set once)</label>
                    <input
                      className="w-full rounded border px-3 py-2 text-sm font-mono"
                      value={newAchievement.id}
                      onChange={(e) => setNewAchievement({ ...newAchievement, id: e.target.value })}
                      placeholder="e.g. first_100_xp"
                    />
                    <p className="text-xs text-gray-500">
                      Allowed: letters/numbers/_/-. Once created, you can’t change it.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Name</label>
                    <input
                      className="w-full rounded border px-3 py-2 text-sm"
                      value={newAchievement.name}
                      onChange={(e) => setNewAchievement({ ...newAchievement, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium">Category</label>
                    <select
                      className="w-full rounded border px-3 py-2 text-sm"
                      value={newAchievement.category}
                      onChange={(e) =>
                        setNewAchievement({
                          ...newAchievement,
                          category: e.target.value as AchievementConfig["category"],
                        })
                      }
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <label className="block text-sm font-medium">Description</label>
                    <input
                      className="w-full rounded border px-3 py-2 text-sm"
                      value={newAchievement.description}
                      onChange={(e) => setNewAchievement({ ...newAchievement, description: e.target.value })}
                      placeholder="What does the user do to earn this?"
                    />
                  </div>
                </div>

                {createError && (
                  <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                    {createError}
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:opacity-95"
                    onClick={() => {
                      setCreateError(null);
                      const id = normalizeId(newAchievement.id);

                      if (!id) return setCreateError("Achievement ID is required.");
                      if (!isValidId(id)) return setCreateError("ID must be 2–60 chars: letters/numbers/_/- only.");
                      if ((local.achievements ?? {})[id]) return setCreateError("That achievement ID is already taken.");

                      const ach: AchievementConfig = {
                        id,
                        name: newAchievement.name,
                        description: newAchievement.description,
                        category: newAchievement.category,
                        conditions: newAchievement.conditions,
                        reward: newAchievement.reward,
                        secret: newAchievement.secret,
                        overrideChannelId: newAchievement.overrideChannelId ?? null,
                        overrideAnnouncement: newAchievement.overrideAnnouncement ?? null,
                      };

                      const nextAch = { ...(local.achievements ?? {}) };
                      nextAch[id] = ach;
                      commit({ ...local, achievements: nextAch });

                      setNewAchievement(null);
                      setOpenAchievementId(id);
                    }}
                  >
                    Create Achievement
                  </button>
                </div>
              </div>
            )}

            {/* LIST */}
            {sortedAchievements.length === 0 ? (
              <div className="rounded border bg-gray-50 p-3 text-sm text-gray-600">
                No achievements yet. Add one to start.
              </div>
            ) : (
              sortedAchievements.map((a) => {
                const isOpen = openAchievementId === a.id;

                return (
                  <div key={a.id} className="rounded border">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-3 text-left hover:bg-gray-50"
                      onClick={() => setOpenAchievementId(isOpen ? null : a.id)}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold">{a.name}</span>
                          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{a.category}</span>
                          {a.secret ? (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">Secret</span>
                          ) : null}
                          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                            {a.conditions.type} {a.conditions.operator} {a.conditions.value}
                          </span>
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          id: <span className="font-mono">{a.id}</span>
                          {a.description ? ` • ${a.description}` : ""}
                        </div>
                      </div>
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>

                    {isOpen && (
                      <div className="border-t p-3 space-y-6">
                        {/* Locked ID */}
                        <div className="space-y-2">
                          <label className="block text-sm font-medium">Achievement ID</label>
                          <input
                            className="w-full rounded border bg-gray-50 px-3 py-2 text-sm font-mono"
                            value={a.id}
                            disabled
                          />
                          <p className="text-xs text-gray-500">IDs are set on create and can’t be changed.</p>
                        </div>

                        {/* Basic */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="block text-sm font-medium">Name</label>
                            <input
                              className="w-full rounded border px-3 py-2 text-sm"
                              value={a.name}
                              onChange={(e) => updateAchievement(a.id, { name: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="block text-sm font-medium">Category</label>
                            <select
                              className="w-full rounded border px-3 py-2 text-sm"
                              value={a.category}
                              onChange={(e) =>
                                updateAchievement(a.id, {
                                  category: e.target.value as AchievementConfig["category"],
                                })
                              }
                            >
                              {CATEGORY_OPTIONS.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-2 sm:col-span-2">
                            <label className="block text-sm font-medium">Description</label>
                            <input
                              className="w-full rounded border px-3 py-2 text-sm"
                              value={a.description}
                              onChange={(e) => updateAchievement(a.id, { description: e.target.value })}
                            />
                          </div>

                          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
                            <input
                              type="checkbox"
                              checked={!!a.secret}
                              onChange={(e) => updateAchievement(a.id, { secret: e.target.checked })}
                            />
                            Secret
                          </label>
                        </div>

                        {/* Conditions */}
                        <div className="rounded border p-3">
                          <div className="text-sm font-semibold">Condition</div>

                          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-4">
                            <div className="space-y-2 sm:col-span-2">
                              <label className="block text-xs font-medium text-gray-600">Type</label>
                              <select
                                className="w-full rounded border px-3 py-2 text-sm"
                                value={a.conditions.type}
                                onChange={(e) => {
                                  const nextType = e.target.value as AchievementCondition["type"];
                                  const nextCond: AchievementCondition = {
                                    ...a.conditions,
                                    type: nextType,
                                    // if leaving stat, drop statKey
                                    statKey: nextType === "stat" ? (a.conditions.statKey ?? "") : undefined,
                                  };
                                  updateAchievement(a.id, { conditions: nextCond });
                                }}
                              >
                                {CONDITION_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-gray-600">Operator</label>
                              <select
                                className="w-full rounded border px-3 py-2 text-sm"
                                value={a.conditions.operator}
                                onChange={(e) => {
                                  updateAchievement(a.id, {
                                    conditions: { ...a.conditions, operator: e.target.value as AchievementCondition["operator"] },
                                  });
                                }}
                              >
                                {OPS.map((op) => (
                                  <option key={op} value={op}>
                                    {op}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-gray-600">Value</label>
                              <input
                                type="number"
                                className="w-full rounded border px-3 py-2 text-sm"
                                value={a.conditions.value}
                                onChange={(e) => {
                                  updateAchievement(a.id, {
                                    conditions: { ...a.conditions, value: safeNumber(e.target.value, a.conditions.value) },
                                  });
                                }}
                              />
                            </div>

                            {a.conditions.type === "stat" && (
                              <div className="space-y-2 sm:col-span-4">
                                <label className="block text-xs font-medium text-gray-600">Stat Key</label>
                                <input
                                  className="w-full rounded border px-3 py-2 text-sm font-mono"
                                  value={a.conditions.statKey ?? ""}
                                  onChange={(e) =>
                                    updateAchievement(a.id, {
                                      conditions: { ...a.conditions, statKey: e.target.value },
                                    })
                                  }
                                  placeholder="e.g. messagesSent"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Reward */}
                        <div className="rounded border p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold">Reward</div>
                            <div className="flex items-center gap-2">
                              {a.reward ? (
                                <button
                                  type="button"
                                  className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
                                  onClick={() => updateAchievement(a.id, { reward: undefined })}
                                >
                                  Remove Reward
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
                                  onClick={() => updateAchievement(a.id, { reward: {} })}
                                >
                                  Add Reward
                                </button>
                              )}
                            </div>
                          </div>

                          {a.reward && (
                            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <div className="space-y-2">
                                <label className="block text-xs font-medium text-gray-600">XP</label>
                                <input
                                  type="number"
                                  className="w-full rounded border px-3 py-2 text-sm"
                                  value={a.reward.xp ?? ""}
                                  onChange={(e) =>
                                    updateAchievement(a.id, {
                                      reward: { ...a.reward, xp: e.target.value.trim() === "" ? undefined : safeNumber(e.target.value, 0) },
                                    })
                                  }
                                  placeholder="(none)"
                                />
                              </div>

                              <div className="space-y-2">
                                <label className="block text-xs font-medium text-gray-600">Gold</label>
                                <input
                                  type="number"
                                  className="w-full rounded border px-3 py-2 text-sm"
                                  value={a.reward.gold ?? ""}
                                  onChange={(e) =>
                                    updateAchievement(a.id, {
                                      reward: { ...a.reward, gold: e.target.value.trim() === "" ? undefined : safeNumber(e.target.value, 0) },
                                    })
                                  }
                                  placeholder="(none)"
                                />
                              </div>

                              <div className="space-y-2">
                                <label className="block text-xs font-medium text-gray-600">Item ID</label>
                                <input
                                  className="w-full rounded border px-3 py-2 text-sm font-mono"
                                  value={a.reward.itemId ?? ""}
                                  onChange={(e) => updateAchievement(a.id, { reward: { ...a.reward, itemId: e.target.value || undefined } })}
                                  placeholder="shop item id"
                                />
                              </div>

                              <div className="space-y-2">
                                <label className="block text-xs font-medium text-gray-600">Quantity</label>
                                <input
                                  type="number"
                                  className="w-full rounded border px-3 py-2 text-sm"
                                  value={a.reward.quantity ?? ""}
                                  onChange={(e) =>
                                    updateAchievement(a.id, {
                                      reward: { ...a.reward, quantity: e.target.value.trim() === "" ? undefined : safeNumber(e.target.value, 1) },
                                    })
                                  }
                                  placeholder="(none)"
                                />
                              </div>

                              <div className="space-y-2">
                                <label className="block text-xs font-medium text-gray-600">Role ID</label>
                                <input
                                  className="w-full rounded border px-3 py-2 text-sm font-mono"
                                  value={a.reward.roleId ?? ""}
                                  onChange={(e) => updateAchievement(a.id, { reward: { ...a.reward, roleId: e.target.value || undefined } })}
                                  placeholder="discord role id"
                                />
                              </div>

                              <div className="space-y-2">
                                <label className="block text-xs font-medium text-gray-600">Channel ID</label>
                                <input
                                  className="w-full rounded border px-3 py-2 text-sm font-mono"
                                  value={a.reward.channelId ?? ""}
                                  onChange={(e) => updateAchievement(a.id, { reward: { ...a.reward, channelId: e.target.value || undefined } })}
                                  placeholder="discord channel id"
                                />
                              </div>

                              <div className="space-y-2 sm:col-span-2">
                                <label className="block text-xs font-medium text-gray-600">Message</label>
                                <input
                                  className="w-full rounded border px-3 py-2 text-sm"
                                  value={a.reward.message ?? ""}
                                  onChange={(e) => updateAchievement(a.id, { reward: { ...a.reward, message: e.target.value || undefined } })}
                                  placeholder="message to send on unlock"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Overrides */}
                        <div className="rounded border p-3">
                          <div className="text-sm font-semibold">Overrides</div>

                          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-gray-600">overrideChannelId</label>
                              <div className="flex items-center gap-2">
                                <input
                                  className="w-full rounded border px-3 py-2 text-sm font-mono"
                                  value={a.overrideChannelId ?? ""}
                                  onChange={(e) => updateAchievement(a.id, { overrideChannelId: e.target.value.trim() || null })}
                                  placeholder="(blank = null)"
                                />
                                <button
                                  type="button"
                                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                                  onClick={() => updateAchievement(a.id, { overrideChannelId: null })}
                                >
                                  Null
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="block text-xs font-medium text-gray-600">overrideAnnouncement</label>
                              <div className="flex items-center gap-2">
                                <input
                                  className="w-full rounded border px-3 py-2 text-sm"
                                  value={a.overrideAnnouncement ?? ""}
                                  onChange={(e) => updateAchievement(a.id, { overrideAnnouncement: e.target.value || null })}
                                  placeholder="(blank = null)"
                                />
                                <button
                                  type="button"
                                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                                  onClick={() => updateAchievement(a.id, { overrideAnnouncement: null })}
                                >
                                  Null
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
                            onClick={() => deleteAchievement(a.id)}
                          >
                            <Trash2 size={16} />
                            Delete Achievement
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
