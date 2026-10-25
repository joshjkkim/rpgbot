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
  TextAreaField,
  TextField,
  Toggle,
} from "@/app/components/ui/form";
import { ContentBrowser, EntryTooltip, idFromName } from "@/app/components/ui/slots";
import { ChannelField, EnemiesField, ItemField, ItemsField, RoleField } from "@/app/components/ui/pickers";
import { AnnouncedOn } from "@/app/components/ui/announcedOn";

export type QuestConditionType = "messages" | "vcMinutes" | "spendGold" | "earnXp" | "dailyClaim" | "defeatEnemies" | "winDuels" | "gatherItems" | "craftItems";

export type QuestCondition =
  | { type: "messages"; target: number; channelIds?: string[] }
  | { type: "vcMinutes"; target: number; channelIds?: string[] }
  | { type: "spendGold"; target: number }
  | { type: "earnXp"; target: number }
  | { type: "dailyClaim"; target: number }
  | { type: "defeatEnemies"; target: number; enemyIds?: string[] }
  | { type: "winDuels"; target: number }
  | { type: "gatherItems"; target: number; itemIds?: string[] }
  | { type: "craftItems"; target: number; itemIds?: string[] };

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
  /** Who gives it, and announces it done (mirrored from havocish/src/types/quest.ts). */
  characterId?: string;
  overrideAnnouncement?: string | null;
  requirements?: Requirements;
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
  /** Shop items, so item fields can be dropdowns. */
  shopItems: Record<string, { name?: string; emoji?: string }>;
  /** Combat enemies, for "defeat enemies" objectives. */
  enemies: Record<string, { name?: string; emoji?: string }>;
  value: QuestsConfig | null | undefined;
  onChange: (next: QuestsConfig) => void;
  /** Skills a requirement can name. */
  skills: SkillOption[];
  /** The server's characters, so a quest can have a giver. */
  characters?: Record<string, { name?: string }>;
};

const CONDITIONS = [
  { value: "messages" as const, label: "Messages sent" },
  { value: "vcMinutes" as const, label: "Minutes in voice" },
  { value: "spendGold" as const, label: "Gold spent" },
  { value: "earnXp" as const, label: "XP earned" },
  { value: "dailyClaim" as const, label: "Daily claims" },
  { value: "defeatEnemies" as const, label: "Enemies defeated" },
  { value: "winDuels" as const, label: "Duels won" },
  { value: "gatherItems" as const, label: "Items gathered" },
  { value: "craftItems" as const, label: "Items crafted" },
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reads configs saved by older editors, of no fixed shape
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reads configs saved by older editors, of no fixed shape
function normalizeQuests(raw: Record<string, any> | undefined): Record<string, QuestConfig> {
  const out: Record<string, QuestConfig> = {};
  for (const [id, quest] of Object.entries(raw ?? {})) {
    out[id] = { ...quest, reward: normalizeRewards(quest?.reward) };
  }
  return out;
}

export default function QuestsBasicEditor({ value, onChange, shopItems, enemies, skills, characters = {} }: Props) {
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
      <Section title="Quests" description="Objectives members can take on and claim.">
        <ContentBrowser<QuestConfig>
          entries={questEntries}
          newLabel="New quest"
          empty="No quests defined yet."
          look={(id, quest) => ({ icon: "📜", label: quest.name || id, faded: quest.active === false })}
          tooltip={(id, quest) => <EntryTooltip title={quest.name || id} colour="var(--gold)" lines={[quest.description, quest.active === false && "Inactive"]} />}
          onCreate={(name) => {
            const id = idFromName(name, Object.keys(local.quests ?? {}));
            upsertQuest({
              id,
              name,
              description: "",
              conditions: { type: "messages", target: 10 },
              reward: {},
              active: true,
              cooldown: 86400,
            });
            return id;
          }}
          onRemove={(id) => {
            const next = { ...(local.quests ?? {}) };
            delete next[id];
            updateRoot({ quests: next });
          }}
          renderItem={(id, quest) => {
            const rewards = quest.reward ?? {};
            const rewardKeys = Object.keys(rewards).map(Number).sort((a, b) => a - b);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each condition type has its own fields
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
                  <SelectField
                    label="Quest giver"
                    value={quest.characterId ?? ""}
                    options={[{ value: "", label: "Nobody: the announcer" }, ...Object.entries(characters).map(([id, c]) => ({ value: id, label: c.name || id }))]}
                    onChange={(id) => upsertQuest({ ...quest, characterId: id || undefined })}
                    hint="Announces the quest done, in their name. Make characters on the Characters page."
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
                  {condition.type === "defeatEnemies" && (
                    <EnemiesField
                      wide
                      label="Which enemies"
                      enemies={enemies}
                      value={condition.enemyIds ?? []}
                      onChange={(ids) =>
                        upsertQuest({ ...quest, conditions: { ...condition, enemyIds: ids.length ? ids : undefined } })
                      }
                    />
                  )}
                  {(condition.type === "gatherItems" || condition.type === "craftItems") && (
                    <ItemsField
                      wide
                      label="Which items"
                      items={shopItems}
                      value={condition.itemIds ?? []}
                      onChange={(ids) =>
                        upsertQuest({ ...quest, conditions: { ...condition, itemIds: ids.length ? ids : undefined } })
                      }
                    />
                  )}
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

                  <ChannelField
                    label="Override channel"
                    value={quest.overrideChannelId ?? ""}
                    onChange={(v) => upsertQuest({ ...quest, overrideChannelId: v.trim() || null })}
                    emptyLabel="Announce channel (default)"
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

                <RequirementsField
                  items={shopItems}
                  value={quest.requirements}
                  onChange={(next) => upsertQuest({ ...quest, requirements: next })}
                  skills={skills}
                  hint="Who can take this quest on. Everything set here must be met."
                />

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
                              label="Combat XP"
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
                            <ItemField items={shopItems}
                              label="Item"
                              value={reward.itemId ?? ""}
                              onChange={(v) => patch({ itemId: v || undefined })}
                              emptyLabel="Choose an item"
                            />
                            <NumberField
                              label="Quantity"
                              value={reward.quantity ?? 1}
                              min={1}
                              onChange={(v) => patch({ quantity: v })}
                            />
                            <RoleField
                              label="Role"
                              value={reward.roleId ?? ""}
                              onChange={(v) => patch({ roleId: v || undefined })}
                            />
                            <ChannelField
                              label="Message channel"
                              value={reward.channelId ?? ""}
                              onChange={(v) => patch({ channelId: v || undefined })}
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

      <Section title="General" description="Whether quests run, and how completions are told to members." defaultOpen={!local.enabled}>
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
          <AnnouncedOn what="completed quests" />
        </div>
      </Section>

    </div>
  );
}
