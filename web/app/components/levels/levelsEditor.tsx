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
} from "@/app/components/ui/form";
import LevelCurveChart from "@/app/components/levels/levelCurveChart";
import {
  CURVE_HINTS,
  CURVE_PARAMS,
  normalizeCurveParams,
  suggestedCurveParams,
  type CurveType,
} from "@/app/lib/levelCurve";

export interface LevelAction {
  type: "assignRole" | "removeRole" | "sendMessage";
  roleId?: string;
  message?: string;
  channelId?: string;
}

export type LevelsConfig = {
  maxLevel: number | null;
  announceLevelUpInChannelId: string | null;
  announceLevelUpMessage: string;
  curveType: CurveType;
  curveParams: Record<string, number>;
  xpOverrides: Record<number, number>;
  levelActions: Record<number, LevelAction[]>;
};

type Props = {
  value: LevelsConfig | null | undefined;
  onChange: (next: LevelsConfig) => void;
};

const CURVES = [
  { value: "linear" as const, label: "Linear" },
  { value: "exponential" as const, label: "Exponential" },
  { value: "polynomial" as const, label: "Polynomial" },
  { value: "logarithmic" as const, label: "Logarithmic" },
];

const ACTION_TYPES = [
  { value: "assignRole" as const, label: "Assign role" },
  { value: "removeRole" as const, label: "Remove role" },
  { value: "sendMessage" as const, label: "Send message" },
];

/**
 * Drops actions the bot no longer runs.
 *
 * `runCommand` was offered here and saved into configs, but the bot never
 * implemented it -- it sat in an empty branch, so the action silently did
 * nothing. Filtering on load stops a stored one rendering as a type with no
 * matching option, and the next save writes the config back without it.
 */
function dropRetiredActions(config: LevelsConfig): LevelsConfig {
  const known = ACTION_TYPES.map((t) => t.value) as string[];
  const levelActions: Record<number, LevelAction[]> = {};

  for (const [level, actions] of Object.entries(config.levelActions ?? {})) {
    const kept = (actions ?? []).filter((a) => known.includes(a?.type));
    if (kept.length) levelActions[Number(level)] = kept;
  }

  return { ...config, levelActions };
}

function fromStored(config: LevelsConfig): LevelsConfig {
  const cleaned = dropRetiredActions(config);
  return { ...cleaned, curveParams: normalizeCurveParams(cleaned.curveType, cleaned.curveParams) };
}

