"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Field,
  FieldGrid,
  KeyedList,
  NumberField,
  Section,
  SelectField,
  TextAreaField,
  TextField,
  Toggle,
} from "@/app/components/ui/form";

type EquipSlot =
  | "head" | "body" | "legs" | "feet" | "hands"
  | "weapon" | "shield" | "accessory" | "aura";

export interface shopItemAction {
  type: "assignRole" | "removeRole" | "sendMessage" | "giveStat" | "giveItem";
  roleId?: string;
  message?: string;
  channelId?: string;
  itemId?: string;
  quantity?: number;
  statId?: string;
  amount?: number;
}

const ITEM_ACTION_TYPES = [
  { value: "assignRole" as const, label: "Assign role" },
  { value: "removeRole" as const, label: "Remove role" },
  { value: "sendMessage" as const, label: "Send message" },
  { value: "giveStat" as const, label: "Give stat" },
  { value: "giveItem" as const, label: "Give item" },
];

type ItemEffects = {
  cosmetic?: {
    accentHex?: string;
    textHex?: string;
    title?: string;
    nameEmoji?: string;
    fontPreset?: "inter" | "sora" | "nunito";
  };
  boosts?: {
    xpMultiplier?: number;
    goldMultiplier?: number;
  };
  quest?: {
    canStartQuestIds?: string[];
  };
  stats?: {
    hp?: number;
    atk?: number;
    def?: number;
    spd?: number;
    crit?: number;
  };
};

export interface shopCategoryConfig {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  sortOrder?: number;
  hidden?: boolean;
  roleRequiredIds?: string[];
}

export interface shopItemConfig {
  id: string;
  name: string;
  emoji?: string;
  description?: string;
  categoryId: string;
  equipable?: boolean;
  equipSlot?: EquipSlot;
  price: number;
  sellPrice?: number | null;
  minLevel?: number;
  requiresRoleIds?: string[];
  maxPerUser?: number;
  stock?: number | null;
  hidden?: boolean;
  permanent?: boolean;
  tradeable?: boolean;
  actions?: Record<number, shopItemAction>;
  effects?: ItemEffects;
}

export type ShopConfig = {
  enabled?: boolean;
  categories?: Record<string, shopCategoryConfig>;
  items?: Record<string, shopItemConfig>;
  gifting?: {
    enabled: boolean;
    message: string | null;
    announceChannel: string | null;
    dm: boolean;
    levelReq: number;
  };
};

type Props = {
  value: ShopConfig | null | undefined;
  onChange: (next: ShopConfig) => void;
};

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

