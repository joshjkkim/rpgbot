"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

export interface QuestConfig {
    id: string;
    name: string;
    description: string;
    conditions: QuestCondition;
    reward?: QuestReward;
    active: boolean;
    cooldown: number;
    overrideChannelId?: string | null;
    overrideAnnouncement?: string | null;
}

export type QuestConditionType = "messages" | "vcMinutes" | "spendGold" | "earnXp" | "dailyClaim";

export type QuestCondition =
  | { type: "messages"; target: number; channelIds?: string[] }
  | { type: "vcMinutes"; target: number; channelIds?: string[] }
  | { type: "spendGold"; target: number }
  | { type: "earnXp"; target: number }
  | { type: "dailyClaim"; target: number };

export interface QuestReward {
    xp?: number;
    gold?: number;
    itemId?: string;
    quantity?: number;
    roleId?: string;
    message?: string;
    channelId?: string;
}

export type QuestsConfig = {
    enabled?: boolean;
    replyMessage?: boolean;
    dmUser?: boolean;
    quests?: Record<string, QuestConfig>;
};

type Props = {
    value: QuestsConfig | null | undefined;
    onChange: (next: QuestsConfig) => void;
};

type NewQuestDraft = {
    id: string;
    name: string;
    description: string;
    conditionType: QuestConditionType;
    conditionTarget: number;
    conditionChannelIds: string;
    active: boolean;
    cooldown: number;
};

function normalizeId(id: string) {
    return id.trim();
}

function isValidId(id: string) {
    return /^[a-zA-Z0-9_-]{2,40}$/.test(id);
}

function safeNumber(s: string, fallback: number) {
    const n = Number(s);
    return Number.isFinite(n) ? n : fallback;
}

function toCsv(ids?: string[]) {
    return (ids ?? []).join(", ");
}

