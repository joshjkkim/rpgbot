"use client";

import { Plus, Trash2 } from "lucide-react";
import { Field, FieldGrid, NumberField, Section, SelectField } from "@/app/components/ui/form";
import { ChannelField, ItemField, RoleField } from "@/app/components/ui/pickers";
import type { LevelAction } from "@/app/components/levels/levelsEditor";

/** Mirrored from havocish/src/types/guild.ts. */
export type RoleRewardsConfig = { channelId?: string | null; roles: Record<string, LevelAction[]> };

const REWARD_TYPES = [
  { value: "giveGold" as const, label: "Give gold" },
  { value: "giveItem" as const, label: "Give item" },
  { value: "giveCombatXp" as const, label: "Give Combat XP" },
];

/**
 * Rewards for getting a role, from anywhere: another leveling bot's level roles,
 * a booster role, a role a mod hands out. Each member is paid once per role.
 */
export default function RoleRewardsEditor({
  value,
  onChange,
  shopItems,
}: {
  value: RoleRewardsConfig | undefined;
  onChange: (next: RoleRewardsConfig) => void;
  shopItems: Record<string, { name?: string; emoji?: string }>;
}) {
  const v = value ?? { roles: {} };
  const roles = v.roles ?? {};
  const setRoles = (next: Record<string, LevelAction[]>) => onChange({ ...v, roles: next });
  const setActions = (roleId: string, actions: LevelAction[]) => setRoles({ ...roles, [roleId]: actions });

  return (
    <Section
      title="Role rewards"
      description="Gold, items or Combat XP when a member gets a role, from any bot or a mod. Use another leveling bot? Reward the roles it gives at levels. Each member is paid once per role, and members who already have one get it next time they chat."
    >
      <div className="space-y-4">
        <ChannelField
          label="Announce in"
          value={v.channelId ?? ""}
          onChange={(c) => onChange({ ...v, channelId: c || null })}
          emptyLabel="Nowhere (rewards arrive quietly)"
        />

        {Object.entries(roles).map(([roleId, actions]) => (
          <div key={roleId || "new"} className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <RoleField
                  label="When a member gets"
                  value={roleId}
                  emptyLabel="Choose a role"
                  onChange={(next) => {
                    if (!next || next === roleId || roles[next]) return;
                    const { [roleId]: moved, ...rest } = roles;
                    setRoles({ ...rest, [next]: moved ?? [] });
                  }}
                />
              </div>
              <button
                type="button"
                aria-label="Remove role reward"
                onClick={() => setRoles(Object.fromEntries(Object.entries(roles).filter(([id]) => id !== roleId)))}
                className="mb-2.5 text-[var(--muted)] transition-colors hover:text-red-400"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {actions.map((a, i) => {
              const patch = (p: Partial<LevelAction>) => setActions(roleId, actions.map((x, j) => (j === i ? { ...x, ...p } : x)));
              return (
                <FieldGrid key={i}>
                  <SelectField label="Reward" value={a.type} options={REWARD_TYPES} onChange={(t) => patch({ type: t })} />
                  {a.type === "giveItem" ? (
                    <>
                      <ItemField items={shopItems} label="Item" value={a.itemId ?? ""} onChange={(id) => patch({ itemId: id })} emptyLabel="Choose an item" />
                      <NumberField label="Quantity" value={a.quantity ?? 1} min={1} onChange={(q) => patch({ quantity: q })} />
                    </>
                  ) : (
                    <NumberField label="Amount" value={a.amount ?? 0} min={0} onChange={(n) => patch({ amount: n })} />
                  )}
                  <Field>
                    <button
                      type="button"
                      onClick={() => setActions(roleId, actions.filter((_, j) => j !== i))}
                      className="text-sm text-[var(--muted)] transition-colors hover:text-red-400"
                    >
                      Remove reward
                    </button>
                  </Field>
                </FieldGrid>
              );
            })}

            <button
              type="button"
              onClick={() => setActions(roleId, [...actions, { type: "giveGold", amount: 100 }])}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
            >
              <Plus size={14} /> Add reward
            </button>
          </div>
        ))}

        {!("" in roles) && (
          <button
            type="button"
            onClick={() => setRoles({ ...roles, "": [{ type: "giveGold", amount: 100 }] })}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
          >
            <Plus size={14} /> Add a role reward
          </button>
        )}
      </div>
    </Section>
  );
}
