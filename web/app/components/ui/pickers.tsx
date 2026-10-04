"use client";

import { createContext, useContext } from "react";
import type { GuildMeta } from "@/app/lib/discord";
import { Field, TextField } from "./form";

/*
 * Channel and role pickers. The guild layout fetches the server's channels and
 * roles once and provides them here, so every editor gets dropdowns instead of
 * asking owners to paste IDs. With no list (bot token unset, bot not in the
 * server) each picker falls back to the old ID text box.
 */

const GuildMetaContext = createContext<GuildMeta | null>(null);

export function GuildMetaProvider({ value, children }: { value: GuildMeta | null; children: React.ReactNode }) {
  return <GuildMetaContext.Provider value={value}>{children}</GuildMetaContext.Provider>;
}

const inputClass = "w-full rounded-sm border px-3 py-2 text-sm transition-colors";

// Discord channel types: 0 text, 5 announcement, 15 forum; 2 voice, 13 stage.
const TEXT_TYPES = new Set([0, 5]);
const VOICE_TYPES = new Set([2, 13]);

type PickerProps = {
  label?: string;
  hint?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  /** Label for the empty choice. */
  emptyLabel?: string;
  wide?: boolean;
};

function Picker({
  label, hint, value, onChange, emptyLabel = "None", wide, options, unknownLabel,
}: PickerProps & { options: { id: string; name: string }[] | null; unknownLabel: string }) {
  if (!options) {
    return <TextField label={label} hint={hint} value={value} onChange={onChange} placeholder={`${unknownLabel} ID`} mono wide={wide} />;
  }
  // A saved id the list no longer has (deleted, or no access) stays selectable,
  // so opening the editor never silently clears it.
  const missing = value && !options.some((o) => o.id === value);
  return (
    <Field label={label} hint={hint} wide={wide}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">{emptyLabel}</option>
        {missing && <option value={value}>Unknown {unknownLabel.toLowerCase()} ({value})</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </Field>
  );
}

export function ChannelField({ voice, ...props }: PickerProps & { voice?: boolean }) {
  const meta = useContext(GuildMetaContext);
  const types = voice ? VOICE_TYPES : TEXT_TYPES;
  const options = meta?.channels
    .filter((c) => types.has(c.type))
    .map((c) => ({ id: c.id, name: voice ? `🔊 ${c.name}` : `#${c.name}` })) ?? null;
  return <Picker {...props} options={options} unknownLabel="Channel" />;
}

export function RoleField(props: PickerProps) {
  const meta = useContext(GuildMetaContext);
  const options = meta?.roles.map((r) => ({ id: r.id, name: `@${r.name}` })) ?? null;
  return <Picker {...props} options={options} unknownLabel="Role" />;
}

/** Shop items by name. Needs no Discord access: the items come from the config. */
export function ItemField({ items, ...props }: PickerProps & { items: Record<string, { name?: string; emoji?: string }> }) {
  const options = Object.entries(items).map(([id, it]) => ({ id, name: `${it.emoji ? it.emoji + " " : ""}${it.name || id}` }));
  return <Picker {...props} options={options} unknownLabel="Item" />;
}

/** Several roles at once, as toggle chips. Empty means anyone. */
export function RolesField({ label, hint, value, onChange, wide }: {
  label?: string;
  hint?: React.ReactNode;
  value: string[];
  onChange: (v: string[]) => void;
  wide?: boolean;
}) {
  const meta = useContext(GuildMetaContext);
  if (!meta) {
    return (
      <TextField
        label={label} hint={hint} wide={wide} mono
        value={value.join(", ")}
        onChange={(v) => onChange(v.split(",").map((s) => s.trim()).filter(Boolean))}
        placeholder="Comma-separated role IDs, blank for anyone"
      />
    );
  }
  const known = new Set(meta.roles.map((r) => r.id));
  const roles = [
    ...meta.roles.map((r) => ({ id: r.id, label: `@${r.name}` })),
    ...value.filter((id) => !known.has(id)).map((id) => ({ id, label: `Unknown role (${id})` })),
  ];
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <Field label={label} hint={hint ?? (value.length === 0 ? "No roles picked, so anyone can." : undefined)} wide={wide}>
      <div className="flex flex-wrap gap-1.5">
        {roles.map((r) => {
          const on = value.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(r.id)}
              className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                on ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--border-bright)]"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}
