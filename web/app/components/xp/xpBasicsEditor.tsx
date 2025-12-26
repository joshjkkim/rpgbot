"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, ChevronDown, ChevronUp } from "lucide-react";

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

// Voice channel config (mirrors message channel config, but uses minMinutes override instead of cooldown)
type VcChannelConfig = {
  enabled: boolean;
  channelId: string;
  multiplier: number;
  flatBonusPerMinute: number;
  minMinutesOverride?: number;
};

// Voice role bonus config (simple + optional multiplier)
type VcRoleBonusConfig = {
  extraXpPerMinute?: number;
  multiplier?: number;
};

type Props = {
  value: any;
  onChange: (nextXp: any) => void;
};

export default function XpBasicsEditor({ value, onChange }: Props) {
  const xp = value ?? {};

  const [form, setForm] = useState(() => ({
    // Message XP
    basePerMessage: xp.basePerMessage ?? 5,
    xpMessageCooldown: xp.xpMessageCooldown ?? 60,
    xpChannelIds: (xp.xpChannelIds ?? {}) as Record<string, XpChannelConfig>,

    // Daily
    dailyXp: xp.dailyXp ?? 50,
    dailyGold: xp.dailyGold ?? 20,
    autoDailyEnabled: xp.autoDailyEnabled ?? false,
    replyToDailyInChannel: xp.replyToDailyInChannel ?? true,
    replyToDailyEphemeral: xp.replyToDailyEphemeral ?? true,
    replyToDailyMessage:
      xp.replyToDailyMessage ??
      "You have claimed your daily reward of {xp} {xpName} {xpIcon} and {gold} {goldName} {goldIcon}! Your current streak is {streak} days.",
    announceDailyInChannelId: xp.announceDailyInChannelId ?? null,
    announceDailyMessage:
      xp.announceDailyMessage ??
      "🎉 {user}, you have received your daily reward of {xp} {xpName} {xpIcon} and {gold} {goldName} {goldIcon}!",

    // Streak
    streakMultiplier: xp.streakMultiplier ?? 0.1,
    streakAnnounceChannelId: xp.streakAnnounceChannelId ?? null,
    streakAnnounceMessage:
      xp.streakAnnounceMessage ??
      "🔥 {user}, you are on a {streak}-day streak! You've earned a bonus of {xp} XP and {gold} gold!",
    streakRewards: (xp.streakRewards ?? {}) as Record<string, StreakReward>,

    // Role-based
    roleXp: (xp.roleXp ?? {}) as Record<string, RoleXpConfig>,
    roleDailyBonus: (xp.roleDailyBonus ?? {}) as Record<string, RoleDailyBonusConfig>,
    roleTemp: (xp.roleTemp ?? {}) as Record<string, RoleTempConfig>,

    // Voice / VC
    vcEnabled: xp.vc?.enabled ?? false,
    vcBasePerMinute: xp.vc?.basePerMinute ?? 2,
    vcMinMinutesForXp: xp.vc?.minMinutesForXp ?? 0,
    vcChannelIds: (xp.vc?.channelIds ?? {}) as Record<string, VcChannelConfig>,
    vcRoleXpBonus: (xp.vc?.roleXpBonus ?? {}) as Record<string, VcRoleBonusConfig>,
  }));

  const [expandedSections, setExpandedSections] = useState({
    message: true,
    channels: false,
    daily: true,
    streak: false,
    streakRewards: false,
    roleXp: false,
    roleDailyBonus: false,
    roleTemp: false,
    voice: false,
    voiceChannels: false,
    voiceRoles: false,
  });

  useEffect(() => {
    const nextXp = value ?? {};
    setForm({
      basePerMessage: nextXp.basePerMessage ?? 5,
      xpMessageCooldown: nextXp.xpMessageCooldown ?? 60,
      xpChannelIds: nextXp.xpChannelIds ?? {},

      dailyXp: nextXp.dailyXp ?? 50,
      dailyGold: nextXp.dailyGold ?? 20,
      autoDailyEnabled: nextXp.autoDailyEnabled ?? false,
      replyToDailyInChannel: nextXp.replyToDailyInChannel ?? true,
      replyToDailyEphemeral: nextXp.replyToDailyEphemeral ?? true,
      replyToDailyMessage:
        nextXp.replyToDailyMessage ??
        "You have claimed your daily reward of {xp} {xpName} {xpIcon} and {gold} {goldName} {goldIcon}! Your current streak is {streak} days.",
      announceDailyInChannelId: nextXp.announceDailyInChannelId ?? null,
      announceDailyMessage:
        nextXp.announceDailyMessage ??
        "🎉 {user}, you have received your daily reward of {xp} {xpName} {xpIcon} and {gold} {goldName} {goldIcon}!",

      streakMultiplier: nextXp.streakMultiplier ?? 0.1,
      streakAnnounceChannelId: nextXp.streakAnnounceChannelId ?? null,
      streakAnnounceMessage:
        nextXp.streakAnnounceMessage ??
        "🔥 {user}, you are on a {streak}-day streak! You've earned a bonus of {xp} XP and {gold} gold!",
      streakRewards: nextXp.streakRewards ?? {},

      roleXp: nextXp.roleXp ?? {},
      roleDailyBonus: nextXp.roleDailyBonus ?? {},
      roleTemp: nextXp.roleTemp ?? {},

      vcEnabled: nextXp.vc?.enabled ?? false,
      vcBasePerMinute: nextXp.vc?.basePerMinute ?? 2,
      vcMinMinutesForXp: nextXp.vc?.minMinutesForXp ?? 0,
      vcChannelIds: nextXp.vc?.channelIds ?? {},
      vcRoleXpBonus: nextXp.vc?.roleXpBonus ?? {},
    });
  }, [JSON.stringify(value)]);

  function commit(partial: Partial<typeof form>) {
    const next = { ...form, ...partial };
    setForm(next);

    const nextXp = {
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
    };

    onChange(nextXp);
  }

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const SectionHeader = ({
    title,
    section,
  }: {
    title: string;
    section: keyof typeof expandedSections;
  }) => (
    <button
      type="button"
      onClick={() => toggleSection(section)}
      className="flex items-center justify-between w-full text-lg font-semibold py-2 hover:bg-gray-50 rounded px-2"
    >
      <span>{title}</span>
      {expandedSections[section] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
    </button>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Message XP Settings */}
      <div className="border rounded-lg p-4">
        <SectionHeader title="Message XP Settings" section="message" />

        {expandedSections.message && (
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium">Base XP per Message</label>
              <input
                type="number"
                value={form.basePerMessage}
                onChange={(e) => commit({ basePerMessage: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">XP Message Cooldown (seconds)</label>
              <input
                type="number"
                value={form.xpMessageCooldown}
                onChange={(e) => commit({ xpMessageCooldown: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>
        )}
      </div>

      {/* Channel Multipliers */}
      <div className="border rounded-lg p-4">
        <SectionHeader title="Channel XP Configuration" section="channels" />

        {expandedSections.channels && (
          <div className="space-y-4 mt-4">
            <button
              type="button"
              onClick={() => {
                const channelId = prompt("Enter Channel ID:");
                if (channelId) {
                  const newChannels: Record<string, XpChannelConfig> = {
                    ...form.xpChannelIds,
                    [channelId]: {
                      enabled: true,
                      channelId,
                      multiplier: 1.0,
                      flatBonus: 0,
                    },
                  };
                  commit({ xpChannelIds: newChannels });
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              <Plus size={16} /> Add Channel
            </button>

            {Object.entries(form.xpChannelIds).map(([channelId, config]) => (
              <div key={channelId} className="border rounded p-3 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">{channelId}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newChannels = { ...form.xpChannelIds };
                      delete newChannels[channelId];
                      commit({ xpChannelIds: newChannels });
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!config.enabled}
                    onChange={(e) => {
                      const newChannels = {
                        ...form.xpChannelIds,
                        [channelId]: { ...config, enabled: e.target.checked },
                      };
                      commit({ xpChannelIds: newChannels });
                    }}
                    className="w-4 h-4"
                  />
                  <label className="text-sm font-medium">Enabled</label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Multiplier</label>
                    <input
                      type="number"
                      step="0.1"
                      value={config.multiplier ?? 1}
                      onChange={(e) => {
                        const newChannels = {
                          ...form.xpChannelIds,
                          [channelId]: { ...config, multiplier: Number(e.target.value) },
                        };
                        commit({ xpChannelIds: newChannels });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Flat Bonus</label>
                    <input
                      type="number"
                      value={config.flatBonus ?? 0}
                      onChange={(e) => {
                        const newChannels = {
                          ...form.xpChannelIds,
                          [channelId]: { ...config, flatBonus: Number(e.target.value) },
                        };
                        commit({ xpChannelIds: newChannels });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Cooldown Override (seconds)</label>
                  <input
                    type="number"
                    value={config.cooldownOverride ?? ""}
                    placeholder="Leave empty for default"
                    onChange={(e) => {
                      const newChannels = {
                        ...form.xpChannelIds,
                        [channelId]: {
                          ...config,
                          cooldownOverride: e.target.value ? Number(e.target.value) : undefined,
                        },
                      };
                      commit({ xpChannelIds: newChannels });
                    }}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Daily Rewards */}
      <div className="border rounded-lg p-4">
        <SectionHeader title="Daily Rewards" section="daily" />

        {expandedSections.daily && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Daily XP</label>
                <input
                  type="number"
                  value={form.dailyXp}
                  onChange={(e) => commit({ dailyXp: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Daily Gold</label>
                <input
                  type="number"
                  value={form.dailyGold}
                  onChange={(e) => commit({ dailyGold: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={form.autoDailyEnabled}
                  onChange={(e) => commit({ autoDailyEnabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Auto Daily Enabled</span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={form.replyToDailyInChannel}
                  onChange={(e) => commit({ replyToDailyInChannel: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Reply to Daily in Channel</span>
              </label>

              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={form.replyToDailyEphemeral}
                  onChange={(e) => commit({ replyToDailyEphemeral: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Reply to Daily Ephemeral</span>
              </label>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Reply to Daily Message</label>
              <textarea
                value={form.replyToDailyMessage}
                onChange={(e) => commit({ replyToDailyMessage: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border rounded text-sm"
              />
              <p className="text-xs text-gray-500">
                Variables: {"{xp}"}, {"{xpName}"}, {"{xpIcon}"}, {"{gold}"}, {"{goldName}"},{" "}
                {"{goldIcon}"}, {"{streak}"}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Announce Daily in Channel ID</label>
              <input
                type="text"
                value={form.announceDailyInChannelId || ""}
                onChange={(e) => commit({ announceDailyInChannelId: e.target.value || null })}
                placeholder="Channel ID (optional)"
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Announce Daily Message</label>
              <textarea
                value={form.announceDailyMessage}
                onChange={(e) => commit({ announceDailyMessage: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border rounded text-sm"
              />
              <p className="text-xs text-gray-500">
                Variables: {"{user}"}, {"{xp}"}, {"{xpName}"}, {"{xpIcon}"}, {"{gold}"},{" "}
                {"{goldName}"}, {"{goldIcon}"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Streak Settings */}
      <div className="border rounded-lg p-4">
        <SectionHeader title="Streak Settings" section="streak" />

        {expandedSections.streak && (
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium">Streak Multiplier</label>
              <input
                type="number"
                step="0.01"
                value={form.streakMultiplier}
                onChange={(e) => commit({ streakMultiplier: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded"
              />
              <p className="text-xs text-gray-500">Bonus multiplier per streak day (e.g., 0.1 = 10% per day)</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Streak Announce Channel ID</label>
              <input
                type="text"
                value={form.streakAnnounceChannelId || ""}
                onChange={(e) => commit({ streakAnnounceChannelId: e.target.value || null })}
                placeholder="Channel ID (optional)"
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Streak Announce Message</label>
              <textarea
                value={form.streakAnnounceMessage}
                onChange={(e) => commit({ streakAnnounceMessage: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border rounded text-sm"
              />
              <p className="text-xs text-gray-500">Variables: {"{user}"}, {"{streak}"}, {"{xp}"}, {"{gold}"}</p>
            </div>
          </div>
        )}
      </div>

      {/* Streak Rewards */}
      <div className="border rounded-lg p-4">
        <SectionHeader title="Streak Milestone Rewards" section="streakRewards" />

        {expandedSections.streakRewards && (
          <div className="space-y-4 mt-4">
            <button
              type="button"
              onClick={() => {
                const streakCount = prompt("Enter streak milestone (e.g., 7 for 7-day streak):");
                if (streakCount) {
                  const count = Number(streakCount);
                  const newRewards = {
                    ...form.streakRewards,
                    [count]: {
                      streakCount: count,
                      xpBonus: 100,
                      goldBonus: 50,
                      message: null,
                      channelId: null,
                    },
                  };
                  commit({ streakRewards: newRewards });
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              <Plus size={16} /> Add Streak Reward
            </button>

            {Object.entries(form.streakRewards)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([count, reward]) => (
                <div key={count} className="border rounded p-3 space-y-3 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{count}-Day Streak</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newRewards = { ...form.streakRewards };
                        delete newRewards[count];
                        commit({ streakRewards: newRewards });
                      }}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">XP Bonus</label>
                      <input
                        type="number"
                        value={reward.xpBonus ?? 0}
                        onChange={(e) => {
                          const newRewards = {
                            ...form.streakRewards,
                            [count]: { ...reward, xpBonus: Number(e.target.value) },
                          };
                          commit({ streakRewards: newRewards });
                        }}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Gold Bonus</label>
                      <input
                        type="number"
                        value={reward.goldBonus ?? 0}
                        onChange={(e) => {
                          const newRewards = {
                            ...form.streakRewards,
                            [count]: { ...reward, goldBonus: Number(e.target.value) },
                          };
                          commit({ streakRewards: newRewards });
                        }}
                        className="w-full px-2 py-1 border rounded text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Custom Message (optional)</label>
                    <input
                      type="text"
                      value={reward.message || ""}
                      placeholder="Leave empty for default"
                      onChange={(e) => {
                        const newRewards = {
                          ...form.streakRewards,
                          [count]: { ...reward, message: e.target.value || null },
                        };
                        commit({ streakRewards: newRewards });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Announce Channel ID (optional)</label>
                    <input
                      type="text"
                      value={reward.channelId || ""}
                      placeholder="Leave empty for default"
                      onChange={(e) => {
                        const newRewards = {
                          ...form.streakRewards,
                          [count]: { ...reward, channelId: e.target.value || null },
                        };
                        commit({ streakRewards: newRewards });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Role XP Bonuses */}
      <div className="border rounded-lg p-4">
        <SectionHeader title="Role XP Bonuses" section="roleXp" />

        {expandedSections.roleXp && (
          <div className="space-y-4 mt-4">
            <button
              type="button"
              onClick={() => {
                const roleId = prompt("Enter Role ID:");
                if (roleId) {
                  const newRoleXp = {
                    ...form.roleXp,
                    [roleId]: {
                      extraXp: 0,
                      multiplier: 1.0,
                      cooldownSeconds: undefined,
                    },
                  };
                  commit({ roleXp: newRoleXp });
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              <Plus size={16} /> Add Role XP Config
            </button>

            {Object.entries(form.roleXp).map(([roleId, config]) => (
              <div key={roleId} className="border rounded p-3 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">{roleId}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const newRoleXp = { ...form.roleXp };
                      delete newRoleXp[roleId];
                      commit({ roleXp: newRoleXp });
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Extra XP (flat)</label>
                    <input
                      type="number"
                      value={config.extraXp ?? 0}
                      onChange={(e) => {
                        const newRoleXp = {
                          ...form.roleXp,
                          [roleId]: { ...config, extraXp: Number(e.target.value) },
                        };
                        commit({ roleXp: newRoleXp });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Multiplier</label>
                    <input
                      type="number"
                      step="0.1"
                      value={config.multiplier ?? 1.0}
                      onChange={(e) => {
                        const newRoleXp = {
                          ...form.roleXp,
                          [roleId]: { ...config, multiplier: Number(e.target.value) },
                        };
                        commit({ roleXp: newRoleXp });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Cooldown Override (seconds)</label>
                  <input
                    type="number"
                    value={config.cooldownSeconds ?? ""}
                    placeholder="Leave empty for default"
                    onChange={(e) => {
                      const newRoleXp = {
                        ...form.roleXp,
                        [roleId]: {
                          ...config,
                          cooldownSeconds: e.target.value ? Number(e.target.value) : undefined,
                        },
                      };
                      commit({ roleXp: newRoleXp });
                    }}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Role Daily Bonus */}
      <div className="border rounded-lg p-4">
        <SectionHeader title="Role Daily Bonus Overrides" section="roleDailyBonus" />

        {expandedSections.roleDailyBonus && (
          <div className="space-y-4 mt-4">
            <button
              type="button"
              onClick={() => {
                const roleId = prompt("Enter Role ID:");
                if (roleId) {
                  const next = {
                    ...form.roleDailyBonus,
                    [roleId]: {
                      xpBonus: 0,
                      goldBonus: 0,
                      multiplier: 1.0,
                    },
                  };
                  commit({ roleDailyBonus: next });
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              <Plus size={16} /> Add Role Daily Bonus
            </button>

            {Object.entries(form.roleDailyBonus).map(([roleId, config]) => (
              <div key={roleId} className="border rounded p-3 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">{roleId}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...form.roleDailyBonus };
                      delete next[roleId];
                      commit({ roleDailyBonus: next });
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">XP Bonus</label>
                    <input
                      type="number"
                      value={config.xpBonus ?? 0}
                      onChange={(e) => {
                        const next = {
                          ...form.roleDailyBonus,
                          [roleId]: { ...config, xpBonus: Number(e.target.value) },
                        };
                        commit({ roleDailyBonus: next });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Gold Bonus</label>
                    <input
                      type="number"
                      value={config.goldBonus ?? 0}
                      onChange={(e) => {
                        const next = {
                          ...form.roleDailyBonus,
                          [roleId]: { ...config, goldBonus: Number(e.target.value) },
                        };
                        commit({ roleDailyBonus: next });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Multiplier</label>
                    <input
                      type="number"
                      step="0.1"
                      value={config.multiplier ?? 1.0}
                      onChange={(e) => {
                        const next = {
                          ...form.roleDailyBonus,
                          [roleId]: { ...config, multiplier: Number(e.target.value) },
                        };
                        commit({ roleDailyBonus: next });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Temp Roles */}
      <div className="border rounded-lg p-4">
        <SectionHeader title="Temporary Roles" section="roleTemp" />

        {expandedSections.roleTemp && (
          <div className="space-y-4 mt-4">
            <button
              type="button"
              onClick={() => {
                const roleId = prompt("Enter Role ID:");
                if (roleId) {
                  const next = {
                    ...form.roleTemp,
                    [roleId]: {
                      defaultDurationMinutes: 60,
                      hardExpiryat: null,
                    },
                  };
                  commit({ roleTemp: next });
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              <Plus size={16} /> Add Temp Role Config
            </button>

            {Object.entries(form.roleTemp).map(([roleId, cfg]) => (
              <div key={roleId} className="border rounded p-3 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">{roleId}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...form.roleTemp };
                      delete next[roleId];
                      commit({ roleTemp: next });
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Default Duration (minutes)</label>
                    <input
                      type="number"
                      value={cfg.defaultDurationMinutes ?? ""}
                      placeholder="Leave empty for none"
                      onChange={(e) => {
                        const v = e.target.value;
                        const next = {
                          ...form.roleTemp,
                          [roleId]: {
                            ...cfg,
                            defaultDurationMinutes: v === "" ? null : Number(v),
                          },
                        };
                        commit({ roleTemp: next });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Hard Expiry (ISO datetime)</label>
                    <input
                      type="text"
                      value={cfg.hardExpiryat ?? ""}
                      placeholder="e.g. 2026-01-01T00:00:00Z (optional)"
                      onChange={(e) => {
                        const next = {
                          ...form.roleTemp,
                          [roleId]: {
                            ...cfg,
                            hardExpiryat: e.target.value ? e.target.value : null,
                          },
                        };
                        commit({ roleTemp: next });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Voice Settings */}
      <div className="border rounded-lg p-4">
        <SectionHeader title="Voice XP Settings" section="voice" />

        {expandedSections.voice && (
          <div className="space-y-4 mt-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={form.vcEnabled}
                onChange={(e) => commit({ vcEnabled: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Enable Voice XP</span>
            </label>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Base XP per Minute</label>
                <input
                  type="number"
                  value={form.vcBasePerMinute}
                  onChange={(e) => commit({ vcBasePerMinute: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Min Minutes for XP</label>
                <input
                  type="number"
                  value={form.vcMinMinutesForXp}
                  onChange={(e) => commit({ vcMinMinutesForXp: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Voice Channel Overrides */}
      <div className="border rounded-lg p-4">
        <SectionHeader title="Voice Channel Overrides" section="voiceChannels" />

        {expandedSections.voiceChannels && (
          <div className="space-y-4 mt-4">
            <button
              type="button"
              onClick={() => {
                const channelId = prompt("Enter Voice Channel ID:");
                if (!channelId) return;

                const next: Record<string, VcChannelConfig> = {
                  ...form.vcChannelIds,
                  [channelId]: {
                    enabled: true,
                    channelId,
                    multiplier: 1.0,
                    flatBonusPerMinute: 0,
                    minMinutesOverride: undefined,
                  },
                };
                commit({ vcChannelIds: next });
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              <Plus size={16} /> Add Voice Channel
            </button>

            {Object.entries(form.vcChannelIds).map(([channelId, cfg]) => (
              <div key={channelId} className="border rounded p-3 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">{channelId}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...form.vcChannelIds };
                      delete next[channelId];
                      commit({ vcChannelIds: next });
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!cfg.enabled}
                    onChange={(e) => {
                      const next = { ...form.vcChannelIds, [channelId]: { ...cfg, enabled: e.target.checked } };
                      commit({ vcChannelIds: next });
                    }}
                    className="w-4 h-4"
                  />
                  <label className="text-sm font-medium">Enabled</label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Multiplier</label>
                    <input
                      type="number"
                      step="0.1"
                      value={cfg.multiplier ?? 1}
                      onChange={(e) => {
                        const next = {
                          ...form.vcChannelIds,
                          [channelId]: { ...cfg, multiplier: Number(e.target.value) },
                        };
                        commit({ vcChannelIds: next });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Flat Bonus / Minute</label>
                    <input
                      type="number"
                      value={cfg.flatBonusPerMinute ?? 0}
                      onChange={(e) => {
                        const next = {
                          ...form.vcChannelIds,
                          [channelId]: { ...cfg, flatBonusPerMinute: Number(e.target.value) },
                        };
                        commit({ vcChannelIds: next });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Min Minutes Override</label>
                  <input
                    type="number"
                    value={cfg.minMinutesOverride ?? ""}
                    placeholder="Leave empty for default"
                    onChange={(e) => {
                      const next = {
                        ...form.vcChannelIds,
                        [channelId]: {
                          ...cfg,
                          minMinutesOverride: e.target.value ? Number(e.target.value) : undefined,
                        },
                      };
                      commit({ vcChannelIds: next });
                    }}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Voice Role Bonuses */}
      <div className="border rounded-lg p-4">
        <SectionHeader title="Voice Role XP Bonuses" section="voiceRoles" />

        {expandedSections.voiceRoles && (
          <div className="space-y-4 mt-4">
            <button
              type="button"
              onClick={() => {
                const roleId = prompt("Enter Role ID:");
                if (!roleId) return;

                const next: Record<string, VcRoleBonusConfig> = {
                  ...form.vcRoleXpBonus,
                  [roleId]: {
                    extraXpPerMinute: 0,
                    multiplier: 1.0,
                  },
                };
                commit({ vcRoleXpBonus: next });
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              <Plus size={16} /> Add Voice Role Bonus
            </button>

            {Object.entries(form.vcRoleXpBonus).map(([roleId, cfg]) => (
              <div key={roleId} className="border rounded p-3 space-y-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">{roleId}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...form.vcRoleXpBonus };
                      delete next[roleId];
                      commit({ vcRoleXpBonus: next });
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Extra XP / Minute</label>
                    <input
                      type="number"
                      value={cfg.extraXpPerMinute ?? 0}
                      onChange={(e) => {
                        const next = {
                          ...form.vcRoleXpBonus,
                          [roleId]: { ...cfg, extraXpPerMinute: Number(e.target.value) },
                        };
                        commit({ vcRoleXpBonus: next });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Multiplier</label>
                    <input
                      type="number"
                      step="0.1"
                      value={cfg.multiplier ?? 1.0}
                      onChange={(e) => {
                        const next = {
                          ...form.vcRoleXpBonus,
                          [roleId]: { ...cfg, multiplier: Number(e.target.value) },
                        };
                        commit({ vcRoleXpBonus: next });
                      }}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                </div>
                </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
