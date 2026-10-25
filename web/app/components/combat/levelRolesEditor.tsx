"use client";

import { Plus, Trash2 } from "lucide-react";
import { NumberField, Section, SelectField } from "@/app/components/ui/form";
import { ChannelField, RoleField } from "@/app/components/ui/pickers";
import { idFromName } from "@/app/components/ui/slots";
import type { Requirements, SkillOption } from "@/app/components/ui/requirementsField";

// Mirrored from havocish/src/types/guild.ts (UnlockConfig). The bot calls these unlocks.
export type UnlockConfig = { id: string; roleId: string; requirements?: Requirements; placeId?: string };
export type UnlocksConfig = { list: Record<string, UnlockConfig>; channelId?: string | null };

/** The level an unlock asks for: Combat, or one skill. */
function levelOf(u: UnlockConfig): { track: string; level: number } {
  const r = u.requirements ?? {};
  if (r.combatLevel) return { track: "combat", level: r.combatLevel };
  const [skill, level] = Object.entries(r.skills ?? {})[0] ?? ["combat", 1];
  return { track: skill, level };
}

/**
 * Roles at Combat and skill levels: "At Combat 14 give @Crypt Dweller". Hide a
 * place's channels behind the role and they appear when it's earned.
 */
export default function LevelRolesEditor({ value, onChange, skills, places }: {
  value: UnlocksConfig | undefined;
  onChange: (next: UnlocksConfig) => void;
  skills: SkillOption[];
  places: Record<string, { name?: string; emoji?: string }>;
}) {
  const list = value?.list ?? {};
  const rows = Object.values(list).sort((a, b) => levelOf(a).level - levelOf(b).level);
  const put = (u: UnlockConfig) => onChange({ ...value, list: { ...list, [u.id]: u } });
  const remove = (id: string) => {
    const next = { ...list };
    delete next[id];
    onChange({ ...value, list: next });
  };
  const tracks = [{ value: "combat", label: "Combat" }, ...skills.map((s) => ({ value: s.id, label: s.name }))];
  const placeOptions = [{ value: "", label: "Nothing in particular" }, ...Object.entries(places).map(([id, p]) => ({ value: id, label: `${p.emoji ?? ""} ${p.name ?? id}`.trim() }))];

  return (
    <Section
      title="Roles at levels"
      description="Give a role when a member reaches a Combat or skill level. To make a place open at that level, hide its channels from everyone without the role in Discord: they appear the moment it's earned. Roles are never taken away."
    >
      <div className="space-y-3">
        {rows.map((u) => {
          const { track, level } = levelOf(u);
          const setLevel = (t: string, n: number) => put({ ...u, requirements: t === "combat" ? { combatLevel: n } : { skills: { [t]: n } } });
          return (
            <div key={u.id} className="flex flex-wrap items-end gap-3 rounded-sm border border-[var(--border)] bg-black/20 p-3">
              <span className="mb-2 text-sm">At</span>
              <div className="w-36"><SelectField value={track} options={tracks} onChange={(t) => setLevel(t, level)} /></div>
              <span className="mb-2 text-sm">level</span>
              <div className="w-20"><NumberField value={level} min={1} onChange={(n) => setLevel(track, n)} /></div>
              <span className="mb-2 text-sm">give</span>
              <div className="min-w-44 flex-1"><RoleField value={u.roleId} emptyLabel="Pick a role" onChange={(roleId) => put({ ...u, roleId })} /></div>
              <div className="w-56">
                <SelectField label="Announce as opening" value={u.placeId ?? ""} options={placeOptions} onChange={(placeId) => put({ ...u, placeId: placeId || undefined })} />
              </div>
              <button type="button" aria-label="Remove" onClick={() => remove(u.id)} className="mb-2.5 text-[var(--muted)] transition-colors hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => put({ id: idFromName(`combat ${rows.length + 1}`, Object.keys(list)), roleId: "", requirements: { combatLevel: 10 } })}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
        >
          <Plus size={14} /> Add a role at a level
        </button>
        <ChannelField
          label="Announce in"
          value={value?.channelId ?? ""}
          onChange={(ch) => onChange({ list, ...value, channelId: ch || null })}
          emptyLabel="Where it happened"
          hint="“🗺️ @member unlocked ⚰️ The Barrow Crypt!”, or the role's name when it opens nothing in particular. From your announcer character if you have one."
        />
      </div>
    </Section>
  );
}
