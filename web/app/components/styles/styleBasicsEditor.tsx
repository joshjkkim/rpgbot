"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export type StyleConfig = {
  mainThemeColor?: string;
  gold?: {
    icon?: string;
    name?: string;
  };
  xp?: {
    icon?: string;
    name?: string;
  };
};

type Props = {
  value: StyleConfig | null | undefined;
  onChange: (nextStyle: StyleConfig) => void;
};

export default function StyleBasicsEditor({ value, onChange }: Props) {
  const style = value ?? {};

  const defaults = useMemo(
    () => ({
      mainThemeColor: "#00AE86",
      goldIcon: "💰",
      goldName: "Gold",
      xpIcon: "⭐",
      xpName: "XP",
    }),
    []
  );

  const [form, setForm] = useState(() => ({
    mainThemeColor: style.mainThemeColor ?? defaults.mainThemeColor,
    goldIcon: style.gold?.icon ?? defaults.goldIcon,
    goldName: style.gold?.name ?? defaults.goldName,
    xpIcon: style.xp?.icon ?? defaults.xpIcon,
    xpName: style.xp?.name ?? defaults.xpName,
  }));

  const [expandedSections, setExpandedSections] = useState({
    theme: true,
    gold: true,
    xp: true,
  });

  useEffect(() => {
    const nextStyle = value ?? {};
    setForm({
      mainThemeColor: nextStyle.mainThemeColor ?? defaults.mainThemeColor,
      goldIcon: nextStyle.gold?.icon ?? defaults.goldIcon,
      goldName: nextStyle.gold?.name ?? defaults.goldName,
      xpIcon: nextStyle.xp?.icon ?? defaults.xpIcon,
      xpName: nextStyle.xp?.name ?? defaults.xpName,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  function commit(partial: Partial<typeof form>) {
    const next = { ...form, ...partial };
    setForm(next);

    const nextStyle: StyleConfig = {
      ...style,
      mainThemeColor: next.mainThemeColor,
      gold: {
        ...(style.gold ?? {}),
        icon: next.goldIcon,
        name: next.goldName,
      },
      xp: {
        ...(style.xp ?? {}),
        icon: next.xpIcon,
        name: next.xpName,
      },
    };

    onChange(nextStyle);
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
      className="flex w-full items-center justify-between rounded px-2 py-2 text-lg font-semibold hover:bg-gray-50"
    >
      <span>{title}</span>
      {expandedSections[section] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
    </button>
  );

  return (
    <div className="max-w-3xl space-y-6">
      {/* Theme */}
      <div className="rounded-lg border p-4">
        <SectionHeader title="Theme" section="theme" />

        {expandedSections.theme && (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-medium">Main Theme Color</label>

            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.mainThemeColor}
                onChange={(e) => commit({ mainThemeColor: e.target.value })}
                className="h-10 w-14 cursor-pointer rounded border"
                aria-label="Theme color picker"
              />

              <input
                type="text"
                value={form.mainThemeColor}
                onChange={(e) => commit({ mainThemeColor: e.target.value })}
                placeholder="#00AE86"
                className="w-full rounded border px-3 py-2 text-sm"
              />
            </div>

            <p className="text-xs text-gray-500">
              Tip: use hex like <span className="font-mono">#00AE86</span>.
            </p>
          </div>
        )}
      </div>

      {/* Gold */}
      <div className="rounded-lg border p-4">
        <SectionHeader title="Gold" section="gold" />

        {expandedSections.gold && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium">Gold Icon</label>
              <input
                type="text"
                value={form.goldIcon}
                onChange={(e) => commit({ goldIcon: e.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="💰"
              />
              <p className="text-xs text-gray-500">Emoji or short text.</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Gold Name</label>
              <input
                type="text"
                value={form.goldName}
                onChange={(e) => commit({ goldName: e.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="Gold"
              />
            </div>

            <div className="sm:col-span-2 rounded border bg-gray-50 p-3 text-sm">
              Preview: <span className="mr-1">{form.goldIcon}</span>
              <span className="font-semibold">{form.goldName}</span>
            </div>
          </div>
        )}
      </div>

      {/* XP */}
      <div className="rounded-lg border p-4">
        <SectionHeader title="XP" section="xp" />

        {expandedSections.xp && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium">XP Icon</label>
              <input
                type="text"
                value={form.xpIcon}
                onChange={(e) => commit({ xpIcon: e.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="⭐"
              />
              <p className="text-xs text-gray-500">Emoji or short text.</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">XP Name</label>
              <input
                type="text"
                value={form.xpName}
                onChange={(e) => commit({ xpName: e.target.value })}
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="XP"
              />
            </div>

            <div className="sm:col-span-2 rounded border bg-gray-50 p-3 text-sm">
              Preview: <span className="mr-1">{form.xpIcon}</span>
              <span className="font-semibold">{form.xpName}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
