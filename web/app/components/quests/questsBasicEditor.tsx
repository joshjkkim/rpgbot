"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Field,
  FieldGrid,
  KeyedList,
  NumberField,
  Section,
  SelectField,
  TextAreaField,
  TextField,
  Toggle,
} from "@/app/components/ui/form";

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

export interface QuestConfig {
  id: string;
  name: string;
  description: string;
  conditions: QuestCondition;
  // Keyed by index, matching the bot: applyQuestRewards() does Object.values()
  // over this, and /config-quests addresses entries by reward-id.
  reward?: Record<number, QuestReward>;
  active: boolean;
  cooldown: number;
  overrideChannelId?: string | null;
  overrideAnnouncement?: string | null;
}

export type QuestsConfig = {
  enabled?: boolean;
  replyMessage?: boolean;
  dmUser?: boolean;
  announceAllId?: string | null;
  announceMessage?: string | null;
  quests?: Record<string, QuestConfig>;
};

type Props = {
  value: QuestsConfig | null | undefined;
  onChange: (next: QuestsConfig) => void;
};

const CONDITIONS = [
  { value: "messages" as const, label: "Messages sent" },
  { value: "vcMinutes" as const, label: "Minutes in voice" },
  { value: "spendGold" as const, label: "Gold spent" },
  { value: "earnXp" as const, label: "XP earned" },
  { value: "dailyClaim" as const, label: "Daily claims" },
];

const CHANNEL_SCOPED: QuestConditionType[] = ["messages", "vcMinutes"];

function toCsv(ids?: string[]) {
  return (ids ?? []).join(", ");
}

function fromCsv(s: string) {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

/**
 * Normalises a quest's rewards to the keyed map the bot reads.
 *
 * This editor used to write a single flat QuestReward. The bot runs
 * Object.values() over whatever it finds, so a flat object yielded its own
 * field values -- plain numbers -- and every reward silently granted nothing.
 * A legacy flat object is folded into index 0.
 */
function normalizeRewards(raw: any): Record<number, QuestReward> {
  if (!raw || typeof raw !== "object") return {};

  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter(Boolean).map((r, i) => [i, r]));
  }

  const values = Object.values(raw);
  const alreadyKeyed = values.length === 0 || values.every((v) => v && typeof v === "object");
  if (alreadyKeyed) return raw as Record<number, QuestReward>;

  return { 0: raw as QuestReward };
}

function normalizeQuests(raw: Record<string, any> | undefined): Record<string, QuestConfig> {
  const out: Record<string, QuestConfig> = {};
  for (const [id, quest] of Object.entries(raw ?? {})) {
    out[id] = { ...quest, reward: normalizeRewards(quest?.reward) };
  }
  return out;
}

