"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ColorField,
  Field,
  FieldGrid,
  Section,
  SelectField,
  TextField,
} from "@/app/components/ui/form";

export type StyleConfig = {
  mainThemeColor?: string;
  mainTextColor?: string;
  template?: string;
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

const TEMPLATES = [
  { value: "default", label: "Default" },
  { value: "fantasy", label: "Fantasy" },
] as const;

export default function StyleBasicsEditor({ value, onChange }: Props) {
  const style = value ?? {};

  const defaults = useMemo(
    () => ({
      mainThemeColor: "#00AE86",
      mainTextColor: "#FFFFFF",
      template: "default",
      goldIcon: "💰",
      goldName: "Gold",
      xpIcon: "⭐",
      xpName: "XP",
    }),
    []
  );

  const [form, setForm] = useState(() => ({
    mainThemeColor: style.mainThemeColor ?? defaults.mainThemeColor,
    mainTextColor: style.mainTextColor ?? defaults.mainTextColor,
    template: style.template ?? defaults.template,
    goldIcon: style.gold?.icon ?? defaults.goldIcon,
    goldName: style.gold?.name ?? defaults.goldName,
    xpIcon: style.xp?.icon ?? defaults.xpIcon,
    xpName: style.xp?.name ?? defaults.xpName,
  }));

  useEffect(() => {
    const nextStyle = value ?? {};
    setForm({
      mainThemeColor: nextStyle.mainThemeColor ?? defaults.mainThemeColor,
      mainTextColor: nextStyle.mainTextColor ?? defaults.mainTextColor,
      template: nextStyle.template ?? defaults.template,
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

    onChange({
      ...style,
      mainThemeColor: next.mainThemeColor,
      mainTextColor: next.mainTextColor,
      template: next.template,
      gold: { ...(style.gold ?? {}), icon: next.goldIcon, name: next.goldName },
      xp: { ...(style.xp ?? {}), icon: next.xpIcon, name: next.xpName },
    });
  }

  return (
    <div className="space-y-4">
      <Section title="Theme" description="Colours and layout of the rendered profile card.">
        <FieldGrid>
          <ColorField
            label="Main theme colour"
            value={form.mainThemeColor}
            onChange={(v) => commit({ mainThemeColor: v })}
            placeholder="#00AE86"
            hint="Embed accents and progress bars."
          />
          <ColorField
            label="Main text colour"
            value={form.mainTextColor}
            onChange={(v) => commit({ mainTextColor: v })}
            placeholder="#FFFFFF"
          />
          <SelectField
            label="Profile template"
            value={form.template}
            onChange={(v) => commit({ template: v })}
            options={TEMPLATES}
            hint="The card layout used by /profile."
          />
        </FieldGrid>
      </Section>

      <Section
        title="Currency"
        description="What your server calls its gold and XP, wherever the bot prints them."
      >
        <FieldGrid>
          <TextField
            label="Gold name"
            value={form.goldName}
            onChange={(v) => commit({ goldName: v })}
            placeholder="Gold"
          />
          <TextField
            label="Gold icon"
            value={form.goldIcon}
            onChange={(v) => commit({ goldIcon: v })}
            placeholder="💰"
          />
          <TextField
            label="XP name"
            value={form.xpName}
            onChange={(v) => commit({ xpName: v })}
            placeholder="XP"
          />
          <TextField
            label="XP icon"
            value={form.xpIcon}
            onChange={(v) => commit({ xpIcon: v })}
            placeholder="⭐"
          />

          <Field
            wide
            hint={
              <>
                These fill the <span className="font-mono">{"{goldName}"}</span>,{" "}
                <span className="font-mono">{"{goldIcon}"}</span>,{" "}
                <span className="font-mono">{"{xpName}"}</span> and{" "}
                <span className="font-mono">{"{xpIcon}"}</span> placeholders in daily,
                level-up and reward messages.
              </>
            }
          >
            <div className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
              Preview: earned 50 {form.xpName} {form.xpIcon} and 20 {form.goldName}{" "}
              {form.goldIcon}
            </div>
          </Field>
        </FieldGrid>
      </Section>
    </div>
  );
}