function fromCsv(s: string) {
    return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function buildCondition(
    type: QuestConditionType,
    target: number,
    channelIdsCsv: string
): QuestCondition {
    const channelIds = fromCsv(channelIdsCsv);
    if (type === "messages" || type === "vcMinutes") {
        return { type, target, channelIds: channelIds.length ? channelIds : undefined };
    }
    return { type, target } as QuestCondition;
}

const CONDITION_LABELS: Record<QuestConditionType, string> = {
    messages: "Messages Sent",
    vcMinutes: "VC Minutes",
    spendGold: "Gold Spent",
    earnXp: "XP Earned",
    dailyClaim: "Daily Claims",
};

export default function QuestsBasicEditor({ value, onChange }: Props) {
    const cfg = value ?? {};
    const [local, setLocal] = useState<QuestsConfig>(cfg);
    const [expanded, setExpanded] = useState({ general: true, quests: true });
    const [openQuestId, setOpenQuestId] = useState<string | null>(null);
    const [newQuest, setNewQuest] = useState<NewQuestDraft | null>(null);
    const [createError, setCreateError] = useState<string | null>(null);

    const localQuests = local.quests ?? {};

    const sortedQuests = useMemo(() => {
        return Object.values(localQuests).sort((a, b) => a.name.localeCompare(b.name));
    }, [localQuests]);

    function commit(next: QuestsConfig) {
        setLocal(next);
        onChange(next);
    }

    function upsertQuest(quest: QuestConfig) {
        const next = { ...(local.quests ?? {}) };
        next[quest.id] = quest;
        commit({ ...local, quests: next });
    }

    function deleteQuest(id: string) {
        const next = { ...(local.quests ?? {}) };
        delete next[id];
        commit({ ...local, quests: next });
        if (openQuestId === id) setOpenQuestId(null);
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
                <SectionHeader title="Quests — General" section="general" />
                {expanded.general && (
                    <div className="mt-4 space-y-3">
                        <label className="flex items-center gap-3 text-sm">
                            <input
                                type="checkbox"
                                checked={!!local.enabled}
                                onChange={(e) => commit({ ...local, enabled: e.target.checked })}
                            />
                            <span className="font-medium">Enabled</span>
                        </label>

                        <label className="flex items-center gap-3 text-sm">
                            <input
                                type="checkbox"
                                checked={!!local.replyMessage}
                                onChange={(e) => commit({ ...local, replyMessage: e.target.checked })}
                            />
                            <span className="font-medium">Reply in channel upon completion</span>
                        </label>

                        <label className="flex items-center gap-3 text-sm">
                            <input
                                type="checkbox"
                                checked={!!local.dmUser}
                                onChange={(e) => commit({ ...local, dmUser: e.target.checked })}
                            />
                            <span className="font-medium">Dm User upon completion</span>
                        </label>
                    </div>
                )}
            </div>

            {/* QUESTS */}
            <div className="rounded-lg border p-4">
                <SectionHeader
                    title="Quests"
                    section="quests"
                    right={
                        <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-gray-50"
                            onClick={() => {
                                setCreateError(null);
                                setNewQuest({
                                    id: "",
                                    name: "New Quest",
                                    description: "",
                                    conditionType: "messages",
                                    conditionTarget: 10,
                                    conditionChannelIds: "",
                                    active: true,
                                    cooldown: 86400,
                                });
                                setExpanded((p) => ({ ...p, quests: true }));
                            }}
                        >
                            <Plus size={16} />
                            Add
                        </button>
                    }
                />

                {expanded.quests && (
                    <div className="mt-4 space-y-3">
                        {/* CREATE FORM */}
                        {newQuest && (
                            <div className="rounded border p-3">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-semibold">Create Quest</div>
                                    <button
                                        type="button"
                                        className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
                                        onClick={() => { setNewQuest(null); setCreateError(null); }}
                                    >
                                        Cancel
                                    </button>
                                </div>

                                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="space-y-2 sm:col-span-2">
                                        <label className="block text-sm font-medium">Quest ID (set once)</label>
                                        <input
                                            className="w-full rounded border px-3 py-2 text-sm font-mono"
                                            value={newQuest.id}
                                            onChange={(e) => setNewQuest({ ...newQuest, id: e.target.value })}
                                            placeholder="e.g. daily_chatter, big_spender"
                                        />
                                        <p className="text-xs text-gray-500">
                                            Allowed: letters, numbers, <span className="font-mono">_</span> or <span className="font-mono">-</span>. Can't be changed later.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium">Name</label>
                                        <input
                                            className="w-full rounded border px-3 py-2 text-sm"
                                            value={newQuest.name}
                                            onChange={(e) => setNewQuest({ ...newQuest, name: e.target.value })}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium">Condition Type</label>
                                        <select
                                            className="w-full rounded border px-3 py-2 text-sm"
                                            value={newQuest.conditionType}
                                            onChange={(e) => setNewQuest({ ...newQuest, conditionType: e.target.value as QuestConditionType })}
                                        >
                                            {(Object.keys(CONDITION_LABELS) as QuestConditionType[]).map((t) => (
                                                <option key={t} value={t}>{CONDITION_LABELS[t]}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium">Target</label>
                                        <input
                                            type="number"
                                            className="w-full rounded border px-3 py-2 text-sm"
                                            value={newQuest.conditionTarget}
                                            onChange={(e) => setNewQuest({ ...newQuest, conditionTarget: safeNumber(e.target.value, 1) })}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="block text-sm font-medium">Cooldown (seconds)</label>
                                        <input
                                            type="number"
                                            className="w-full rounded border px-3 py-2 text-sm"
                                            value={newQuest.cooldown}
                                            onChange={(e) => setNewQuest({ ...newQuest, cooldown: safeNumber(e.target.value, 86400) })}
                                            placeholder="86400 = 1 day"
                                        />
                                    </div>
                                </div>

                                {createError && (
                                    <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{createError}</div>
                                )}

                                <div className="mt-4 flex justify-end">
                                    <button
                                        type="button"
                                        className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:opacity-95"
                                        onClick={() => {
                                            setCreateError(null);
                                            const id = normalizeId(newQuest.id);
                                            if (!id) return setCreateError("Quest ID is required.");
                                            if (!isValidId(id)) return setCreateError("Quest ID must be 2–40 chars: letters/numbers/_/- only.");
                                            if ((local.quests ?? {})[id]) return setCreateError("That quest ID is already taken.");

                                            const quest: QuestConfig = {
                                                id,
                                                name: newQuest.name,
                                                description: newQuest.description,
                                                conditions: buildCondition(newQuest.conditionType, newQuest.conditionTarget, newQuest.conditionChannelIds),
                                                active: newQuest.active,
                                                cooldown: newQuest.cooldown,
                                            };

                                            const next = { ...(local.quests ?? {}) };
                                            next[id] = quest;
                                            commit({ ...local, quests: next });
                                            setNewQuest(null);
                                            setOpenQuestId(id);
                                        }}
                                    >
                                        Create Quest
                                    </button>
                                </div>
                            </div>
                        )}

                        {sortedQuests.length === 0 ? (
                            <div className="rounded border bg-gray-50 p-3 text-sm text-gray-600">
                                No quests yet. Add one to start.
                            </div>
                        ) : (
                            sortedQuests.map((quest) => {
                                const isOpen = openQuestId === quest.id;
                                const cond = quest.conditions;

                                return (
                                    <div key={quest.id} className="rounded border">
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-between px-3 py-3 text-left hover:bg-gray-50"
                                            onClick={() => setOpenQuestId(isOpen ? null : quest.id)}
                                        >
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-base font-semibold">{quest.name}</span>
                                                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                                                        {CONDITION_LABELS[cond.type]} × {cond.target}
                                                    </span>
                                                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${quest.active ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"}`}>
                                                        {quest.active ? "Active" : "Inactive"}
                                                    </span>
                                                </div>
                                                <div className="truncate text-xs text-gray-500">
                                                    id: <span className="font-mono">{quest.id}</span>
                                                    {quest.description ? ` • ${quest.description}` : ""}
                                                </div>
                                            </div>
                                            {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                        </button>

                                        {isOpen && (
                                            <div className="border-t p-3 space-y-6">
                                                {/* Basic */}
                                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                                    <div className="space-y-2">
                                                        <label className="block text-sm font-medium">Name</label>
                                                        <input
                                                            className="w-full rounded border px-3 py-2 text-sm"
                                                            value={quest.name}
                                                            onChange={(e) => upsertQuest({ ...quest, name: e.target.value })}
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="block text-sm font-medium">Cooldown (seconds)</label>
                                                        <input
                                                            type="number"
                                                            className="w-full rounded border px-3 py-2 text-sm"
                                                            value={quest.cooldown}
                                                            onChange={(e) => upsertQuest({ ...quest, cooldown: safeNumber(e.target.value, 86400) })}
                                                            placeholder="86400 = 1 day"
                                                        />
                                                    </div>

                                                    <div className="space-y-2 sm:col-span-2">
                                                        <label className="block text-sm font-medium">Description</label>
                                                        <input
                                                            className="w-full rounded border px-3 py-2 text-sm"
                                                            value={quest.description}
                                                            onChange={(e) => upsertQuest({ ...quest, description: e.target.value })}
                                                            placeholder="Optional"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="block text-sm font-medium">Override Channel ID</label>
                                                        <input
                                                            className="w-full rounded border px-3 py-2 text-sm font-mono"
                                                            value={quest.overrideChannelId ?? ""}
                                                            onChange={(e) => upsertQuest({ ...quest, overrideChannelId: e.target.value || null })}
                                                            placeholder="(optional)"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="block text-sm font-medium">Override Announcement</label>
                                                        <input
                                                            className="w-full rounded border px-3 py-2 text-sm"
                                                            value={quest.overrideAnnouncement ?? ""}
                                                            onChange={(e) => upsertQuest({ ...quest, overrideAnnouncement: e.target.value || null })}
                                                            placeholder="(optional)"
                                                        />
                                                    </div>

                                                    <div className="space-y-2">
                                                        <label className="flex items-center gap-2 text-sm font-medium">
                                                            <input
                                                                type="checkbox"
                                                                checked={quest.active}
                                                                onChange={(e) => upsertQuest({ ...quest, active: e.target.checked })}
                                                            />
                                                            Active
                                                        </label>
                                                        <div className="text-xs text-gray-500">Inactive quests won't be available to users.</div>
                                                    </div>
                                                </div>

                                                {/* Condition */}
                                                <div className="rounded border p-3">
                                                    <div className="text-sm font-semibold mb-3">Condition</div>
                                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                                        <div className="space-y-2">
                                                            <label className="block text-xs font-medium text-gray-600">Type</label>
                                                            <select
                                                                className="w-full rounded border px-3 py-2 text-sm"
                                                                value={cond.type}
                                                                onChange={(e) => {
                                                                    const type = e.target.value as QuestConditionType;
                                                                    upsertQuest({ ...quest, conditions: buildCondition(type, cond.target, "") });
                                                                }}
                                                            >
                                                                {(Object.keys(CONDITION_LABELS) as QuestConditionType[]).map((t) => (
                                                                    <option key={t} value={t}>{CONDITION_LABELS[t]}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div className="space-y-2">
                                                            <label className="block text-xs font-medium text-gray-600">Target</label>
                                                            <input
                                                                type="number"
                                                                className="w-full rounded border px-3 py-2 text-sm"
                                                                value={cond.target}
                                                                onChange={(e) => {
                                                                    const channelIds = "channelIds" in cond ? toCsv(cond.channelIds) : "";
                                                                    upsertQuest({ ...quest, conditions: buildCondition(cond.type, safeNumber(e.target.value, 1), channelIds) });
                                                                }}
                                                            />
                                                        </div>

                                                        {(cond.type === "messages" || cond.type === "vcMinutes") && (
                                                            <div className="space-y-2 sm:col-span-2">
                                                                <label className="block text-xs font-medium text-gray-600">Channel IDs (CSV, optional)</label>
                                                                <input
                                                                    className="w-full rounded border px-3 py-2 text-sm font-mono"
                                                                    value={toCsv(cond.channelIds)}
                                                                    onChange={(e) => {
                                                                        upsertQuest({ ...quest, conditions: buildCondition(cond.type, cond.target, e.target.value) });
                                                                    }}
                                                                    placeholder="123456, 789012 (empty = all channels)"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Reward */}
                                                <div className="rounded border p-3">
                                                    <div className="text-sm font-semibold mb-3">Reward</div>
                                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                                        <div className="space-y-2">
                                                            <label className="block text-xs font-medium text-gray-600">XP</label>
                                                            <input
                                                                type="number"
                                                                className="w-full rounded border px-3 py-2 text-sm"
                                                                value={quest.reward?.xp ?? ""}
                                                                onChange={(e) => {
                                                                    const raw = e.target.value.trim();
                                                                    upsertQuest({ ...quest, reward: { ...quest.reward, xp: raw === "" ? undefined : safeNumber(raw, 0) } });
                                                                }}
                                                                placeholder="(none)"
                                                            />
                                                        </div>

                                                        <div className="space-y-2">
                                                            <label className="block text-xs font-medium text-gray-600">Gold</label>
                                                            <input
                                                                type="number"
                                                                className="w-full rounded border px-3 py-2 text-sm"
                                                                value={quest.reward?.gold ?? ""}
                                                                onChange={(e) => {
                                                                    const raw = e.target.value.trim();
                                                                    upsertQuest({ ...quest, reward: { ...quest.reward, gold: raw === "" ? undefined : safeNumber(raw, 0) } });
                                                                }}
                                                                placeholder="(none)"
                                                            />
                                                        </div>

                                                        <div className="space-y-2">
                                                            <label className="block text-xs font-medium text-gray-600">Item ID</label>
                                                            <input
                                                                className="w-full rounded border px-3 py-2 text-sm font-mono"
                                                                value={quest.reward?.itemId ?? ""}
                                                                onChange={(e) => upsertQuest({ ...quest, reward: { ...quest.reward, itemId: e.target.value || undefined } })}
                                                                placeholder="(none)"
                                                            />
                                                        </div>

                                                        <div className="space-y-2">
                                                            <label className="block text-xs font-medium text-gray-600">Item Quantity</label>
                                                            <input
                                                                type="number"
                                                                className="w-full rounded border px-3 py-2 text-sm"
                                                                value={quest.reward?.quantity ?? ""}
                                                                onChange={(e) => {
                                                                    const raw = e.target.value.trim();
                                                                    upsertQuest({ ...quest, reward: { ...quest.reward, quantity: raw === "" ? undefined : safeNumber(raw, 1) } });
                                                                }}
                                                                placeholder="(none)"
                                                            />
                                                        </div>

                                                        <div className="space-y-2">
                                                            <label className="block text-xs font-medium text-gray-600">Role ID</label>
                                                            <input
                                                                className="w-full rounded border px-3 py-2 text-sm font-mono"
                                                                value={quest.reward?.roleId ?? ""}
                                                                onChange={(e) => upsertQuest({ ...quest, reward: { ...quest.reward, roleId: e.target.value || undefined } })}
                                                                placeholder="(none)"
                                                            />
                                                        </div>

                                                        <div className="space-y-2">
                                                            <label className="block text-xs font-medium text-gray-600">Announce Channel ID</label>
                                                            <input
                                                                className="w-full rounded border px-3 py-2 text-sm font-mono"
                                                                value={quest.reward?.channelId ?? ""}
                                                                onChange={(e) => upsertQuest({ ...quest, reward: { ...quest.reward, channelId: e.target.value || undefined } })}
                                                                placeholder="(optional)"
                                                            />
                                                        </div>

                                                        <div className="space-y-2 sm:col-span-2">
                                                            <label className="block text-xs font-medium text-gray-600">Reward Message</label>
                                                            <input
                                                                className="w-full rounded border px-3 py-2 text-sm"
                                                                value={quest.reward?.message ?? ""}
                                                                onChange={(e) => upsertQuest({ ...quest, reward: { ...quest.reward, message: e.target.value || undefined } })}
                                                                placeholder="e.g. 🎉 {user} completed {quest}!"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex justify-end">
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
                                                        onClick={() => deleteQuest(quest.id)}
                                                    >
                                                        <Trash2 size={16} />
                                                        Delete Quest
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