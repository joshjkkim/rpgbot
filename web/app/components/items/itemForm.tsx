"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Field, FieldGrid, NumberField, SelectField, TextAreaField, TextField, Toggle } from "@/app/components/ui/form";
import { ChannelField, ItemField, RoleField } from "@/app/components/ui/pickers";
import RequirementsField, { type SkillOption } from "@/app/components/ui/requirementsField";
import { RARITIES } from "@/app/components/shop/itemTooltip";
import type { ShopConfig, shopItemAction, shopItemConfig } from "@/app/components/shop/shopBasicsEditor";

/*
 * One item's fields, split into tabs so the form reads in parts instead of one
 * long scroll. Moved from the Economy page when items got their own page.
 */

export const ITEM_ACTION_TYPES = [
  { value: "assignRole" as const, label: "Assign role" },
  { value: "removeRole" as const, label: "Remove role" },
  { value: "sendMessage" as const, label: "Send message" },
  { value: "giveStat" as const, label: "Give stat" },
  { value: "giveItem" as const, label: "Give item" },
];

const EQUIP_SLOTS = [
  { value: "head" as const, label: "Head" },
  { value: "body" as const, label: "Body" },
  { value: "legs" as const, label: "Legs" },
  { value: "feet" as const, label: "Feet" },
  { value: "hands" as const, label: "Hands" },
  { value: "weapon" as const, label: "Weapon" },
  { value: "shield" as const, label: "Shield" },
  { value: "accessory" as const, label: "Accessory" },
  { value: "aura" as const, label: "Aura" },
];

const FONT_PRESETS = [
  { value: "inter" as const, label: "Inter" },
  { value: "sora" as const, label: "Sora" },
  { value: "nunito" as const, label: "Nunito" },
];

function toCsv(ids?: string[]) {
  return (ids ?? []).join(", ");
}

