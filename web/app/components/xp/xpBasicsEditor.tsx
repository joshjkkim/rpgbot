"use client";

import { useEffect, useState } from "react";
import {
  FieldGrid,
  KeyedList,
  NumberField,
  Section,
  TextAreaField,
  TextField,
  Toggle,
} from "@/app/components/ui/form";

type RoleXpConfig = {
  extraXp?: number;
  multiplier?: number;
  cooldownSeconds?: number;
};

type RoleDailyBonusConfig = {
  xpBonus?: number;
  goldBonus?: number;
  multiplier?: number;
};

type RoleTempConfig = {
  defaultDurationMinutes?: number | null;
  hardExpiryat?: string | null; // keep your original casing
};

type StreakReward = {
  streakCount: number;
  xpBonus: number;
  goldBonus: number;
  message: string | null;
  channelId: string | null;
};

type XpChannelConfig = {
  enabled: boolean;
  channelId: string;
  multiplier: number;
  flatBonus: number;
  cooldownOverride?: number;
};

// Voice channel config (mirrors message channel config, but uses minMinutes
// override instead of cooldown). Field names must match the bot's
// xpChannelConfig exactly -- these records are written into the config blob
// as-is, with no per-field mapping, so a name only this file knows is a value
// the bot never reads.
type VcChannelConfig = {
  enabled: boolean;
  channelId: string;
  multiplier: number;
  flatBonus: number;
  minMinutesOverride?: number;
};

// Voice role bonus config (simple + optional multiplier)
type VcRoleBonusConfig = {
  extraXp?: number;
  multiplier?: number;
};

/**
 * Carries voice settings saved under the dashboard's old field names.
 *
 * This editor wrote flatBonusPerMinute and extraXpPerMinute, but the bot reads
 * flatBonus and extraXp (db/activeVC.ts), so anything configured here never
 * affected voice XP. Read the legacy key when the correct one is absent, so a
 * guild's existing numbers start working instead of resetting to zero.
 */
function migrateVcChannels(raw: Record<string, any>): Record<string, VcChannelConfig> {
  const out: Record<string, VcChannelConfig> = {};
  for (const [id, cfg] of Object.entries(raw ?? {})) {
    const { flatBonusPerMinute, ...rest } = cfg ?? {};
    out[id] = { ...rest, flatBonus: cfg?.flatBonus ?? flatBonusPerMinute ?? 0 };
  }
  return out;
}

function migrateVcRoles(raw: Record<string, any>): Record<string, VcRoleBonusConfig> {
  const out: Record<string, VcRoleBonusConfig> = {};
  for (const [id, cfg] of Object.entries(raw ?? {})) {
    const { extraXpPerMinute, ...rest } = cfg ?? {};
    const extraXp = cfg?.extraXp ?? extraXpPerMinute;
    out[id] = { ...rest, ...(extraXp !== undefined && { extraXp }) };
  }
  return out;
}

const DEFAULT_DAILY_REPLY =
  "You have claimed your daily reward of {xp} {xpName} {xpIcon} and {gold} {goldName} {goldIcon}! Your current streak is {streak} days.";
const DEFAULT_DAILY_ANNOUNCE =
  "🎉 {user}, you have received your daily reward of {xp} {xpName} {xpIcon} and {gold} {goldName} {goldIcon}!";
const DEFAULT_STREAK_ANNOUNCE =
  "🔥 {user}, you are on a {streak}-day streak! You've earned a bonus of {xp} XP and {gold} gold!";

type Props = {
  value: any;
  onChange: (nextXp: any) => void;
};

