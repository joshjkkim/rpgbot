"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FieldGrid,
  KeyedList,
  NumberField,
  Section,
  TextAreaField,
  TextField,
  Toggle,
} from "@/app/components/ui/form";
import type { ItemRarity } from "./itemTooltip";
import type { Requirements } from "@/app/components/ui/requirementsField";
import Link from "next/link";
import ShopPreview from "./shopPreview";
import { ChannelField, RolesField } from "@/app/components/ui/pickers";

type EquipSlot =
  | "head" | "body" | "legs" | "feet" | "hands"
  | "weapon" | "shield" | "accessory" | "aura";

export interface shopItemAction {
  type: "assignRole" | "removeRole" | "sendMessage" | "giveStat" | "giveItem" | "learnRecipe" | "learnMove";
  roleId?: string;
  message?: string;
  channelId?: string;
  itemId?: string;
  quantity?: number;
  statId?: string;
  amount?: number;
  /** learnRecipe: the station and its hidden recipe the item teaches. */
  stationId?: string;
  recipeId?: string;
  /** learnMove: the fight move the item teaches. */
  moveId?: string;
}


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
  /** Fight moves it gives while equipped. */
  moves?: string[];
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
  rarity?: ItemRarity;
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
  /** Most one member can buy per day (UTC). */
  dailyLimit?: number;
  /** A gathering tool (mirrored from havocish/src/types/economy.ts). */
  tool?: { activityId: string; tier: number; bonus: number };
  requirements?: Requirements;
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
  /** For the link to the Items page. */
  guildId: string;
  /** For the preview's header and prices. */
  serverName: string;
  goldIcon: string;
};






export default function ShopEconomyEditor({ value, onChange, guildId, serverName, goldIcon }: Props) {
  const [local, setLocal] = useState<ShopConfig>(value ?? {});

  useEffect(() => {
    setLocal(value ?? {});
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


  const categoryEntries = useMemo(
    () =>
      Object.entries(local.categories ?? {}).sort((a, b) => {
        const ao = a[1].sortOrder ?? 0;
        const bo = b[1].sortOrder ?? 0;
        return ao !== bo ? ao - bo : (a[1].name || a[0]).localeCompare(b[1].name || b[0]);
      }),
    [local.categories]
  );




  return (
    <div className="space-y-4">
      <Section title="Preview" description="/shop as members see it, before you save. Click Browse to open a category.">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
          <ShopPreview shop={local} goldIcon={goldIcon} serverName={serverName} />
          <p className="text-sm leading-6 text-[var(--muted)]">
            Items are made on the <Link href={`/dashboard/${guildId}/items`} className="text-[var(--accent)] underline">Items</Link> page.
            Anything with a price that isn&apos;t hidden shows here, in its category. Categories are listed by their sort order.
          </p>
        </div>
      </Section>

      <Section title="General" description="Whether the shop is open, and how gifting works." defaultOpen={!local.enabled}>
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
            <ChannelField
              label="Gift announce channel"
              value={local.gifting?.announceChannel ?? ""}
              onChange={(v) => updateGifting({ announceChannel: v.trim() || null })}
              emptyLabel="Don't announce"
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

      <Section advanced title="Categories" description="How the shop is grouped." defaultOpen={false}>
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
                <RolesField
                  label="Required roles"
                  value={category.roleRequiredIds ?? []}
                  onChange={(v) => upsertCategory({ ...category, roleRequiredIds: v })}
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

    </div>
  );
}
