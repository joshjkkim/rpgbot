"use client";

import { useEffect, useRef, useState } from "react";

/** Upload a picture; the dashboard keeps it and gives back its link. */
export default function UploadButton({ guildId, onUploaded, label = "Upload a picture" }: { guildId: string; onUploaded: (url: string) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const onUploadedNow = useRef(onUploaded);
  useEffect(() => { onUploadedNow.current = onUploaded; }, [onUploaded]);
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  async function upload(file: File) {
    setState({ busy: true, error: null });
    const body = new FormData();
    body.set("file", file);
    const res = await fetch(`/api/discord/guilds/${guildId}/images`, { method: "POST", body }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (res?.ok && json?.url) {
      // Other slots or settings may have changed while the file was uploading.
      onUploadedNow.current(json.url);
      setState({ busy: false, error: null });
    } else setState({ busy: false, error: json?.message ?? "That upload didn't work. Try again?" });
  }
  return (
    <div className="flex items-center gap-2">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
      <button type="button" disabled={state.busy} onClick={() => input.current?.click()}
        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]">
        {state.busy ? "Uploading…" : label}
      </button>
      {state.error && <span className="text-xs text-red-400">{state.error}</span>}
    </div>
  );
}