export default function XpBasicsEditor({ value, onChange }: Props) {
  const xp = value ?? {};

  const read = (src: any) => ({
    basePerMessage: src.basePerMessage ?? 5,
    xpMessageCooldown: src.xpMessageCooldown ?? 60,
    xpChannelIds: (src.xpChannelIds ?? {}) as Record<string, XpChannelConfig>,

    dailyXp: src.dailyXp ?? 50,
    dailyGold: src.dailyGold ?? 20,
    autoDailyEnabled: src.autoDailyEnabled ?? false,
    replyToDailyInChannel: src.replyToDailyInChannel ?? true,
    replyToDailyEphemeral: src.replyToDailyEphemeral ?? true,
    replyToDailyMessage: src.replyToDailyMessage ?? DEFAULT_DAILY_REPLY,
    announceDailyInChannelId: src.announceDailyInChannelId ?? null,
    announceDailyMessage: src.announceDailyMessage ?? DEFAULT_DAILY_ANNOUNCE,

    streakMultiplier: src.streakMultiplier ?? 0.1,
    streakAnnounceChannelId: src.streakAnnounceChannelId ?? null,
    streakAnnounceMessage: src.streakAnnounceMessage ?? DEFAULT_STREAK_ANNOUNCE,
    streakRewards: (src.streakRewards ?? {}) as Record<string, StreakReward>,

    roleXp: (src.roleXp ?? {}) as Record<string, RoleXpConfig>,
    roleDailyBonus: (src.roleDailyBonus ?? {}) as Record<string, RoleDailyBonusConfig>,
    roleTemp: (src.roleTemp ?? {}) as Record<string, RoleTempConfig>,

    vcEnabled: src.vc?.enabled ?? false,
    vcBasePerMinute: src.vc?.basePerMinute ?? 2,
    vcMinMinutesForXp: src.vc?.minMinutesForXp ?? 0,
    vcChannelIds: migrateVcChannels(src.vc?.channelIds ?? {}),
    vcRoleXpBonus: migrateVcRoles(src.vc?.roleXpBonus ?? {}),
  });

  const [form, setForm] = useState(() => read(xp));

  useEffect(() => {
    setForm(read(value ?? {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  function commit(partial: Partial<typeof form>) {
    const next = { ...form, ...partial };
    setForm(next);

    onChange({
      ...xp,
      basePerMessage: next.basePerMessage,
      xpMessageCooldown: next.xpMessageCooldown,
      xpChannelIds: next.xpChannelIds,

      dailyXp: next.dailyXp,
      dailyGold: next.dailyGold,
      autoDailyEnabled: next.autoDailyEnabled,
      replyToDailyInChannel: next.replyToDailyInChannel,
      replyToDailyEphemeral: next.replyToDailyEphemeral,
      replyToDailyMessage: next.replyToDailyMessage,
      announceDailyInChannelId: next.announceDailyInChannelId,
      announceDailyMessage: next.announceDailyMessage,

      streakMultiplier: next.streakMultiplier,
      streakAnnounceChannelId: next.streakAnnounceChannelId,
      streakAnnounceMessage: next.streakAnnounceMessage,
      streakRewards: next.streakRewards,

      roleXp: next.roleXp,
      roleDailyBonus: next.roleDailyBonus,
      roleTemp: next.roleTemp,

      vc: {
        ...(xp.vc ?? {}),
        enabled: next.vcEnabled,
        basePerMinute: next.vcBasePerMinute,
        minMinutesForXp: next.vcMinMinutesForXp,
        channelIds: next.vcChannelIds,
        roleXpBonus: next.vcRoleXpBonus,
      },
    });
  }

  /** Replaces one entry in a keyed map without disturbing the rest. */
  function patchMap<K extends keyof typeof form, V>(key: K, id: string, patch: Partial<V>) {
    const map = form[key] as Record<string, V>;
    commit({ [key]: { ...map, [id]: { ...map[id], ...patch } } } as Partial<typeof form>);
  }

  function removeFromMap<K extends keyof typeof form>(key: K, id: string) {
    const map = { ...(form[key] as Record<string, unknown>) };
    delete map[id];
    commit({ [key]: map } as Partial<typeof form>);
  }

  const sortedByNumber = (a: [string, unknown], b: [string, unknown]) => Number(a[0]) - Number(b[0]);

  return (
    <div className="space-y-4">
      <Section title="Message XP" description="What a message is worth, and how often it can pay out.">
        <FieldGrid>
          <NumberField
            label="Base XP per message"
            value={form.basePerMessage}
            onChange={(v) => commit({ basePerMessage: v })}
            min={0}
          />
          <NumberField
            label="Cooldown (seconds)"
            value={form.xpMessageCooldown}
            onChange={(v) => commit({ xpMessageCooldown: v })}
            min={0}
            hint="Messages inside this window earn nothing."
          />
        </FieldGrid>
      </Section>

      <Section
        title="Channel overrides"
        description="Per-channel multipliers, bonuses and cooldowns for message XP."
        defaultOpen={false}
      >
        <KeyedList<XpChannelConfig>
          entries={Object.entries(form.xpChannelIds)}
          addPlaceholder="Channel ID"
          addLabel="Add channel"
          empty="No channel overrides. Every channel uses the base rate."
          onAdd={(channelId) =>
            commit({
              xpChannelIds: {
                ...form.xpChannelIds,
                [channelId]: { enabled: true, channelId, multiplier: 1, flatBonus: 0 },
              },
            })
          }
          onRemove={(id) => removeFromMap("xpChannelIds", id)}
          renderItem={(id, cfg) => (
            <div className="space-y-3">
              <Toggle
                label="Earns XP"
                checked={cfg.enabled !== false}
                onChange={(v) => patchMap<"xpChannelIds", XpChannelConfig>("xpChannelIds", id, { enabled: v })}
              />
              <FieldGrid>
                <NumberField
                  label="Multiplier"
                  value={cfg.multiplier ?? 1}
                  step={0.1}
                  min={0}
                  onChange={(v) => patchMap<"xpChannelIds", XpChannelConfig>("xpChannelIds", id, { multiplier: v })}
                />
                <NumberField
                  label="Flat bonus"
                  value={cfg.flatBonus ?? 0}
                  min={0}
                  onChange={(v) => patchMap<"xpChannelIds", XpChannelConfig>("xpChannelIds", id, { flatBonus: v })}
                />
                <NumberField
                  label="Cooldown override (seconds)"
                  value={cfg.cooldownOverride ?? 0}
                  min={0}
                  onChange={(v) =>
                    patchMap<"xpChannelIds", XpChannelConfig>("xpChannelIds", id, { cooldownOverride: v })
                  }
                  hint="0 uses the global cooldown."
                />
              </FieldGrid>
            </div>
          )}
        />
      </Section>

      <Section title="Daily reward" description="What /daily pays out, and where it is announced.">
        <FieldGrid>
          <NumberField
            label="Daily XP"
            value={form.dailyXp}
            onChange={(v) => commit({ dailyXp: v })}
            min={0}
          />
          <NumberField
            label="Daily gold"
            value={form.dailyGold}
            onChange={(v) => commit({ dailyGold: v })}
            min={0}
          />
        </FieldGrid>

        <div className="mt-4 space-y-3">
          <Toggle
            label="Claim automatically on first message"
            checked={form.autoDailyEnabled}
            onChange={(v) => commit({ autoDailyEnabled: v })}
            hint="Members get their daily without running the command."
          />
          <Toggle
            label="Reply in the channel"
            checked={form.replyToDailyInChannel}
            onChange={(v) => commit({ replyToDailyInChannel: v })}
          />
          <Toggle
            label="Keep the reply private"
            checked={form.replyToDailyEphemeral}
            onChange={(v) => commit({ replyToDailyEphemeral: v })}
            hint="Only the claimer sees the /daily response."
          />
        </div>

        <div className="mt-4">
          <FieldGrid>
            <TextAreaField
              label="Reply message"
              value={form.replyToDailyMessage}
              onChange={(v) => commit({ replyToDailyMessage: v })}
              rows={2}
              hint="{user} {xp} {gold} {xpName} {xpIcon} {goldName} {goldIcon} {streak}"
            />
            <TextField
              label="Announce channel ID"
              value={form.announceDailyInChannelId ?? ""}
              onChange={(v) => commit({ announceDailyInChannelId: v || null })}
              placeholder="Leave blank to skip announcing"
              mono
            />
            <TextAreaField
              label="Announce message"
              value={form.announceDailyMessage}
              onChange={(v) => commit({ announceDailyMessage: v })}
              rows={2}
            />
          </FieldGrid>
        </div>
      </Section>

      <Section title="Streaks" description="The bonus for claiming daily rewards on consecutive days." defaultOpen={false}>
        <FieldGrid>
          <NumberField
            label="Streak multiplier"
            value={form.streakMultiplier}
            step={0.01}
            min={0}
            onChange={(v) => commit({ streakMultiplier: v })}
            hint="Added per streak day — 0.1 is +10% a day."
          />
          <TextField
            label="Announce channel ID"
            value={form.streakAnnounceChannelId ?? ""}
            onChange={(v) => commit({ streakAnnounceChannelId: v || null })}
            placeholder="Optional"
            mono
          />
          <TextAreaField
            label="Announce message"
            value={form.streakAnnounceMessage}
            onChange={(v) => commit({ streakAnnounceMessage: v })}
            rows={2}
            hint="{user} {streak} {xp} {gold}"
          />
        </FieldGrid>
      </Section>

      <Section title="Streak milestones" description="One-off rewards at specific streak lengths." defaultOpen={false}>
        <KeyedList<StreakReward>
          entries={Object.entries(form.streakRewards).sort(sortedByNumber)}
          addPlaceholder="Day count, e.g. 7"
          addLabel="Add milestone"
          empty="No milestones. Streaks still apply the multiplier above."
          itemLabel={(count) => `${count}-day streak`}
          onAdd={(raw) => {
            const count = Number(raw);
            if (!Number.isFinite(count) || count <= 0) return;
            commit({
              streakRewards: {
                ...form.streakRewards,
                [count]: {
                  streakCount: count,
                  xpBonus: 100,
                  goldBonus: 50,
                  message: null,
                  channelId: null,
                },
              },
            });
          }}
          onRemove={(id) => removeFromMap("streakRewards", id)}
          renderItem={(id, reward) => (
            <FieldGrid>
              <NumberField
                label="XP bonus"
                value={reward.xpBonus ?? 0}
                min={0}
                onChange={(v) => patchMap<"streakRewards", StreakReward>("streakRewards", id, { xpBonus: v })}
              />
              <NumberField
                label="Gold bonus"
                value={reward.goldBonus ?? 0}
                min={0}
                onChange={(v) => patchMap<"streakRewards", StreakReward>("streakRewards", id, { goldBonus: v })}
              />
              <TextField
                label="Channel ID"
                value={reward.channelId ?? ""}
                onChange={(v) =>
                  patchMap<"streakRewards", StreakReward>("streakRewards", id, { channelId: v || null })
                }
                placeholder="Defaults to the streak channel"
                mono
              />
              <TextField
                label="Custom message"
                value={reward.message ?? ""}
                onChange={(v) =>
                  patchMap<"streakRewards", StreakReward>("streakRewards", id, { message: v || null })
                }
                placeholder="Optional"
              />
            </FieldGrid>
          )}
        />
      </Section>

      <Section title="Role XP bonuses" description="Extra message XP for members holding a role." defaultOpen={false}>
        <KeyedList<RoleXpConfig>
          entries={Object.entries(form.roleXp)}
          addPlaceholder="Role ID"
          addLabel="Add role"
          empty="No role bonuses configured."
          onAdd={(roleId) =>
            commit({ roleXp: { ...form.roleXp, [roleId]: { extraXp: 0, multiplier: 1 } } })
          }
          onRemove={(id) => removeFromMap("roleXp", id)}
          renderItem={(id, cfg) => (
            <FieldGrid>
              <NumberField
                label="Extra XP"
                value={cfg.extraXp ?? 0}
                min={0}
                onChange={(v) => patchMap<"roleXp", RoleXpConfig>("roleXp", id, { extraXp: v })}
              />
              <NumberField
                label="Multiplier"
                value={cfg.multiplier ?? 1}
                step={0.1}
                min={0}
                onChange={(v) => patchMap<"roleXp", RoleXpConfig>("roleXp", id, { multiplier: v })}
              />
              <NumberField
                label="Cooldown (seconds)"
                value={cfg.cooldownSeconds ?? 0}
                min={0}
                onChange={(v) => patchMap<"roleXp", RoleXpConfig>("roleXp", id, { cooldownSeconds: v })}
                hint="The lowest cooldown among a member's roles wins."
              />
            </FieldGrid>
          )}
        />
      </Section>

      <Section title="Role daily bonuses" description="Extra daily reward for members holding a role." defaultOpen={false}>
        <KeyedList<RoleDailyBonusConfig>
          entries={Object.entries(form.roleDailyBonus)}
          addPlaceholder="Role ID"
          addLabel="Add role"
          empty="No role daily bonuses configured."
          onAdd={(roleId) =>
            commit({
              roleDailyBonus: {
                ...form.roleDailyBonus,
                [roleId]: { xpBonus: 0, goldBonus: 0, multiplier: 1 },
              },
            })
          }
          onRemove={(id) => removeFromMap("roleDailyBonus", id)}
          renderItem={(id, cfg) => (
            <FieldGrid>
              <NumberField
                label="XP bonus"
                value={cfg.xpBonus ?? 0}
                min={0}
                onChange={(v) =>
                  patchMap<"roleDailyBonus", RoleDailyBonusConfig>("roleDailyBonus", id, { xpBonus: v })
                }
              />
              <NumberField
                label="Gold bonus"
                value={cfg.goldBonus ?? 0}
                min={0}
                onChange={(v) =>
                  patchMap<"roleDailyBonus", RoleDailyBonusConfig>("roleDailyBonus", id, { goldBonus: v })
                }
              />
              <NumberField
                label="Multiplier"
                value={cfg.multiplier ?? 1}
                step={0.1}
                min={0}
                onChange={(v) =>
                  patchMap<"roleDailyBonus", RoleDailyBonusConfig>("roleDailyBonus", id, { multiplier: v })
                }
              />
            </FieldGrid>
          )}
        />
      </Section>

      <Section title="Temporary roles" description="How long roles granted by items and rewards last." defaultOpen={false}>
        <KeyedList<RoleTempConfig>
          entries={Object.entries(form.roleTemp)}
          addPlaceholder="Role ID"
          addLabel="Add role"
          empty="No temporary roles configured."
          onAdd={(roleId) =>
            commit({
              roleTemp: { ...form.roleTemp, [roleId]: { defaultDurationMinutes: 60, hardExpiryat: null } },
            })
          }
          onRemove={(id) => removeFromMap("roleTemp", id)}
          renderItem={(id, cfg) => (
            <FieldGrid>
              <NumberField
                label="Default duration (minutes)"
                value={cfg.defaultDurationMinutes ?? 0}
                min={0}
                onChange={(v) =>
                  patchMap<"roleTemp", RoleTempConfig>("roleTemp", id, { defaultDurationMinutes: v })
                }
              />
              <TextField
                label="Hard expiry"
                value={cfg.hardExpiryat ?? ""}
                onChange={(v) =>
                  patchMap<"roleTemp", RoleTempConfig>("roleTemp", id, { hardExpiryat: v || null })
                }
                placeholder="ISO timestamp, optional"
                mono
                hint="Removed at this moment regardless of duration."
              />
            </FieldGrid>
          )}
        />
      </Section>

      <Section title="Voice XP" description="XP earned for time spent in voice channels." defaultOpen={false}>
        <Toggle
          label="Enable voice XP"
          checked={form.vcEnabled}
          onChange={(v) => commit({ vcEnabled: v })}
        />
        <div className="mt-4">
          <FieldGrid>
            <NumberField
              label="XP per minute"
              value={form.vcBasePerMinute}
              min={0}
              onChange={(v) => commit({ vcBasePerMinute: v })}
            />
            <NumberField
              label="Minimum minutes"
              value={form.vcMinMinutesForXp}
              min={0}
              onChange={(v) => commit({ vcMinMinutesForXp: v })}
              hint="Sessions shorter than this earn nothing."
            />
          </FieldGrid>
        </div>
      </Section>

      <Section title="Voice channel overrides" description="Per-channel voice rates." defaultOpen={false}>
        <KeyedList<VcChannelConfig>
          entries={Object.entries(form.vcChannelIds)}
          addPlaceholder="Voice channel ID"
          addLabel="Add channel"
          empty="No voice channel overrides."
          onAdd={(channelId) =>
            commit({
              vcChannelIds: {
                ...form.vcChannelIds,
                [channelId]: { enabled: true, channelId, multiplier: 1, flatBonus: 0 },
              },
            })
          }
          onRemove={(id) => removeFromMap("vcChannelIds", id)}
          renderItem={(id, cfg) => (
            <div className="space-y-3">
              <Toggle
                label="Earns XP"
                checked={cfg.enabled !== false}
                onChange={(v) => patchMap<"vcChannelIds", VcChannelConfig>("vcChannelIds", id, { enabled: v })}
              />
              <FieldGrid>
                <NumberField
                  label="Multiplier"
                  value={cfg.multiplier ?? 1}
                  step={0.1}
                  min={0}
                  onChange={(v) => patchMap<"vcChannelIds", VcChannelConfig>("vcChannelIds", id, { multiplier: v })}
                />
                <NumberField
                  label="Flat bonus"
                  value={cfg.flatBonus ?? 0}
                  min={0}
                  onChange={(v) => patchMap<"vcChannelIds", VcChannelConfig>("vcChannelIds", id, { flatBonus: v })}
                />
                <NumberField
                  label="Minimum minutes override"
                  value={cfg.minMinutesOverride ?? 0}
                  min={0}
                  onChange={(v) =>
                    patchMap<"vcChannelIds", VcChannelConfig>("vcChannelIds", id, { minMinutesOverride: v })
                  }
                  hint="0 uses the global minimum."
                />
              </FieldGrid>
            </div>
          )}
        />
      </Section>

      <Section title="Voice role bonuses" description="Extra voice XP for members holding a role." defaultOpen={false}>
        <KeyedList<VcRoleBonusConfig>
          entries={Object.entries(form.vcRoleXpBonus)}
          addPlaceholder="Role ID"
          addLabel="Add role"
          empty="No voice role bonuses configured."
          onAdd={(roleId) =>
            commit({ vcRoleXpBonus: { ...form.vcRoleXpBonus, [roleId]: { extraXp: 0, multiplier: 1 } } })
          }
          onRemove={(id) => removeFromMap("vcRoleXpBonus", id)}
          renderItem={(id, cfg) => (
            <FieldGrid>
              <NumberField
                label="Extra XP"
                value={cfg.extraXp ?? 0}
                min={0}
                onChange={(v) => patchMap<"vcRoleXpBonus", VcRoleBonusConfig>("vcRoleXpBonus", id, { extraXp: v })}
              />
              <NumberField
                label="Multiplier"
                value={cfg.multiplier ?? 1}
                step={0.1}
                min={0}
                onChange={(v) =>
                  patchMap<"vcRoleXpBonus", VcRoleBonusConfig>("vcRoleXpBonus", id, { multiplier: v })
                }
              />
            </FieldGrid>
          )}
        />
      </Section>
    </div>
  );
}
