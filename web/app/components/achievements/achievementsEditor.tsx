"use client";

import { useEffect, useMemo, useState } from "react";
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
  // Flat, unlike quests: player/achievements.ts reads achievement.reward directly.
  reward?: AchievementReward;
  secret?: boolean;
  overrideChannelId?: string | null;
  overrideAnnouncement?: string | null;
}

export type AchievementsConfig = {
  enabled: boolean;
  achievements: Record<string, AchievementConfig>;
  announceAllId: string | null;
  announceMessage: string | null;
};

type Props = {
  value: AchievementsConfig | null | undefined;
  onChange: (next: AchievementsConfig) => void;
};

const CATEGORIES = [
  { value: "xp" as const, label: "XP" },
  { value: "social" as const, label: "Social" },
  { value: "daily" as const, label: "Daily" },
  { value: "economy" as const, label: "Economy" },
  { value: "vc" as const, label: "Voice" },
  { value: "misc" as const, label: "Misc" },
];

const CONDITION_TYPES = [
  { value: "stat" as const, label: "A tracked stat" },
  { value: "level" as const, label: "Level" },
  { value: "xp" as const, label: "Total XP" },
  { value: "gold" as const, label: "Gold held" },
  { value: "streak" as const, label: "Streak" },
];

const OPERATORS = [
  { value: ">=" as const, label: "at least (>=)" },
  { value: ">" as const, label: "more than (>)" },
  { value: "==" as const, label: "exactly (==)" },
  { value: "<=" as const, label: "at most (<=)" },
  { value: "<" as const, label: "less than (<)" },
  { value: "!=" as const, label: "not (!=)" },
];

