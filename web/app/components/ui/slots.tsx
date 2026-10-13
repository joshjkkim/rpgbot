"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

/*
 * Content (items, enemies, quests, achievements) as an inventory grid: one
 * slot per entry, its tooltip on hover, click to edit it in a side panel. The
 * old layout rendered every entry as an open form, which buried a 14-item
 * starter pack under several screens of inputs.
 */

/** A readable id from a name ("Iron Sword" -> "iron-sword"), unique among `taken`. */
export function idFromName(name: string, taken: Iterable<string>): string {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "entry";
  const used = new Set(taken);
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

export type SlotLook = { icon?: string; label: string; colour?: string; faded?: boolean };

export function SlotGrid<T>({
  entries,
  selected,
  onSelect,
  look,
  tooltip,
  newLabel,
  onCreate,
}: {
  entries: Array<[string, T]>;
  selected: string | null;
  onSelect: (id: string) => void;
  look: (id: string, value: T) => SlotLook;
  /** Shown above the slot on hover. */
  tooltip?: (id: string, value: T) => React.ReactNode;
  newLabel: string;
  /** Given the name typed for a new entry. */
  onCreate: (name: string) => void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  function create() {
    if (!name.trim()) return;
    onCreate(name.trim());
    setName("");
    setNaming(false);
  }

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
        {entries.map(([id, value]) => {
          const s = look(id, value);
          const on = id === selected;
          return (
            <li key={id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-pressed={on}
                className={`flex w-full flex-col items-center gap-1 rounded-sm border p-1.5 transition-colors ${
                  on ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] bg-black/30 hover:border-[var(--border-bright)]"
                } ${s.faded ? "opacity-50" : ""}`}
              >
                <span
                  className="slot h-11 w-11 text-2xl"
                  style={s.colour ? { borderColor: s.colour } : undefined}
                >
                  {s.icon || "❔"}
                </span>
                <span className="w-full truncate text-center text-[11px] leading-tight" style={{ color: s.colour }}>
                  {s.label}
                </span>
              </button>
              {tooltip && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-64 -translate-x-1/2 group-hover:block">
                  {tooltip(id, value)}
                </div>
              )}
            </li>
          );
        })}

        <li>
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="flex h-full min-h-[4.6rem] w-full flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-[var(--border)] text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <Plus size={18} />
            <span className="text-[11px]">{newLabel}</span>
          </button>
        </li>
      </ul>

      {naming && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setNaming(false)}
            placeholder="Name, e.g. Iron Sword"
            className="w-full rounded-sm border px-3 py-2 text-sm"
          />
          <button type="submit" disabled={!name.trim()} className="btn shrink-0 px-3 py-2 text-sm">
            Create
          </button>
          <button type="button" onClick={() => setNaming(false)} className="btn btn-stone shrink-0 px-3 py-2 text-sm">
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

/** Two-step delete, so a stray click cannot remove an entry and no browser dialog is needed. */
export function DeleteButton({ onDelete, label = "Delete" }: { onDelete: () => void; label?: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => (armed ? onDelete() : setArmed(true))}
      onBlur={() => setArmed(false)}
      className={`rounded-sm border px-2.5 py-1 text-xs transition-colors ${
        armed ? "border-red-400 text-red-400" : "border-[var(--border)] text-[var(--muted)] hover:text-red-400"
      }`}
    >
      {armed ? "Click again to delete" : label}
    </button>
  );
}
