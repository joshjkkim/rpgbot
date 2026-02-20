"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export type EventCategory =
  | "economy"
  | "xp"
  | "daily"
  | "streak"
  | "level"
  | "config"
  | "inventory"
  | "admin";

export type LoggingConfig = {
  enabled?: boolean;
  mainChannelId?: string | null;
  // category -> channelId override, null = use main, false = disabled/removed
  allowedCategories?: Partial<Record<EventCategory, string | null | false>>;
};

type Props = {
  value: LoggingConfig | null | undefined;
  onChange: (next: LoggingConfig) => void;
};

const CATEGORIES: { key: EventCategory; label: string }[] = [
  { key: "economy", label: "Economy" },
  { key: "xp", label: "XP" },
  { key: "daily", label: "Daily" },
  { key: "streak", label: "Streak" },
  { key: "level", label: "Level" },
  { key: "config", label: "Config" },
  { key: "inventory", label: "Inventory" },
  { key: "admin", label: "Admin" },
];

// your slash-command behavior:
// - add-category sets category to channelId or null
// - remove-category sets category to false
function statusFromValue(v: string | null | false | undefined) {
  if (v === false) return "off" as const;
  if (v === null) return "main" as const;
  if (typeof v === "string" && v.trim() !== "") return "override" as const;
  // undefined means "not configured yet" (we'll treat as off in UI until user sets it)
  return "unset" as const;
}

export default function LoggingEditor({ value, onChange }: Props) {
  const defaults: LoggingConfig = useMemo(
    () => ({
      enabled: false,
      mainChannelId: null,
      allowedCategories: {},
    }),
    []
  );

  const [local, setLocal] = useState<LoggingConfig>(value ?? defaults);
  const [expanded, setExpanded] = useState({
    general: true,
    categories: true,
  });

  useEffect(() => {
    setLocal(value ?? defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  function commit(next: LoggingConfig) {
    setLocal(next);
    onChange(next);
  }

  function updateRoot(patch: Partial<LoggingConfig>) {
    commit({ ...local, ...patch });
  }

  function setCategoryValue(category: EventCategory, v: string | null | false) {
    const nextAllowed = { ...(local.allowedCategories ?? {}) };
    nextAllowed[category] = v;
    commit({ ...local, allowedCategories: nextAllowed });
  }

  const SectionHeader = ({
    title,
    section,
  }: {
    title: string;
    section: keyof typeof expanded;
  }) => (
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
    <div className="max-w-4xl space-y-6">
      {/* GENERAL */}
      <div className="rounded-lg border p-4">
        <SectionHeader title="Logging — General" section="general" />

        {expanded.general && (
          <div className="mt-4 space-y-4">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={!!local.enabled}
                onChange={(e) => updateRoot({ enabled: e.target.checked })}
              />
              <span className="font-medium">Enabled</span>
            </label>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Main Channel ID (mainChannelId)</label>
              <div className="flex items-center gap-2">
                <input
                  className="w-full rounded border px-3 py-2 text-sm font-mono"
                  value={local.mainChannelId ?? ""}
                  onChange={(e) => updateRoot({ mainChannelId: e.target.value.trim() || null })}
                  placeholder="(blank = null)"
                />
                <button
                  type="button"
                  className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => updateRoot({ mainChannelId: null })}
                >
                  Null
                </button>
              </div>
              <p className="text-xs text-gray-500">
                If a category is set to “Use main”, logs go to this channel.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* CATEGORIES */}
      <div className="rounded-lg border p-4">
        <SectionHeader title="Allowed Categories" section="categories" />

        {expanded.categories && (
          <div className="mt-4 space-y-3">
            <div className="rounded border bg-gray-50 p-3 text-xs text-gray-600">
              Category behavior matches your commands: <span className="font-mono">false</span> = removed/disabled,{" "}
              <span className="font-mono">null</span> = enabled using main channel, string = enabled w/ override channel.
            </div>

            <div className="space-y-3">
              {CATEGORIES.map(({ key, label }) => {
                const v = (local.allowedCategories ?? {})[key];
                const status = statusFromValue(v);

                const overrideChannelId = typeof v === "string" ? v : "";

                return (
                  <div key={key} className="rounded border p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold">{label}</div>
                          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{key}</span>

                          {status === "off" || status === "unset" ? (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">Off</span>
                          ) : status === "main" ? (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">Use main</span>
                          ) : (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">Override</span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                          onClick={() => setCategoryValue(key, null)}
                          title="Enable category and use main channel (sets value to null)"
                        >
                          Use main
                        </button>

                        <button
                          type="button"
                          className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                          onClick={() => {
                            // if currently false/unset, start with empty string input for override
                            // but don’t commit empty string; we commit only on blur or Enter.
                            if (status === "override") return;
                            setCategoryValue(key, ""); // temporary; UI will show input
                          }}
                          title="Enable with override channel (sets value to channel id string)"
                        >
                          Override
                        </button>

                        <button
                          type="button"
                          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
                          onClick={() => setCategoryValue(key, false)}
                          title="Disable/remove category (sets value to false)"
                        >
                          Off
                        </button>
                      </div>
                    </div>

                    {/* Override input */}
                    {(status === "override" || (typeof v === "string" && v === "")) && (
                      <div className="mt-3 space-y-2">
                        <label className="block text-xs font-medium text-gray-600">Override Channel ID</label>
                        <input
                          className="w-full rounded border px-3 py-2 text-sm font-mono"
                          value={overrideChannelId}
                          onChange={(e) => setCategoryValue(key, e.target.value)}
                          onBlur={(e) => {
                            const id = e.target.value.trim();
                            // If empty, treat as "use main" (null) rather than storing empty string.
                            setCategoryValue(key, id ? id : null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const target = e.target as HTMLInputElement;
                              const id = target.value.trim();
                              setCategoryValue(key, id ? id : null);
                              target.blur();
                            }
                          }}
                          placeholder="discord channel id"
                        />
                        <p className="text-xs text-gray-500">
                          Leave blank to use main channel (becomes <span className="font-mono">null</span>).
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
