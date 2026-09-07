"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, FieldGrid, Section, SelectField, TextField, Toggle } from "@/app/components/ui/form";

export type EventCategory =
  | "economy"
  | "xp"
  | "daily"
  | "streak"
  | "level"
  | "config"
  | "inventory"
  | "admin"
  | "quests";

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

const CATEGORIES: { key: EventCategory; label: string; description: string }[] = [
  { key: "economy", label: "Economy", description: "Purchases, trades and gifts" },
  { key: "xp", label: "XP", description: "Message and voice XP grants" },
  { key: "daily", label: "Daily", description: "Daily reward claims" },
  { key: "streak", label: "Streak", description: "Streak increases and resets" },
  { key: "level", label: "Level", description: "Level-ups" },
  { key: "config", label: "Config", description: "Changes made to this server's settings" },
  { key: "inventory", label: "Inventory", description: "Items used, granted or removed" },
  { key: "quests", label: "Quests", description: "Quests started and completed" },
  { key: "admin", label: "Admin", description: "Administrative actions" },
];

/**
 * The stored shape is tri-state, matching the slash commands: `false` is off,
 * `null` is on using the main channel, a string is on with an override.
 * `undefined` means never configured, which behaves as off.
 */
type Mode = "off" | "main" | "override";

const MODES = [
  { value: "off" as const, label: "Off" },
  { value: "main" as const, label: "Use main channel" },
  { value: "override" as const, label: "Own channel" },
];

function modeOf(v: string | null | false | undefined): Mode {
  if (v === null) return "main";
  if (typeof v === "string") return "override";
  return "off";
}

export default function LoggingEditor({ value, onChange }: Props) {
  const defaults: LoggingConfig = useMemo(
    () => ({ enabled: false, mainChannelId: null, allowedCategories: {} }),
    []
  );

  const [local, setLocal] = useState<LoggingConfig>(value ?? defaults);

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
    commit({ ...local, allowedCategories: { ...(local.allowedCategories ?? {}), [category]: v } });
  }

  return (
    <div className="space-y-4">
      <Section title="General" description="Whether events are recorded, and where they go by default.">
        <Toggle
          label="Enable logging"
          checked={!!local.enabled}
          onChange={(v) => updateRoot({ enabled: v })}
        />
        <div className="mt-4">
          <TextField
            label="Main channel ID"
            value={local.mainChannelId ?? ""}
            onChange={(v) => updateRoot({ mainChannelId: v.trim() || null })}
            placeholder="Leave blank for none"
            mono
            hint="Categories set to “Use main channel” are sent here."
          />
        </div>
      </Section>

      <Section
        title="Categories"
        description="Each category is off, sent to the main channel, or sent to one of its own."
      >
        <div className="space-y-3">
          {CATEGORIES.map(({ key, label, description }) => {
            const v = (local.allowedCategories ?? {})[key];
            const mode = modeOf(v);

            return (
              <div
                key={key}
                className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3"
              >
                <FieldGrid>
                  <Field>
                    <div className="text-sm font-medium">{label}</div>
                    <p className="text-xs text-[var(--muted)]">{description}</p>
                  </Field>

                  <SelectField<Mode>
                    value={mode}
                    onChange={(next) => {
                      if (next === "off") return setCategoryValue(key, false);
                      if (next === "main") return setCategoryValue(key, null);
                      // Start an override as an empty string so the input appears;
                      // blurring it empty falls back to the main channel.
                      setCategoryValue(key, typeof v === "string" ? v : "");
                    }}
                    options={MODES}
                  />

                  {mode === "override" && (
                    <TextField
                      wide
                      label="Channel ID"
                      value={typeof v === "string" ? v : ""}
                      onChange={(next) => setCategoryValue(key, next)}
                      placeholder="Blank falls back to the main channel"
                      mono
                    />
                  )}
                </FieldGrid>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
