"use client";

import { useRef, useState } from "react";
import { FieldGrid, Field, Section, SelectField, TextAreaField, TextField } from "@/app/components/ui/form";
import { ContentBrowser, EntryTooltip, idFromName } from "@/app/components/ui/slots";

// ─── Types (mirrored from havocish/src/types/guild.ts) ───

export type CharacterConfig = { id: string; name: string; avatar?: string; lines?: string[] };
export type CharactersConfig = { list: Record<string, CharacterConfig>; shopkeeperId?: string | null; announcerId?: string | null };

type Named = Record<string, { name?: string; emoji?: string; characterId?: string }>;

const isLink = (s: string) => /^https?:\/\//.test(s);

/** The picture as Discord shows it: a round avatar, from a link or an emoji. */
function Avatar({ avatar, size = 40 }: { avatar?: string; size?: number }) {
  const a = avatar?.trim() ?? "";
  return (
    <span className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#2b2d31]" style={{ width: size, height: size, fontSize: size * 0.55 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- owner-given links from anywhere */}
      {isLink(a) ? <img src={a} alt="" className="h-full w-full object-cover" /> : a || "🙂"}
    </span>
  );
}

/** What their post looks like in Discord: real output, not a description. */
function Preview({ c }: { c: CharacterConfig }) {
  const line = c.lines?.find((l) => l.trim()) ?? "✨ @someone found 🌠 Starmetal Shard at Deep Vein!";
  return (
    <div className="flex gap-3 rounded-sm bg-[#313338] p-3 font-sans">
      <Avatar avatar={c.avatar} />
      <div className="min-w-0 text-[15px] leading-snug">
        <p>
          <span className="font-medium text-white">{c.name || "Unnamed"}</span>
          <span className="ml-1.5 rounded-[3px] bg-[#5865f2] px-1 py-px align-middle text-[10px] font-semibold text-white">APP</span>
          <span className="ml-2 text-xs text-[#949ba4]">Today at 12:00</span>
        </p>
        <p className="italic text-[#dbdee1]">{c.lines?.some((l) => l.trim()) ? `“${line}”` : line}</p>
      </div>
    </div>
  );
}

/** Upload a picture; the dashboard keeps it and gives back its link. */
function UploadButton({ guildId, onUploaded }: { guildId: string; onUploaded: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  async function upload(file: File) {
    setState({ busy: true, error: null });
    const body = new FormData();
    body.set("file", file);
    const res = await fetch(`/api/discord/guilds/${guildId}/images`, { method: "POST", body }).catch(() => null);
    const json = await res?.json().catch(() => null);
    if (res?.ok && json?.url) {
      onUploaded(json.url);
      setState({ busy: false, error: null });
    } else setState({ busy: false, error: json?.message ?? "That upload didn't work. Try again?" });
  }
  return (
    <div className="flex items-center gap-2">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
      <button type="button" disabled={state.busy} onClick={() => input.current?.click()}
        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]">
        {state.busy ? "Uploading…" : "Upload a picture"}
      </button>
      {state.error && <span className="text-xs text-red-400">{state.error}</span>}
    </div>
  );
}

