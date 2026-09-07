"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

/*
 * Shared form primitives for the config editors.
 *
 * Each editor used to define its own SectionHeader and hand-roll every label,
 * hint and input, which is how the same five patterns ended up repeated ~180
 * times with slightly different classes -- and how light-mode styling
 * (hover:bg-gray-50, text-gray-500) spread across all of them.
 */

const inputClass =
  "w-full rounded-md border px-3 py-2 text-sm transition-colors";

export function Section({
  title,
  description,
  defaultOpen = true,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 rounded-lg px-4 py-3 text-left transition-colors hover:bg-white/5"
      >
        <span>
          <span className="font-medium">{title}</span>
          {description && (
            <span className="mt-0.5 block text-xs font-normal text-[var(--muted)]">
              {description}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp size={16} className="shrink-0 text-[var(--muted)]" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-[var(--muted)]" />
        )}
      </button>

      {open && <div className="border-t border-[var(--border)] p-4">{children}</div>}
    </section>
  );
}

/** Two-column on wide screens, stacked on narrow. */
export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

export function Field({
  label,
  hint,
  wide,
  children,
}: {
  label?: string;
  hint?: React.ReactNode;
  /** Span both columns inside a FieldGrid. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      {label && <label className="block text-sm font-medium">{label}</label>}
      {children}
      {hint && <p className="text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

export function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  mono,
  wide,
}: {
  label?: string;
  hint?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <Field label={label} hint={hint} wide={wide}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} ${mono ? "font-mono" : ""}`}
      />
    </Field>
  );
}

export function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  wide,
}: {
  label?: string;
  hint?: React.ReactNode;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  wide?: boolean;
}) {
  return (
    <Field label={label} hint={hint} wide={wide}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          // Keeps the previous value rather than writing NaN into the config
          // when the box is mid-edit or empty.
          onChange(Number.isFinite(n) ? n : value);
        }}
        className={inputClass}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  hint,
  value,
  onChange,
  rows = 3,
  placeholder,
  wide = true,
}: {
  label?: string;
  hint?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <Field label={label} hint={hint} wide={wide}>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  hint,
  value,
  onChange,
  options,
  wide,
}: {
  label?: string;
  hint?: React.ReactNode;
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
  wide?: boolean;
}) {
  return (
    <Field label={label} hint={hint} wide={wide}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={inputClass}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** A colour swatch and its hex, kept in sync. */
export function ColorField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  wide,
}: {
  label?: string;
  hint?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <Field label={label} hint={hint} wide={wide}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label ? `${label} colour picker` : "Colour picker"}
          className="h-9 w-12 shrink-0 cursor-pointer rounded border p-1"
        />
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} font-mono`}
        />
      </div>
    </Field>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 shrink-0 cursor-pointer rounded border accent-[var(--accent)]"
        />
        <span className="font-medium">{label}</span>
      </label>
      {hint && <p className="pl-6.5 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

/** Shown in place of a list when nothing has been configured yet. */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--muted)]">
      {children}
    </p>
  );
}

/**
 * A `Record<id, T>` map rendered as an add-field plus a list of removable cards.
 *
 * Seven of these live in the XP editor alone (channel overrides, streak
 * milestones, three role maps, and two voice maps), and more in shop, combat,
 * quests and achievements. Each had hand-rolled the same add button, card and
 * delete control -- and each added entries through window.prompt(), which some
 * browsers suppress outright.
 */
export function KeyedList<T>({
  entries,
  addPlaceholder,
  addLabel = "Add",
  onAdd,
  onRemove,
  empty,
  itemLabel,
  renderItem,
}: {
  entries: Array<[string, T]>;
  addPlaceholder: string;
  addLabel?: string;
  /** Given the key typed by the user; the caller builds the default entry. */
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
  empty: string;
  itemLabel?: (key: string, value: T) => React.ReactNode;
  renderItem: (key: string, value: T) => React.ReactNode;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const key = draft.trim();
    if (!key) return;
    onAdd(key);
    setDraft("");
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          placeholder={addPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className={`${inputClass} font-mono`}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {addLabel}
        </button>
      </div>

      {entries.length === 0 ? (
        <EmptyState>{empty}</EmptyState>
      ) : (
        <div className="space-y-3">
          {entries.map(([key, value]) => (
            <div
              key={key}
              className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium">
                  {itemLabel ? itemLabel(key, value) : <span className="font-mono">{key}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(key)}
                  aria-label={`Remove ${key}`}
                  className="shrink-0 text-[var(--muted)] transition-colors hover:text-red-400"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {renderItem(key, value)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
