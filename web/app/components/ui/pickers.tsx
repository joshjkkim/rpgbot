"use client";

import { createContext, useContext, useState } from "react";
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

const NEW = "__new__";

function Picker({
  label, hint, value, onChange, emptyLabel = "None", wide, options, unknownLabel, onNew,
}: PickerProps & { options: { id: string; name: string }[] | null; unknownLabel: string; onNew?: () => void }) {
  if (!options) {
    return <TextField label={label} hint={hint} value={value} onChange={onChange} placeholder={`${unknownLabel} ID`} mono wide={wide} />;
  }
  // A saved id the list no longer has (deleted, or no access) stays selectable,
  // so opening the editor never silently clears it.
  const missing = value && !options.some((o) => o.id === value);
  return (
    <Field label={label} hint={hint} wide={wide}>
      <select value={value} onChange={(e) => (e.target.value === NEW ? onNew?.() : onChange(e.target.value))} className={inputClass}>
        <option value="">{emptyLabel}</option>
        {missing && <option value={value}>Unknown {unknownLabel.toLowerCase()} ({value})</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
        {onNew && <option value={NEW}>+ New {unknownLabel.toLowerCase()}…</option>}
      </select>
    </Field>
  );
}

/** The server's text (or voice) channels as picker options; null when unavailable. */
export function useChannelOptions(voice?: boolean) {
  const meta = useContext(GuildMetaContext);
  const types = voice ? VOICE_TYPES : TEXT_TYPES;
  return meta?.channels
    .filter((c) => types.has(c.type))
    .map((c) => ({ id: c.id, name: voice ? `🔊 ${c.name}` : `#${c.name}` })) ?? null;
}

/** The server's roles as picker options; null when unavailable. */
export function useRoleOptions() {
  const meta = useContext(GuildMetaContext);
  return meta?.roles.map((r) => ({ id: r.id, name: `@${r.name}` })) ?? null;
}

export function ChannelField({ voice, ...props }: PickerProps & { voice?: boolean }) {
  return <Picker {...props} options={useChannelOptions(voice)} unknownLabel="Channel" />;
}

export function RoleField(props: PickerProps) {
  return <Picker {...props} options={useRoleOptions()} unknownLabel="Role" />;
}

/** Makes an item from a name and returns its id. Pages that can write the shop provide it (ConfigPage's onCreateItem). */
const CreateItemContext = createContext<((name: string) => string) | null>(null);
export const CreateItemProvider = CreateItemContext.Provider;

/**
 * Shop items by name. Needs no Discord access: the items come from the config.
 * Where the page allows it, "+ New item…" makes one on the spot, so a drop or
 * an ingredient that doesn't exist yet doesn't mean a trip to the Items page.
 */
export function ItemField({ items, ...props }: PickerProps & { items: Record<string, { name?: string; emoji?: string }> }) {
  const create = useContext(CreateItemContext);
  const [naming, setNaming] = useState<string | null>(null);
  const options = Object.entries(items).map(([id, it]) => ({ id, name: `${it.emoji ? it.emoji + " " : ""}${it.name || id}` }));
  if (create && naming !== null) {
    const done = () => {
      if (naming.trim()) props.onChange(create(naming.trim()));
      setNaming(null);
    };
    return (
      <Field label={props.label} hint="A plain item for now: give it a picture, price and uses on the Items page." wide={props.wide}>
        <div className="flex gap-2">
          <input
            autoFocus
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); done(); } if (e.key === "Escape") setNaming(null); }}
            placeholder="Wolf Fang"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <button type="button" className="btn shrink-0 px-3 text-sm" onClick={done}>Create</button>
          <button type="button" className="shrink-0 px-2 text-sm text-[var(--muted)]" onClick={() => setNaming(null)}>Cancel</button>
        </div>
      </Field>
    );
  }
  return <Picker {...props} options={options} unknownLabel="Item" {...(create && { onNew: () => setNaming("") })} />;
}

type ChipsProps = {
  label?: string;
  hint?: React.ReactNode;
  value: string[];
  onChange: (v: string[]) => void;
  wide?: boolean;
};

/** Several ids at once, as toggle chips; a comma-separated text box when the list is unavailable. */
function IdChips({ label, hint, value, onChange, wide, options, unknownLabel, emptyHint }: ChipsProps & {
  options: { id: string; name: string }[] | null;
  unknownLabel: string;
  emptyHint: string;
}) {
  if (!options) {
    return (
      <TextField
        label={label} hint={hint} wide={wide} mono
        value={value.join(", ")}
        onChange={(v) => onChange(v.split(",").map((s) => s.trim()).filter(Boolean))}
        placeholder={`Comma-separated ${unknownLabel.toLowerCase()} IDs, blank for ${emptyHint}`}
      />
    );
  }
  const known = new Set(options.map((o) => o.id));
  const chips = [
    ...options.map((o) => ({ id: o.id, label: o.name })),
    ...value.filter((id) => !known.has(id)).map((id) => ({ id, label: `Unknown ${unknownLabel.toLowerCase()} (${id})` })),
  ];
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <Field label={label} hint={hint ?? (value.length === 0 ? `None picked, so ${emptyHint}.` : undefined)} wide={wide}>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => {
          const on = value.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(c.id)}
              className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                on ? "border-[var(--accent)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--border-bright)]"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/** Several roles at once, as toggle chips. Empty means anyone. */
export function RolesField(props: ChipsProps) {
  return <IdChips {...props} options={useRoleOptions()} unknownLabel="Role" emptyHint="anyone can" />;
}

/** Several enemies at once, from the config. Empty means any enemy. */
export function EnemiesField({ enemies, ...props }: ChipsProps & { enemies: Record<string, { name?: string; emoji?: string }> }) {
  const options = Object.entries(enemies).map(([id, e]) => ({ id, name: `${e.emoji ? e.emoji + " " : ""}${e.name || id}` }));
  return <IdChips {...props} options={options} unknownLabel="Enemy" emptyHint="any enemy counts" />;
}

/** Text channels and whole categories, for places: a category covers every channel in it. */
export function PlaceChannelsField(props: ChipsProps) {
  const meta = useContext(GuildMetaContext);
  const options = meta?.channels
    .filter((c) => TEXT_TYPES.has(c.type) || c.type === 4)
    .map((c) => ({ id: c.id, name: c.type === 4 ? `📁 ${c.name.toUpperCase()}` : `#${c.name}` })) ?? null;
  return <IdChips {...props} options={options} unknownLabel="Channel" emptyHint="nobody finds it" />;
}

/** Fight moves, from the config. */
export function MovesField({ moves, ...props }: ChipsProps & { moves: Record<string, { name?: string; emoji?: string }> }) {
  const options = Object.entries(moves).map(([id, m]) => ({ id, name: `${m.emoji ? m.emoji + " " : ""}${m.name || id}` }));
  return <IdChips {...props} options={options} unknownLabel="Move" emptyHint="it gives none" />;
}

/** Several items at once, from the config. */
export function ItemsField({ items, emptyHint = "any item counts", ...props }: ChipsProps & { items: Record<string, { name?: string; emoji?: string }>; emptyHint?: string }) {
  const options = Object.entries(items).map(([id, it]) => ({ id, name: `${it.emoji ? it.emoji + " " : ""}${it.name || id}` }));
  return <IdChips {...props} options={options} unknownLabel="Item" emptyHint={emptyHint} />;
}

/** Several text channels at once, as toggle chips. Empty means every channel. */
export function ChannelsField(props: ChipsProps) {
  return <IdChips {...props} options={useChannelOptions()} unknownLabel="Channel" emptyHint="every channel" />;
}