/** Owner-made characters, and who speaks for the shop and the server. */
export default function CharactersEditor({ guildId, value, onChange, enemies, quests }: {
  guildId: string;
  value: CharactersConfig | undefined;
  onChange: (next: CharactersConfig) => void;
  enemies: Named;
  quests: Named;
}) {
  const v = value ?? { list: {} };
  const list = v.list ?? {};
  const upsert = (c: CharacterConfig) => onChange({ ...v, list: { ...list, [c.id]: c } });
  const options = [{ value: "", label: "Nobody: the bot" }, ...Object.values(list).map((c) => ({ value: c.id, label: c.name || c.id }))];
  const speaksFor = (id: string) => [
    ...(v.shopkeeperId === id ? ["the shop"] : []),
    ...(v.announcerId === id ? ["announcements"] : []),
    ...Object.values(enemies).filter((e) => e.characterId === id).map((e) => `${e.emoji ?? ""} ${e.name}`.trim()),
    ...Object.values(quests).filter((q) => q.characterId === id).map((q) => `the quest ${q.name}`),
  ];

  return (
    <div className="space-y-4">
      <Section
        title="Who speaks for the server"
        description="Public posts come from these characters, under their own name and picture, instead of the bot. Give havocish the Manage Webhooks permission for the full effect; without it, their name and picture sit at the top of the bot's post."
      >
        <FieldGrid>
          <SelectField label="Shopkeeper" value={v.shopkeeperId ?? ""} options={options} onChange={(id) => onChange({ ...v, shopkeeperId: id || null })} hint="Announces rare finds." />
          <SelectField label="Announcer" value={v.announcerId ?? ""} options={options} onChange={(id) => onChange({ ...v, announcerId: id || null })} hint="Level-ups, achievements, collection milestones, streaks, and quests without their own giver." />
        </FieldGrid>
      </Section>

      <Section
        title="Characters"
        description="Shopkeepers, quest givers, villains. An enemy or a quest picks its character on its own page: an enemy with one turns up in its own voice, a quest's giver announces it done."
      >
        <ContentBrowser<CharacterConfig>
          entries={Object.entries(list).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]))}
          newLabel="New character"
          empty="No characters yet. Until you make one, the bot posts everything itself."
          look={(id, c) => ({ icon: isLink(c.avatar ?? "") ? "🖼️" : c.avatar || "🙂", label: c.name || id })}
          tooltip={(id, c) => {
            const roles = speaksFor(id);
            return <EntryTooltip title={c.name || id} lines={[roles.length ? `Speaks for ${roles.join(", ")}` : "Not speaking for anything yet", c.lines?.filter(Boolean).length ? `${c.lines.filter(Boolean).length} lines` : null]} />;
          }}
          onCreate={(name) => {
            const id = idFromName(name, Object.keys(list));
            upsert({ id, name, avatar: "🙂" });
            return id;
          }}
          onRemove={(id) => {
            const next = { ...list };
            delete next[id];
            onChange({ ...v, list: next, shopkeeperId: v.shopkeeperId === id ? null : v.shopkeeperId, announcerId: v.announcerId === id ? null : v.announcerId });
          }}
          renderItem={(id, c) => {
            const roles = speaksFor(id);
            return (
              <div className="space-y-4">
                <Preview c={c} />
                <FieldGrid>
                  <TextField label="Name" value={c.name} onChange={(name) => upsert({ ...c, name })} />
                  <Field label="Picture" hint="An emoji, a link to an image, or upload one (PNG, JPEG, GIF or WebP, up to 512 KB).">
                    <div className="flex items-center gap-3">
                      <Avatar avatar={c.avatar} size={36} />
                      <input
                        value={c.avatar ?? ""}
                        onChange={(e) => upsert({ ...c, avatar: e.target.value })}
                        placeholder="🧙 or https://…"
                        className="min-w-0 flex-1 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm"
                      />
                    </div>
                    <div className="mt-2"><UploadButton guildId={guildId} onUploaded={(url) => upsert({ ...c, avatar: url })} /></div>
                  </Field>
                  <TextAreaField
                    label="Lines"
                    rows={4}
                    value={(c.lines ?? []).join("\n")}
                    onChange={(text) => upsert({ ...c, lines: text.split("\n") })}
                    placeholder={"Kneel, little lights.\nMy throne hungers."}
                    hint="One per line. When they turn up (an enemy appearing, a boss arriving) they say one, at random."
                  />
                </FieldGrid>
                <p className="text-sm text-[var(--muted)]">{roles.length ? `Speaks for ${roles.join(", ")}.` : "Not speaking for anything yet: pick them above, or on an enemy or quest."}</p>
                <p className="font-mono text-xs text-[var(--muted)]">id: {id}</p>
              </div>
            );
          }}
        />
      </Section>
    </div>
  );
}