export default function QuestsBasicEditor({ value, onChange }: Props) {
  const [local, setLocal] = useState<QuestsConfig>(() => ({
    ...(value ?? {}),
    quests: normalizeQuests(value?.quests),
  }));

  // The old editor never resynced, so a save (which refetches) left the form
  // showing pre-save state.
  useEffect(() => {
    setLocal({ ...(value ?? {}), quests: normalizeQuests(value?.quests) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  function commit(next: QuestsConfig) {
    setLocal(next);
    onChange(next);
  }

  function updateRoot(patch: Partial<QuestsConfig>) {
    commit({ ...local, ...patch });
  }

  function upsertQuest(quest: QuestConfig) {
    commit({ ...local, quests: { ...(local.quests ?? {}), [quest.id]: quest } });
  }

  function setRewards(quest: QuestConfig, rewards: Record<number, QuestReward>) {
    upsertQuest({ ...quest, reward: rewards });
  }

  const questEntries = useMemo(
    () => Object.entries(local.quests ?? {}).sort((a, b) => a[1].name.localeCompare(b[1].name)),
    [local.quests]
  );

  return (
    <div className="space-y-4">
      <Section title="General" description="Whether quests run, and how completions are told to members.">
        <div className="space-y-3">
          <Toggle
            label="Enable quests"
            checked={!!local.enabled}
            onChange={(v) => updateRoot({ enabled: v })}
          />
          <Toggle
            label="DM on completion"
            checked={!!local.dmUser}
            onChange={(v) => updateRoot({ dmUser: v })}
          />
          <Toggle
            label="Reply in the channel on completion"
            checked={!!local.replyMessage}
            onChange={(v) => updateRoot({ replyMessage: v })}
          />
        </div>

        <div className="mt-4">
          <FieldGrid>
            <TextField
              label="Announce channel ID"
              value={local.announceAllId ?? ""}
              onChange={(v) => updateRoot({ announceAllId: v.trim() || null })}
              placeholder="Leave blank to skip announcing"
              mono
            />
            <TextField
              label="Announce message"
              value={local.announceMessage ?? ""}
              onChange={(v) => updateRoot({ announceMessage: v || null })}
              placeholder="{user} completed {questName}!"
              hint="{user} {questName} {questDescription}"
            />
          </FieldGrid>
        </div>
      </Section>

      <Section title="Quests" description="Objectives members can take on and claim.">
        <KeyedList<QuestConfig>
          entries={questEntries}
          addPlaceholder="Quest ID, e.g. daily-chatter"
          addLabel="Add quest"
          empty="No quests defined yet."
          itemLabel={(id, quest) => quest.name || id}
          onAdd={(rawId) => {
            const id = rawId.trim();
            if (!/^[a-zA-Z0-9_-]{2,40}$/.test(id)) return;
            if ((local.quests ?? {})[id]) return;
            upsertQuest({
              id,
              name: id,
              description: "",
              conditions: { type: "messages", target: 10 },
              reward: {},
              active: true,
              cooldown: 86400,
            });
          }}
          onRemove={(id) => {
            const next = { ...(local.quests ?? {}) };
            delete next[id];
            updateRoot({ quests: next });
          }}
          renderItem={(id, quest) => {
            const rewards = quest.reward ?? {};
            const rewardKeys = Object.keys(rewards).map(Number).sort((a, b) => a - b);
            const condition: any = quest.conditions ?? { type: "messages", target: 0 };

            return (
              <div className="space-y-4">
                <FieldGrid>
                  <TextField
                    label="Name"
                    value={quest.name}
                    onChange={(v) => upsertQuest({ ...quest, name: v })}
                  />
                  <NumberField
                    label="Cooldown (seconds)"
                    value={quest.cooldown ?? 0}
                    min={0}
                    onChange={(v) => upsertQuest({ ...quest, cooldown: v })}
                    hint="How long before it can be taken again."
                  />
                  <TextAreaField
                    label="Description"
                    value={quest.description ?? ""}
                    onChange={(v) => upsertQuest({ ...quest, description: v })}
                    rows={2}
                  />
                </FieldGrid>

                <Toggle
                  label="Active"
                  checked={quest.active !== false}
                  onChange={(v) => upsertQuest({ ...quest, active: v })}
                />

                <FieldGrid>
                  <SelectField<QuestConditionType>
                    label="Objective"
                    value={condition.type}
                    onChange={(type) =>
                      upsertQuest({
                        ...quest,
                        conditions: { type, target: condition.target ?? 0 } as QuestCondition,
                      })
                    }
                    options={CONDITIONS}
                  />
                  <NumberField
                    label="Target"
                    value={condition.target ?? 0}
                    min={0}
                    onChange={(v) =>
                      upsertQuest({ ...quest, conditions: { ...condition, target: v } })
                    }
                  />
                  {CHANNEL_SCOPED.includes(condition.type) && (
                    <TextField
                      wide
                      label="Limit to channels"
                      value={toCsv(condition.channelIds)}
                      onChange={(v) => {
                        const channelIds = fromCsv(v);
                        upsertQuest({
                          ...quest,
                          conditions: {
                            ...condition,
                            channelIds: channelIds.length ? channelIds : undefined,
                          },
                        });
                      }}
                      placeholder="Comma-separated channel IDs, blank for any"
                      mono
                    />
                  )}

                  <TextField
                    label="Override channel ID"
                    value={quest.overrideChannelId ?? ""}
                    onChange={(v) => upsertQuest({ ...quest, overrideChannelId: v.trim() || null })}
                    placeholder="Defaults to the announce channel"
                    mono
                  />
                  <TextField
                    label="Completion message"
                    value={quest.overrideAnnouncement ?? ""}
                    onChange={(v) =>
                      upsertQuest({ ...quest, overrideAnnouncement: v || null })
                    }
                    placeholder="Sent to the member"
                  />
                </FieldGrid>

                <Field label="Rewards">
                  <div className="space-y-3">
                    {rewardKeys.length === 0 && (
                      <p className="text-xs text-[var(--muted)]">
                        No rewards. Completing this quest gives nothing.
                      </p>
                    )}

                    {rewardKeys.map((key) => {
                      const reward = rewards[key] ?? {};
                      const patch = (p: Partial<QuestReward>) =>
                        setRewards(quest, { ...rewards, [key]: { ...reward, ...p } });

                      return (
                        <div
                          key={key}
                          className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
                        >
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-xs text-[var(--muted)]">Reward {key}</span>
                            <button
                              type="button"
                              aria-label="Remove reward"
                              onClick={() => {
                                const next = { ...rewards };
                                delete next[key];
                                setRewards(quest, next);
                              }}
                              className="text-[var(--muted)] transition-colors hover:text-red-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <FieldGrid>
                            <NumberField
                              label="XP"
                              value={reward.xp ?? 0}
                              min={0}
                              onChange={(v) => patch({ xp: v || undefined })}
                            />
                            <NumberField
                              label="Gold"
                              value={reward.gold ?? 0}
                              min={0}
                              onChange={(v) => patch({ gold: v || undefined })}
                            />
                            <TextField
                              label="Item ID"
                              value={reward.itemId ?? ""}
                              onChange={(v) => patch({ itemId: v || undefined })}
                              placeholder="Must exist in the shop"
                              mono
                            />
                            <NumberField
                              label="Quantity"
                              value={reward.quantity ?? 1}
                              min={1}
                              onChange={(v) => patch({ quantity: v })}
                            />
                            <TextField
                              label="Role ID"
                              value={reward.roleId ?? ""}
                              onChange={(v) => patch({ roleId: v || undefined })}
                              mono
                            />
                            <TextField
                              label="Message channel ID"
                              value={reward.channelId ?? ""}
                              onChange={(v) => patch({ channelId: v || undefined })}
                              mono
                            />
                            <TextField
                              wide
                              label="Message"
                              value={reward.message ?? ""}
                              onChange={(v) => patch({ message: v || undefined })}
                              hint="Sent to the channel above. {user}"
                            />
                          </FieldGrid>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        const nextKey = rewardKeys.length ? Math.max(...rewardKeys) + 1 : 0;
                        setRewards(quest, { ...rewards, [nextKey]: { xp: 0, gold: 0 } });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
                    >
                      <Plus size={14} /> Add reward
                    </button>
                  </div>
                </Field>
              </div>
            );
          }}
        />
      </Section>
    </div>
  );
}