function fromCsv(s: string) {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

export /**
 * Drops item effects the bot no longer runs.
 *
 * `runCommand` was offered here and saved into configs, but /use never had a
 * branch for it, so the effect silently did nothing. Filtering on load stops a
 * stored one rendering as a type with no matching option, and the next save
 * writes the config back without it.
 */
function dropRetiredActions(config: ShopConfig): ShopConfig {
  const items = config.items;
  if (!items) return config;

  const known = ITEM_ACTION_TYPES.map((t) => t.value) as string[];
  const cleaned: Record<string, shopItemConfig> = {};

  for (const [id, item] of Object.entries(items)) {
    const entries = Object.entries(item?.actions ?? {});
    const kept = entries.filter(([, a]) => known.includes(a?.type));

    if (kept.length === entries.length) {
      cleaned[id] = item;
      continue;
    }

    // The bot keys actions by index, so reindex rather than leaving a hole.
    const actions: Record<number, shopItemAction> = {};
    kept.forEach(([, a], i) => {
      actions[i] = a;
    });
    cleaned[id] = { ...item, actions };
  }

  return { ...config, items: cleaned };
}

type ItemEffects = NonNullable<shopItemConfig["effects"]>;

const TABS = [
  { id: "basics", label: "Basics" },
  { id: "availability", label: "Availability" },
  { id: "gear", label: "Gear and stats" },
  { id: "use", label: "Use effects" },
  { id: "tool", label: "Tool" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function ItemForm({
  item,
  onChange,
  allItems,
  categoryOptions,
  activities,
  skills,
}: {
  item: shopItemConfig;
  onChange: (next: shopItemConfig) => void;
  /** Every item, for the "give item" action's picker. */
  allItems: Record<string, { name?: string; emoji?: string }>;
  categoryOptions: ReadonlyArray<{ value: string; label: string }>;
  /** Gathering activities, so an item can be a tool for one. */
  activities: Record<string, { name?: string; emoji?: string }>;
  /** Skills a requirement can name. */
  skills: SkillOption[];
}) {
  const [tab, setTab] = useState<Tab>("basics");
  const upsertItem = onChange;
  const actions = item.actions ?? {};
  const actionKeys = Object.keys(actions).map(Number).sort((a, b) => a - b);
  const effects: ItemEffects = item.effects ?? {};
  const patchEffects = (p: Partial<ItemEffects>) => upsertItem({ ...item, effects: { ...effects, ...p } });
  const tabs = TABS.filter((t) => t.id !== "tool" || Object.keys(activities).length > 0);

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[var(--border)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm transition-colors ${
              tab === t.id ? "border-[var(--accent)] text-[var(--gold)]" : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "basics" && (
        <div className="space-y-4">
          <FieldGrid>
            <TextField label="Name" value={item.name} onChange={(v) => upsertItem({ ...item, name: v })} />
            <TextField
              label="Emoji"
              value={item.emoji ?? ""}
              onChange={(v) => upsertItem({ ...item, emoji: v })}
            />
            <SelectField
              label="Rarity"
              value={item.rarity ?? "common"}
              onChange={(v) => upsertItem({ ...item, rarity: v })}
              options={RARITIES}
              hint="Only colours the name."
            />
            <SelectField
              label="Category"
              value={item.categoryId ?? ""}
              onChange={(v) => upsertItem({ ...item, categoryId: v })}
              options={categoryOptions}
            />
            <NumberField
              label="Price"
              value={item.price ?? 0}
              min={0}
              onChange={(v) => upsertItem({ ...item, price: v })}
            />
            <TextAreaField
              label="Description"
              value={item.description ?? ""}
              onChange={(v) => upsertItem({ ...item, description: v })}
              rows={2}
            />
          </FieldGrid>

        </div>
      )}

      {tab === "availability" && (
        <div className="space-y-4">
          <Field label="Availability">
            <FieldGrid>
              <NumberField
                label="Sell price"
                value={item.sellPrice ?? 0}
                min={0}
                onChange={(v) => upsertItem({ ...item, sellPrice: v > 0 ? v : null })}
                hint="0 means it cannot be sold back."
              />
              <NumberField
                label="Stock"
                value={item.stock ?? 0}
                min={0}
                onChange={(v) => upsertItem({ ...item, stock: v > 0 ? v : null })}
                hint="0 means unlimited."
              />
              <NumberField
                label="Max per member"
                value={item.maxPerUser ?? 0}
                min={0}
                onChange={(v) => upsertItem({ ...item, maxPerUser: v })}
                hint="0 means no cap."
              />
            </FieldGrid>
          </Field>

          {/* The item's old level and role fields are shown here and moved into requirements on the first edit. */}
          <RequirementsField
            value={{
              ...item.requirements,
              ...(item.minLevel ? { chatLevel: Math.max(item.minLevel, item.requirements?.chatLevel ?? 0) } : {}),
              ...(item.requiresRoleIds?.length ? { roles: [...new Set([...(item.requirements?.roles ?? []), ...item.requiresRoleIds])] } : {}),
            }}
            onChange={(next) => upsertItem({ ...item, requirements: next, minLevel: undefined, requiresRoleIds: undefined })}
            skills={skills}
            hint="Who can buy, use or equip it. Everything set here must be met."
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle label="Hidden" checked={!!item.hidden} onChange={(v) => upsertItem({ ...item, hidden: v })} />
            <Toggle
              label="Permanent"
              checked={!!item.permanent}
              onChange={(v) => upsertItem({ ...item, permanent: v })}
              hint="Not consumed when used."
            />
            <Toggle
              label="Tradeable"
              checked={!!item.tradeable}
              onChange={(v) => upsertItem({ ...item, tradeable: v })}
            />
          </div>

        </div>
      )}

      {tab === "gear" && (
        <div className="space-y-4">
          <Toggle
            label="Equipable"
            checked={!!item.equipable}
            onChange={(v) => upsertItem({ ...item, equipable: v })}
            hint="Stats, boosts and cosmetics only apply while the item is worn."
          />
          {item.equipable && (
            <FieldGrid>
              <SelectField
                label="Equipment slot"
                value={item.equipSlot ?? "accessory"}
                onChange={(v) => upsertItem({ ...item, equipSlot: v })}
                options={EQUIP_SLOTS}
              />
            </FieldGrid>
          )}

          <Field label="Equipped stat bonuses">
            <FieldGrid>
              {(["hp", "atk", "def", "spd", "crit"] as const).map((stat) => (
                <NumberField
                  key={stat}
                  label={stat.toUpperCase()}
                  value={effects.stats?.[stat] ?? 0}
                  step={stat === "crit" ? 0.01 : 1}
                  onChange={(v) => patchEffects({ stats: { ...(effects.stats ?? {}), [stat]: v } })}
                />
              ))}
            </FieldGrid>
          </Field>

          <Field label="Boosts">
            <FieldGrid>
              <NumberField
                label="XP multiplier"
                value={effects.boosts?.xpMultiplier ?? 1}
                step={0.1}
                min={0}
                onChange={(v) =>
                  patchEffects({ boosts: { ...(effects.boosts ?? {}), xpMultiplier: v } })
                }
              />
              <NumberField
                label="Gold multiplier"
                value={effects.boosts?.goldMultiplier ?? 1}
                step={0.1}
                min={0}
                onChange={(v) =>
                  patchEffects({ boosts: { ...(effects.boosts ?? {}), goldMultiplier: v } })
                }
              />
            </FieldGrid>
          </Field>

          <Field label="Cosmetic">
            <FieldGrid>
              <TextField
                label="Title"
                value={effects.cosmetic?.title ?? ""}
                onChange={(v) => patchEffects({ cosmetic: { ...(effects.cosmetic ?? {}), title: v } })}
              />
              <TextField
                label="Name emoji"
                value={effects.cosmetic?.nameEmoji ?? ""}
                onChange={(v) =>
                  patchEffects({ cosmetic: { ...(effects.cosmetic ?? {}), nameEmoji: v } })
                }
              />
              <TextField
                label="Accent hex"
                value={effects.cosmetic?.accentHex ?? ""}
                onChange={(v) =>
                  patchEffects({ cosmetic: { ...(effects.cosmetic ?? {}), accentHex: v } })
                }
                placeholder="#00AE86"
                mono
              />
              <TextField
                label="Text hex"
                value={effects.cosmetic?.textHex ?? ""}
                onChange={(v) =>
                  patchEffects({ cosmetic: { ...(effects.cosmetic ?? {}), textHex: v } })
                }
                placeholder="#FFFFFF"
                mono
              />
              <SelectField
                label="Font"
                value={effects.cosmetic?.fontPreset ?? "inter"}
                onChange={(v) =>
                  patchEffects({ cosmetic: { ...(effects.cosmetic ?? {}), fontPreset: v } })
                }
                options={FONT_PRESETS}
              />
              <TextField
                label="Unlocks quest IDs"
                value={toCsv(effects.quest?.canStartQuestIds)}
                onChange={(v) => patchEffects({ quest: { canStartQuestIds: fromCsv(v) } })}
                placeholder="Comma-separated"
                mono
              />
            </FieldGrid>
          </Field>

        </div>
      )}

      {tab === "use" && (
        <div className="space-y-4">
          <Field label="Actions on use">
            <div className="space-y-3">
              {actionKeys.length === 0 && (
                <p className="text-xs text-[var(--muted)]">
                  Nothing happens when this item is used.
                </p>
              )}

              {actionKeys.map((key) => {
                const action = actions[key] ?? { type: "sendMessage" as const };
                const patch = (p: Partial<shopItemAction>) =>
                  upsertItem({ ...item, actions: { ...actions, [key]: { ...action, ...p } } });

                return (
                  <div
                    key={key}
                    className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs text-[var(--muted)]">Action {key}</span>
                      <button
                        type="button"
                        aria-label="Remove action"
                        onClick={() => {
                          const next = { ...actions };
                          delete next[key];
                          upsertItem({ ...item, actions: next });
                        }}
                        className="text-[var(--muted)] transition-colors hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <FieldGrid>
                      <SelectField
                        label="Type"
                        value={action.type}
                        onChange={(v) => patch({ type: v })}
                        options={ITEM_ACTION_TYPES}
                      />

                      {(action.type === "assignRole" || action.type === "removeRole") && (
                        <RoleField
                          label="Role"
                          value={action.roleId ?? ""}
                          onChange={(v) => patch({ roleId: v })}
                        />
                      )}

                      {action.type === "sendMessage" && (
                        <>
                          <ChannelField
                            label="Channel"
                            value={action.channelId ?? ""}
                            onChange={(v) => patch({ channelId: v })}
                          />
                          <TextField
                            wide
                            label="Message"
                            value={action.message ?? ""}
                            onChange={(v) => patch({ message: v })}
                          />
                        </>
                      )}

                      {action.type === "giveStat" && (
                        <>
                          <TextField
                            label="Stat ID"
                            value={action.statId ?? ""}
                            onChange={(v) => patch({ statId: v })}
                            placeholder="gold, xp or health"
                            mono
                          />
                          <NumberField
                            label="Amount"
                            value={action.amount ?? 0}
                            onChange={(v) => patch({ amount: v })}
                          />
                        </>
                      )}

                      {action.type === "giveItem" && (
                        <>
                          <ItemField items={allItems}
                            label="Item"
                            value={action.itemId ?? ""}
                            onChange={(v) => patch({ itemId: v })}
                          />
                          <NumberField
                            label="Quantity"
                            value={action.quantity ?? 1}
                            min={1}
                            onChange={(v) => patch({ quantity: v })}
                          />
                        </>
                      )}
                    </FieldGrid>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  const nextKey = actionKeys.length ? Math.max(...actionKeys) + 1 : 0;
                  upsertItem({
                    ...item,
                    actions: { ...actions, [nextKey]: { type: "sendMessage", message: "" } },
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
              >
                <Plus size={14} /> Add action
              </button>
            </div>
          </Field>
        </div>
      )}

      {tab === "tool" && (
        <div className="space-y-4">
          
            <Field
              label="Gathering tool"
              hint="The best tool in a player's bag counts automatically, no equipping. Each bonus point is +1 try in Grid, +0.3 s in Timing, +1 s in Find it."
            >
              <FieldGrid>
                <SelectField
                  label="Tool for"
                  value={item.tool?.activityId ?? ""}
                  onChange={(v) => upsertItem({ ...item, tool: v ? { tier: 1, bonus: 1, ...item.tool, activityId: v } : undefined })}
                  options={[
                    { value: "", label: "Not a tool" },
                    ...Object.entries(activities).map(([id, a]) => ({ value: id, label: `${a.emoji ?? ""} ${a.name ?? id}`.trim() })),
                  ]}
                />
                {item.tool && (
                  <>
                    <NumberField
                      label="Tier"
                      value={item.tool.tier ?? 1}
                      min={1}
                      onChange={(v) => upsertItem({ ...item, tool: { ...item.tool!, tier: v } })}
                      hint="Locations can need a minimum tier."
                    />
                    <NumberField
                      label="Bonus"
                      value={item.tool.bonus ?? 0}
                      min={0}
                      onChange={(v) => upsertItem({ ...item, tool: { ...item.tool!, bonus: v } })}
                    />
                  </>
                )}
              </FieldGrid>
            </Field>
          
        </div>
      )}
    </div>
  );
}
