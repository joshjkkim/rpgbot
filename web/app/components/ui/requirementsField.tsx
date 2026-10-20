"use client";

import { Plus, Trash2 } from "lucide-react";
import { Field, FieldGrid, NumberField, SelectField, Toggle } from "@/app/components/ui/form";
import { RolesField } from "@/app/components/ui/pickers";

/** Mirrored from havocish/src/types/requirements.ts. All set conditions must hold; roles are "any one of". */
export interface Requirements {
  chatLevel?: number;
  skills?: Record<string, number>;
  roles?: string[];
  memberDays?: number;
  booster?: boolean;
}

/** Skills a requirement can name: gathering activities and crafting stations. */
export type SkillOption = { id: string; name: string };

/** Drops empty conditions, so an untouched block saves as nothing. */
function tidy(r: Requirements): Requirements | undefined {
  const out: Requirements = {};
  if (r.chatLevel) out.chatLevel = r.chatLevel;
  if (r.skills && Object.keys(r.skills).length) out.skills = r.skills;
  if (r.roles?.length) out.roles = r.roles;
  if (r.memberDays) out.memberDays = r.memberDays;
  if (r.booster) out.booster = true;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Who can use something: the same block on items, gathering locations, crafting
 * recipes, enemies and quests. Roles are how havocish works with other leveling
 * bots: they give roles at levels, and a requirement can ask for one.
 */
export default function RequirementsField({
  value,
  onChange,
  skills,
  hint,
}: {
  value: Requirements | undefined;
  onChange: (next: Requirements | undefined) => void;
  skills: SkillOption[];
  hint?: string;
}) {
  const r = value ?? {};
  const set = (patch: Partial<Requirements>) => onChange(tidy({ ...r, ...patch }));
  const skillRows = Object.entries(r.skills ?? {});
  const free = skills.filter((s) => !(s.id in (r.skills ?? {})));

  return (
    <Field label="Requirements" hint={hint ?? "Everything set here must be met. Leave it all empty for no requirements."}>
      <div className="space-y-4 rounded-sm border border-[var(--border)] bg-black/20 p-3">
        <FieldGrid>
          <RolesField
            wide
            label="Has any of these roles"
            value={r.roles ?? []}
            onChange={(v) => set({ roles: v })}
            hint="Works with any leveling bot: pick the role it gives at a level."
          />
          <NumberField label="Days in the server" value={r.memberDays ?? 0} min={0} onChange={(v) => set({ memberDays: v })} hint="0 means no minimum." />
          <NumberField label="Chat level" value={r.chatLevel ?? 0} min={0} onChange={(v) => set({ chatLevel: v })} hint="havocish's own level. 0 means none." />
        </FieldGrid>
        <Toggle label="Server boosters only" checked={!!r.booster} onChange={(v) => set({ booster: v })} />

        {skills.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Skill levels</p>
            {skillRows.map(([id, level]) => (
              <div key={id} className="flex items-end gap-2">
                <div className="flex-1">
                  <SelectField
                    value={id}
                    options={[{ value: id, label: skills.find((s) => s.id === id)?.name ?? `${id} (deleted)` }, ...free.map((s) => ({ value: s.id, label: s.name }))]}
                    onChange={(next) => {
                      const map = { ...(r.skills ?? {}) };
                      delete map[id];
                      map[next] = level;
                      set({ skills: map });
                    }}
                  />
                </div>
                <div className="w-24">
                  <NumberField value={level} min={1} onChange={(v) => set({ skills: { ...(r.skills ?? {}), [id]: v } })} />
                </div>
                <button
                  type="button"
                  aria-label="Remove skill requirement"
                  onClick={() => {
                    const map = { ...(r.skills ?? {}) };
                    delete map[id];
                    set({ skills: map });
                  }}
                  className="mb-2.5 text-[var(--muted)] transition-colors hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {free.length > 0 && (
              <button
                type="button"
                onClick={() => set({ skills: { ...(r.skills ?? {}), [free[0]!.id]: 10 } })}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
              >
                <Plus size={14} /> Add a skill requirement
              </button>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}

/** Every gathering activity and crafting station, as skill options. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped config JSON
export function skillOptions(config: Record<string, any> | null | undefined): SkillOption[] {
  const fromMap = (m: Record<string, { skillName?: string; name?: string }> | undefined) =>
    Object.entries(m ?? {}).map(([id, x]) => ({ id, name: x.skillName || x.name || id }));
  return [...fromMap(config?.gathering?.activities), ...fromMap(config?.crafting?.stations)];
}
