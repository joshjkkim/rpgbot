"use client";

import { useState } from "react";
import ConfigDisplay from "./configDisplay";

/**
 * The shell every config page shares: title, save control, load/error states,
 * and the raw-JSON escape hatch.
 *
 * Each page used to carry its own copy of this, which is how nine files ended
 * up with the same light-on-dark styling -- a bg-zinc-900 save button and
 * bg-zinc-50 panels sitting on the dashboard's dark gradient.
 */
export default function ConfigPage({
  title,
  description,
  loading,
  saving,
  error,
  canSave,
  onSave,
  rawSection,
  children,
}: {
  title: string;
  description?: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  canSave: boolean;
  onSave: () => void | Promise<unknown>;
  /** The slice of config shown under "raw JSON", if any. */
  rawSection?: unknown;
  children: React.ReactNode;
}) {
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function handleSave() {
    const ok = await onSave();
    if (ok !== false) setSavedAt(Date.now());
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {savedAt && !saving && (
            <span className="text-xs text-[var(--muted)]">Saved</span>
          )}
          <button
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canSave || loading || saving}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </header>

      {loading && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
          Loading configuration…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && children}

      {!loading && rawSection !== undefined && (
        <details className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <summary className="cursor-pointer text-sm font-medium text-[var(--muted)]">
            Raw JSON
          </summary>
          <div className="mt-3">
            <ConfigDisplay config={rawSection} />
          </div>
        </details>
      )}
    </main>
  );
}