export default function AchievementsEditor({ value, onChange }: Props) {
  const defaults: AchievementsConfig = useMemo(
    () => ({ enabled: false, achievements: {}, announceAllId: null, announceMessage: null }),
    []
  );

  const [local, setLocal] = useState<AchievementsConfig>(value ?? defaults);

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

  function upsert(achievement: AchievementConfig) {
    commit({
      ...local,
      achievements: { ...(local.achievements ?? {}), [achievement.id]: achievement },
    });
  }

  const entries = useMemo(
    () =>
      Object.entries(local.achievements ?? {}).sort((a, b) =>
        (a[1].name || a[0]).localeCompare(b[1].name || b[0])
      ),
    [local.achievements]
  );

  return (
    <div className="space-y-4">
      <Section title="General" description="Whether achievements run, and where unlocks are announced.">
        <Toggle
          label="Enable achievements"
          checked={!!local.enabled}
          onChange={(v) => updateRoot({ enabled: v })}
        />
        <div className="mt-4">
          <FieldGrid>
            <TextField
              label="Announce channel ID"
              value={local.announceAllId ?? ""}
              onChange={(v) => updateRoot({ announceAllId: v.trim() || null })}
              placeholder="Leave blank to skip announcing"
              mono
            />
            <TextAreaField
              label="Announce message"
              value={local.announceMessage ?? ""}
              onChange={(v) => updateRoot({ announceMessage: v || null })}
              rows={2}
              placeholder="{user} unlocked {achievementName}!"
              hint="{user} {achievementName} {achievementDescription}"
            />
          </FieldGrid>
        </div>
      </Section>

      <Section title="Achievements" description="One-off milestones and what they pay out.">
        <KeyedList<AchievementConfig>
          entries={entries}
          addPlaceholder="Achievement ID, e.g. first-steps"
          addLabel="Add achievement"
          empty="No achievements defined yet."
          itemLabel={(id, a) => a.name || id}
          onAdd={(rawId) => {
            const id = rawId.trim();
            if (!/^[a-zA-Z0-9_-]{2,60}$/.test(id)) return;
            if ((local.achievements ?? {})[id]) return;
            upsert({
              id,
              name: id,
              description: "",
              category: "misc",
              conditions: { type: "level", operator: ">=", value: 5 },
              reward: {},
            });
          }}
          onRemove={(id) => {
            const next = { ...(local.achievements ?? {}) };
            delete next[id];
            updateRoot({ achievements: next });
          }}
          renderItem={(id, a) => {
            const condition = a.conditions ?? { type: "level", operator: ">=", value: 0 };
            const reward = a.reward ?? {};
            const patchReward = (p: Partial<AchievementReward>) =>
              upsert({ ...a, reward: { ...reward, ...p } });

            return (
              <div className="space-y-4">
                <FieldGrid>
                  <TextField label="Name" value={a.name} onChange={(v) => upsert({ ...a, name: v })} />
                  <SelectField
                    label="Category"
                    value={a.category ?? "misc"}
                    onChange={(v) => upsert({ ...a, category: v })}
                    options={CATEGORIES}
                  />
                  <TextAreaField
                    label="Description"
                    value={a.description ?? ""}
                    onChange={(v) => upsert({ ...a, description: v })}
                    rows={2}
                  />
                </FieldGrid>

                <Toggle
                  label="Secret"
                  checked={!!a.secret}
                  onChange={(v) => upsert({ ...a, secret: v })}
                  hint="Hidden from members until it unlocks."
                />

                <Field label="Unlocks when">
                  <FieldGrid>
                    <SelectField
                      value={condition.type}
                      onChange={(type) => upsert({ ...a, conditions: { ...condition, type } })}
                      options={CONDITION_TYPES}
                    />
                    <SelectField
                      value={condition.operator}
                      onChange={(operator) => upsert({ ...a, conditions: { ...condition, operator } })}
                      options={OPERATORS}
                    />
                    {condition.type === "stat" && (
                      <TextField
                        label="Stat key"
                        value={condition.statKey ?? ""}
                        onChange={(v) => upsert({ ...a, conditions: { ...condition, statKey: v } })}
                        placeholder="e.g. messagesSent"
                        mono
                      />
                    )}
                    <NumberField
                      label="Value"
                      value={condition.value ?? 0}
                      onChange={(v) => upsert({ ...a, conditions: { ...condition, value: v } })}
                    />
                  </FieldGrid>
                </Field>

                <Field label="Reward">
                  <FieldGrid>
                    <NumberField
                      label="XP"
                      value={reward.xp ?? 0}
                      min={0}
                      onChange={(v) => patchReward({ xp: v || undefined })}
                    />
                    <NumberField
                      label="Gold"
                      value={reward.gold ?? 0}
                      min={0}
                      onChange={(v) => patchReward({ gold: v || undefined })}
                    />
                    <TextField
                      label="Item ID"
                      value={reward.itemId ?? ""}
                      onChange={(v) => patchReward({ itemId: v || undefined })}
                      placeholder="Must exist in the shop"
                      mono
                    />
                    <NumberField
                      label="Quantity"
                      value={reward.quantity ?? 1}
                      min={1}
                      onChange={(v) => patchReward({ quantity: v })}
                    />
                    <TextField
                      label="Role ID"
                      value={reward.roleId ?? ""}
                      onChange={(v) => patchReward({ roleId: v || undefined })}
                      mono
                    />
                    <TextField
                      label="Message channel ID"
                      value={reward.channelId ?? ""}
                      onChange={(v) => patchReward({ channelId: v || undefined })}
                      mono
                    />
                    <TextField
                      wide
                      label="Message"
                      value={reward.message ?? ""}
                      onChange={(v) => patchReward({ message: v || undefined })}
                      hint="Sent to the channel above. {user}"
                    />
                  </FieldGrid>
                </Field>

                <FieldGrid>
                  <TextField
                    label="Override channel ID"
                    value={a.overrideChannelId ?? ""}
                    onChange={(v) => upsert({ ...a, overrideChannelId: v.trim() || null })}
                    placeholder="Defaults to the announce channel"
                    mono
                  />
                  <TextField
                    label="Override announcement"
                    value={a.overrideAnnouncement ?? ""}
                    onChange={(v) => upsert({ ...a, overrideAnnouncement: v || null })}
                    placeholder="Defaults to the announce message"
                  />
                </FieldGrid>
              </div>
            );
          }}
        />
      </Section>
    </div>
  );
}
