"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import ConfigDisplay from "./configDisplay";
import { SettingsMode } from "./ui/form";

const MODE_KEY = "havocish:advanced";
const MODE_EVENT = "havocish:mode";

function readMode() {
  if (new URLSearchParams(window.location.search).has("all")) return true;
  try { return localStorage.getItem(MODE_KEY) === "1"; } catch { return false; }
}

function subscribeMode(onChange: () => void) {
  window.addEventListener(MODE_EVENT, onChange);
  return () => window.removeEventListener(MODE_EVENT, onChange);
}

function setMode(advanced: boolean) {
  try { localStorage.setItem(MODE_KEY, advanced ? "1" : "0"); } catch {}
  // Drop ?all=1 so picking Simple on a page opened from a Fix link sticks.
  const url = new URL(window.location.href);
  url.searchParams.delete("all");
  if (url.href !== window.location.href) history.replaceState(history.state, "", url);
  window.dispatchEvent(new Event(MODE_EVENT));
}

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
  dirty,
  onSave,
  rawSection,
  children,
}: {
  title: string;
  description?: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** Whether the config differs from the last loaded or saved version. */
  dirty: boolean;
  onSave: () => void | Promise<unknown>;
  /** The slice of config shown under "raw JSON", if any. */
  rawSection?: unknown;
  children: React.ReactNode;
}) {
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Simple by default; the choice is remembered per browser. A health check
  // "Fix" link adds ?all=1, since the setting it points at may be advanced.
  const showAdvanced = useSyncExternalStore(subscribeMode, readMode, () => false);
  const [hiddenCount, setHiddenCount] = useState(0);
  const countHidden = useCallback(() => {
    setHiddenCount((n) => n + 1);
    return () => setHiddenCount((n) => n - 1);
  }, []);

  // Leaving with unsaved edits used to discard them without a word: the edits
  // live in React state and nothing persists them until Save. `beforeunload`
  // covers a closed tab or a reload; it does not fire for a sidebar link,
  // because App Router navigation is client-side and exposes no event to hook
  // -- so catch the click that starts it, in the capture phase, before Next's
  // own Link handler runs.
  useEffect(() => {
    if (!dirty) return;

    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // Older Safari ignores preventDefault alone.
    };

    const onClick = (e: MouseEvent) => {
      // Leave modified clicks alone: those open a new tab, this one stays put.
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.href === window.location.href) return;

      if (!window.confirm("You have unsaved changes. Leave this page and discard them?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  async function handleSave() {
    const ok = await onSave();
    if (ok !== false) setSavedAt(Date.now());
  }

  // Cmd/Ctrl+S saves instead of opening the browser's "save page" dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "s" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      if (dirty && !loading && !saving) void handleSave();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <main className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="text-2xl">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div role="group" aria-label="Settings shown" className="flex rounded-sm border border-[var(--border)] text-xs">
            {[false, true].map((adv) => (
              <button
                key={String(adv)}
                type="button"
                aria-pressed={showAdvanced === adv}
                onClick={() => setMode(adv)}
                className={`px-2.5 py-1.5 transition-colors ${showAdvanced === adv ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
              >
                {adv ? "Advanced" : "Simple"}
              </button>
            ))}
          </div>
          {dirty ? (
            <span className="text-xs text-amber-400">Unsaved changes</span>
          ) : savedAt && !saving ? (
            <span className="text-xs text-[var(--muted)]">Saved</span>
          ) : null}
          <button
            className="btn px-4 py-2 text-sm"
            disabled={!dirty || loading || saving}
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

      <SettingsMode.Provider value={{ showAdvanced, countHidden }}>
        {!loading && children}
      </SettingsMode.Provider>

      {!loading && hiddenCount > 0 && (
        <p className="text-center text-xs text-[var(--muted)]">
          {hiddenCount} advanced section{hiddenCount === 1 ? "" : "s"} hidden ·{" "}
          <button type="button" onClick={() => setMode(true)} className="text-[var(--accent)] hover:underline">
            Show
          </button>
        </p>
      )}

      {/* Pinned to the bottom of the screen while there is something to save, so a
          change halfway down a long page can be saved without scrolling back up. */}
      {dirty && !loading && (
        <div className="sticky bottom-4 z-30 flex items-center justify-between gap-4 rounded-sm border border-[var(--accent)]/60 bg-[#14100c]/95 px-4 py-3 shadow-[0_4px_16px_rgb(0_0_0/0.6)] backdrop-blur">
          <span className="text-sm text-amber-400">You have unsaved changes</span>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-[var(--muted)] sm:inline">Ctrl/⌘ + S</span>
            <button className="btn px-4 py-2 text-sm" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}

      {!loading && rawSection !== undefined && (
        <details className="frame p-4">
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