/**
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

export default function ShopEconomyEditor({ value, onChange }: Props) {
  const [local, setLocal] = useState<ShopConfig>(dropRetiredActions(value ?? {}));

  useEffect(() => {
    setLocal(dropRetiredActions(value ?? {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  function commit(next: ShopConfig) {
    setLocal(next);
    onChange(next);
  }

  function updateRoot(patch: Partial<ShopConfig>) {
    commit({ ...local, ...patch });
  }

  function updateGifting(patch: Partial<NonNullable<ShopConfig["gifting"]>>) {
    updateRoot({
      gifting: {
        enabled: false,
        message: null,
        announceChannel: null,
        dm: false,
        levelReq: 0,
        ...(local.gifting ?? {}),
        ...patch,
      },
    });
  }

  function upsertCategory(category: shopCategoryConfig) {
    updateRoot({ categories: { ...(local.categories ?? {}), [category.id]: category } });
  }

  function upsertItem(item: shopItemConfig) {
    updateRoot({ items: { ...(local.items ?? {}), [item.id]: item } });
  }

  const categoryEntries = useMemo(
    () =>
      Object.entries(local.categories ?? {}).sort((a, b) => {
        const ao = a[1].sortOrder ?? 0;
        const bo = b[1].sortOrder ?? 0;
        return ao !== bo ? ao - bo : (a[1].name || a[0]).localeCompare(b[1].name || b[0]);
      }),
    [local.categories]
  );

  const itemEntries = useMemo(
    () =>
      Object.entries(local.items ?? {}).sort((a, b) =>
        (a[1].name || a[0]).localeCompare(b[1].name || b[0])
      ),
    [local.items]
  );

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "— none —" },
      ...categoryEntries.map(([id, c]) => ({ value: id, label: c.name || id })),
    ],
    [categoryEntries]
  );

  return (
    <div className="space-y-4">
      <Section title="General" description="Whether the shop is open, and how gifting works.">
        <Toggle
          label="Enable shop"
          checked={!!local.enabled}
          onChange={(v) => updateRoot({ enabled: v })}
        />

        <div className="mt-5 space-y-3">
          <Toggle
            label="Allow gifting"
            checked={!!local.gifting?.enabled}
            onChange={(v) => updateGifting({ enabled: v })}
            hint="Members can send items to each other."
          />
          <Toggle
            label="DM the receiver"
            checked={!!local.gifting?.dm}
            onChange={(v) => updateGifting({ dm: v })}
          />
        </div>

        <div className="mt-4">
          <FieldGrid>
            <NumberField
              label="Minimum level to gift"
              value={local.gifting?.levelReq ?? 0}
              min={0}
              onChange={(v) => updateGifting({ levelReq: v })}
            />
            <TextField
              label="Gift announce channel ID"
              value={local.gifting?.announceChannel ?? ""}
              onChange={(v) => updateGifting({ announceChannel: v.trim() || null })}
              placeholder="Leave blank to skip announcing"
              mono
            />
            <TextAreaField
              label="Gift message"
              value={local.gifting?.message ?? ""}
              onChange={(v) => updateGifting({ message: v || null })}
              rows={2}
            />
          </FieldGrid>
        </div>
      </Section>

      <Section title="Categories" description="How the shop is grouped." defaultOpen={false}>
        <KeyedList<shopCategoryConfig>
          entries={categoryEntries}
          addPlaceholder="Category ID, e.g. consumables"
          addLabel="Add category"
          empty="No categories. Items will be ungrouped."
          itemLabel={(id, c) => `${c.icon ?? ""} ${c.name || id}`.trim()}
          onAdd={(rawId) => {
            const id = rawId.trim();
            if (!/^[a-zA-Z0-9_-]{2,40}$/.test(id)) return;
            if ((local.categories ?? {})[id]) return;
            upsertCategory({ id, name: id, sortOrder: categoryEntries.length });
          }}
          onRemove={(id) => {
            const next = { ...(local.categories ?? {}) };
            delete next[id];
            updateRoot({ categories: next });
          }}
          renderItem={(id, category) => (
            <div className="space-y-4">
              <FieldGrid>
                <TextField
                  label="Name"
                  value={category.name}
                  onChange={(v) => upsertCategory({ ...category, name: v })}
                />
                <TextField
                  label="Icon"
                  value={category.icon ?? ""}
                  onChange={(v) => upsertCategory({ ...category, icon: v })}
                  placeholder="🧪"
                />
                <NumberField
                  label="Sort order"
                  value={category.sortOrder ?? 0}
                  onChange={(v) => upsertCategory({ ...category, sortOrder: v })}
                />
                <TextField
                  label="Required role IDs"
                  value={toCsv(category.roleRequiredIds)}
                  onChange={(v) => upsertCategory({ ...category, roleRequiredIds: fromCsv(v) })}
                  placeholder="Comma-separated, blank for anyone"
                  mono
                />
                <TextAreaField
                  label="Description"
                  value={category.description ?? ""}
                  onChange={(v) => upsertCategory({ ...category, description: v })}
                  rows={2}
                />
              </FieldGrid>

              <Toggle
                label="Hidden"
                checked={!!category.hidden}
                onChange={(v) => upsertCategory({ ...category, hidden: v })}
              />
            </div>
          )}
        />
      </Section>

      <Section title="Items" description="What is for sale, and what it does." defaultOpen={false}>
        <KeyedList<shopItemConfig>
          entries={itemEntries}
          addPlaceholder="Item ID, e.g. health-potion"
          addLabel="Add item"
          empty="No items for sale yet."
          itemLabel={(id, item) => `${item.emoji ?? ""} ${item.name || id}`.trim()}
          onAdd={(rawId) => {
            const id = rawId.trim();
            if (!/^[a-zA-Z0-9_-]{2,40}$/.test(id)) return;
            if ((local.items ?? {})[id]) return;
            upsertItem({ id, name: id, categoryId: categoryEntries[0]?.[0] ?? "", price: 100 });
          }}
          onRemove={(id) => {
            const next = { ...(local.items ?? {}) };
            delete next[id];
            updateRoot({ items: next });
          }}
          renderItem={(id, item) => {
            const actions = item.actions ?? {};
            const actionKeys = Object.keys(actions).map(Number).sort((a, b) => a - b);
            const effects = item.effects ?? {};

            const patchEffects = (p: Partial<ItemEffects>) =>
              upsertItem({ ...item, effects: { ...effects, ...p } });

            return (
              <div className="space-y-4">
                <FieldGrid>
                  <TextField label="Name" value={item.name} onChange={(v) => upsertItem({ ...item, name: v })} />
                  <TextField
                    label="Emoji"
                    value={item.emoji ?? ""}
                    onChange={(v) => upsertItem({ ...item, emoji: v })}
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
                      label="Minimum level"
                      value={item.minLevel ?? 0}
                      min={0}
                      onChange={(v) => upsertItem({ ...item, minLevel: v })}
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
                    <TextField
                      wide
                      label="Required role IDs"
                      value={toCsv(item.requiresRoleIds)}
                      onChange={(v) => upsertItem({ ...item, requiresRoleIds: fromCsv(v) })}
                      placeholder="Comma-separated, blank for anyone"
                      mono
                    />
                  </FieldGrid>
                </Field>

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
                  <Toggle
                    label="Equipable"
                    checked={!!item.equipable}
                    onChange={(v) => upsertItem({ ...item, equipable: v })}
                  />
                </div>

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
                              <TextField
                                label="Role ID"
                                value={action.roleId ?? ""}
                                onChange={(v) => patch({ roleId: v })}
                                mono
                              />
                            )}

                            {action.type === "sendMessage" && (
                              <>
                                <TextField
                                  label="Channel ID"
                                  value={action.channelId ?? ""}
                                  onChange={(v) => patch({ channelId: v })}
                                  mono
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
                                <TextField
                                  label="Item ID"
                                  value={action.itemId ?? ""}
                                  onChange={(v) => patch({ itemId: v })}
                                  mono
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
            );
          }}
        />
      </Section>
    </div>
  );
}