export default function LevelsEditor({ value, onChange }: Props) {
  const defaults: LevelsConfig = useMemo(
    () => ({
      maxLevel: null,
      announceLevelUpInChannelId: null,
      announceLevelUpMessage: "🎉 {user} reached level {level}!",
      curveType: "linear",
      curveParams: { rate: 100 },
      xpOverrides: {},
      levelActions: {},
    }),
    []
  );

  const [local, setLocal] = useState<LevelsConfig>(fromStored(value ?? defaults));

  useEffect(() => {
    setLocal(fromStored(value ?? defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  function commit(next: LevelsConfig) {
    setLocal(next);
    onChange(next);
  }

  function updateRoot(patch: Partial<LevelsConfig>) {
    commit({ ...local, ...patch });
  }

  function setLevelActions(level: string, actions: LevelAction[]) {
    commit({ ...local, levelActions: { ...(local.levelActions ?? {}), [Number(level)]: actions } });
  }

  const overrideEntries = useMemo(
    () =>
      Object.entries(local.xpOverrides ?? {})
        .filter(([k]) => Number.isFinite(Number(k)))
        .sort((a, b) => Number(a[0]) - Number(b[0])),
    [local.xpOverrides]
  );

  const actionEntries = useMemo(
    () =>
      Object.entries(local.levelActions ?? {})
        .filter(([k]) => Number.isFinite(Number(k)))
        .sort((a, b) => Number(a[0]) - Number(b[0])),
    [local.levelActions]
  );

  return (
    <div className="space-y-4">
      <Section title="General" description="The level cap and how level-ups are announced.">
        <FieldGrid>
          <NumberField
            label="Max level"
            value={local.maxLevel ?? 0}
            min={0}
            onChange={(v) => updateRoot({ maxLevel: v > 0 ? v : null })}
            hint="0 means no cap."
          />
          <TextField
            label="Announce channel ID"
            value={local.announceLevelUpInChannelId ?? ""}
            onChange={(v) => updateRoot({ announceLevelUpInChannelId: v.trim() || null })}
            placeholder="Leave blank to reply in place"
            mono
          />
          <TextAreaField
            label="Level-up message"
            value={local.announceLevelUpMessage}
            onChange={(v) => updateRoot({ announceLevelUpMessage: v })}
            rows={2}
            hint="{user} {level}"
          />
        </FieldGrid>
      </Section>

      <Section title="Progression curve" description="How much total XP each level costs.">
        <FieldGrid>
          <SelectField
            label="Curve"
            value={local.curveType}
            onChange={(v) => commit({ ...local, curveType: v, curveParams: suggestedCurveParams(v) })}
            options={CURVES}
            hint={`Changing this resets the parameters. ${CURVE_HINTS[local.curveType]}`}
          />
        </FieldGrid>

        <div className="mt-4">
          <FieldGrid>
            {(CURVE_PARAMS[local.curveType] ?? []).map((spec) => (
              <NumberField
                key={spec.key}
                label={spec.label}
                value={local.curveParams?.[spec.key] ?? spec.fallback}
                step={spec.step}
                min={spec.min}
                onChange={(v) =>
                  updateRoot({ curveParams: { ...(local.curveParams ?? {}), [spec.key]: v } })
                }
              />
            ))}
          </FieldGrid>
        </div>

        <div className="mt-6">
          <LevelCurveChart levels={local} />
        </div>
      </Section>

      <Section
        title="XP overrides"
        description="Pin specific levels to an exact total XP, ignoring the curve."
        defaultOpen={false}
      >
        <KeyedList<number>
          entries={overrideEntries}
          addPlaceholder="Level number"
          addLabel="Add override"
          empty="No overrides. Every level follows the curve."
          itemLabel={(level) => `Level ${level}`}
          onAdd={(raw) => {
            const level = Number(raw);
            if (!Number.isFinite(level) || level <= 0) return;
            updateRoot({ xpOverrides: { ...(local.xpOverrides ?? {}), [level]: 0 } });
          }}
          onRemove={(level) => {
            const next = { ...(local.xpOverrides ?? {}) };
            delete next[Number(level)];
            updateRoot({ xpOverrides: next });
          }}
          renderItem={(level, xpRequired) => (
            <FieldGrid>
              <NumberField
                label="Total XP required"
                value={xpRequired}
                min={0}
                onChange={(v) =>
                  updateRoot({ xpOverrides: { ...(local.xpOverrides ?? {}), [Number(level)]: v } })
                }
              />
            </FieldGrid>
          )}
        />
      </Section>

      <Section
        title="Level actions"
        description="What happens when someone reaches a level."
        defaultOpen={false}
      >
        <KeyedList<LevelAction[]>
          entries={actionEntries}
          addPlaceholder="Level number"
          addLabel="Add level"
          empty="No level actions configured."
          itemLabel={(level, actions) =>
            `Level ${level} — ${actions.length} action${actions.length === 1 ? "" : "s"}`
          }
          onAdd={(raw) => {
            const level = Number(raw);
            if (!Number.isFinite(level) || level <= 0) return;
            if ((local.levelActions ?? {})[level]) return;
            updateRoot({ levelActions: { ...(local.levelActions ?? {}), [level]: [] } });
          }}
          onRemove={(level) => {
            const next = { ...(local.levelActions ?? {}) };
            delete next[Number(level)];
            updateRoot({ levelActions: next });
          }}
          renderItem={(level, actions) => (
            <div className="space-y-3">
              {actions.length === 0 && (
                <p className="text-xs text-[var(--muted)]">Nothing happens at this level yet.</p>
              )}

              {actions.map((action, index) => (
                <div
                  key={index}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs text-[var(--muted)]">Action {index + 1}</span>
                    <button
                      type="button"
                      aria-label="Remove action"
                      onClick={() => setLevelActions(level, actions.filter((_, i) => i !== index))}
                      className="text-[var(--muted)] transition-colors hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <FieldGrid>
                    <SelectField
                      label="Type"
                      value={action.type}
                      onChange={(v) =>
                        setLevelActions(
                          level,
                          actions.map((a, i) => (i === index ? { ...a, type: v } : a))
                        )
                      }
                      options={ACTION_TYPES}
                    />

                    {(action.type === "assignRole" || action.type === "removeRole") && (
                      <TextField
                        label="Role ID"
                        value={action.roleId ?? ""}
                        onChange={(v) =>
                          setLevelActions(
                            level,
                            actions.map((a, i) => (i === index ? { ...a, roleId: v } : a))
                          )
                        }
                        mono
                      />
                    )}

                    {action.type === "sendMessage" && (
                      <>
                        <TextField
                          label="Channel ID"
                          value={action.channelId ?? ""}
                          onChange={(v) =>
                            setLevelActions(
                              level,
                              actions.map((a, i) => (i === index ? { ...a, channelId: v } : a))
                            )
                          }
                          placeholder="Defaults to the announce channel"
                          mono
                        />
                        <TextField
                          wide
                          label="Message"
                          value={action.message ?? ""}
                          onChange={(v) =>
                            setLevelActions(
                              level,
                              actions.map((a, i) => (i === index ? { ...a, message: v } : a))
                            )
                          }
                          hint="{user}"
                        />
                      </>
                    )}
                  </FieldGrid>
                </div>
              ))}

              <Field>
                <button
                  type="button"
                  onClick={() =>
                    setLevelActions(level, [
                      ...actions,
                      {
                        type: "sendMessage",
                        message: "Congrats {user}!",
                        channelId: local.announceLevelUpInChannelId ?? "",
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
                >
                  <Plus size={14} /> Add action
                </button>
              </Field>
            </div>
          )}
        />
      </Section>
    </div>
  );
}
