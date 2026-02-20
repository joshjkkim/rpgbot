"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

type NewCategoryDraft = {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  sortOrder?: number;
  hidden?: boolean;
  roleRequiredIds?: string[];
};

type NewItemDraft = {
  id: string;
  name: string;
  emoji?: string;
  description?: string;
  categoryId: string;
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
};

function normalizeId(id: string) {
  return id.trim();
}

function isValidId(id: string) {
  return /^[a-zA-Z0-9_-]{2,40}$/.test(id);
}

export interface shopCategoryConfig {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  sortOrder?: number;

  hidden?: boolean;
  roleRequiredIds?: string[];
}

export interface shopItemAction {
  type: "assignRole" | "removeRole" | "sendMessage" | "runCommand" | "giveStat";
  roleId?: string;
  message?: string;
  channelId?: string;
  command?: string;
  statId?: string;
  amount?: number;
}

export interface shopItemConfig {
  id: string;
  name: string;
  emoji?: string;
  description?: string;

  categoryId: string;

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
}

export type ShopConfig = {
  enabled?: boolean;
  categories?: Record<string, shopCategoryConfig>;
  items?: Record<string, shopItemConfig>;
};

type Props = {
  value: ShopConfig | null | undefined;
  onChange: (next: ShopConfig) => void;
};

function toCsv(ids?: string[]) {
  return (ids ?? []).join(", ");
}
function fromCsv(s: string) {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
function safeNumber(s: string, fallback: number) {
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}
function nextId(prefix: string) {
  // simple unique-ish ID for UI creation (replace with your own if needed)
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}



export default function ShopEconomyEditor({ value, onChange }: Props) {
    const [newCategory, setNewCategory] = useState<NewCategoryDraft | null>(null);
    const [newItem, setNewItem] = useState<NewItemDraft | null>(null);

    const [createError, setCreateError] = useState<string | null>(null);
  const shop = value ?? {};
  const categories = shop.categories ?? {};
  const items = shop.items ?? {};

  const [expanded, setExpanded] = useState({
    general: true,
    categories: true,
    items: true,
  });

  // track which item/category is expanded for editing
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  // keep local copy so typing feels responsive even if parent re-renders
  const [local, setLocal] = useState<ShopConfig>(shop);

  useEffect(() => {
    setLocal(shop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  const localCategories = local.categories ?? {};
  const localItems = local.items ?? {};

  const sortedCategories = useMemo(() => {
    return Object.values(localCategories).sort((a, b) => {
      const ao = a.sortOrder ?? 0;
      const bo = b.sortOrder ?? 0;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
  }, [localCategories]);

  const sortedItems = useMemo(() => {
    return Object.values(localItems).sort((a, b) => {
      const an = a.name.localeCompare(b.name);
      if (an !== 0) return an;
      return a.id.localeCompare(b.id);
    });
  }, [localItems]);

  function commit(next: ShopConfig) {
    setLocal(next);
    onChange(next);
  }

  function updateShop(patch: Partial<ShopConfig>) {
    commit({ ...local, ...patch });
  }

  function updateCategory(id: string, patch: Partial<shopCategoryConfig>) {
  const curr = (local.categories ?? {})[id];
  if (!curr) return;

  const nextCats = { ...(local.categories ?? {}) };
  nextCats[id] = { ...curr, ...patch, id }; // lock
  commit({ ...local, categories: nextCats });
}

function updateItem(id: string, patch: Partial<shopItemConfig>) {
  const curr = (local.items ?? {})[id];
  if (!curr) return;

  const nextItems = { ...(local.items ?? {}) };
  nextItems[id] = { ...curr, ...patch, id }; // lock
  commit({ ...local, items: nextItems });
}


  function upsertCategory(cat: shopCategoryConfig) {
    const nextCats = { ...(local.categories ?? {}) };
    nextCats[cat.id] = cat;
    commit({ ...local, categories: nextCats });
  }

  function deleteCategory(id: string) {
    const nextCats = { ...(local.categories ?? {}) };
    delete nextCats[id];

    // also keep items intact; you might want to auto-migrate items off this category later
    commit({ ...local, categories: nextCats });
    if (openCategoryId === id) setOpenCategoryId(null);
  }

  function upsertItem(item: shopItemConfig) {
    const nextItems = { ...(local.items ?? {}) };
    nextItems[item.id] = item;
    commit({ ...local, items: nextItems });
  }

  function deleteItem(id: string) {
    const nextItems = { ...(local.items ?? {}) };
    delete nextItems[id];
    commit({ ...local, items: nextItems });
    if (openItemId === id) setOpenItemId(null);
  }

  const SectionHeader = ({
    title,
    section,
    right,
  }: {
    title: string;
    section: keyof typeof expanded;
    right?: React.ReactNode;
  }) => (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={() => setExpanded((p) => ({ ...p, [section]: !p[section] }))}
        className="flex w-full items-center justify-between rounded px-2 py-2 text-lg font-semibold hover:bg-gray-50"
      >
        <span>{title}</span>
        {expanded[section] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>
      {right ? <div className="ml-2 shrink-0">{right}</div> : null}
    </div>
  );

  return (
    <div className="max-w-5xl space-y-6">
      {/* GENERAL */}
      <div className="rounded-lg border p-4">
        <SectionHeader title="Shop — General" section="general" />
        {expanded.general && (
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={!!local.enabled}
                onChange={(e) => updateShop({ enabled: e.target.checked })}
              />
              <span className="font-medium">Enabled</span>
            </label>

            <div className="rounded border bg-gray-50 p-3 text-xs text-gray-600">
              This editor uses raw IDs for roles/channels/stats (comma-separated). You can replace those inputs with
              pickers later.
            </div>
          </div>
        )}
      </div>

      {/* CATEGORIES */}
      <div className="rounded-lg border p-4">
        <SectionHeader
          title="Categories"
          section="categories"
          right={
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => {
                setCreateError(null);
                setNewCategory({
                    id: "",
                    name: "New Category",
                    icon: "🛍️",
                    description: "",
                    sortOrder: Object.keys(local.categories ?? {}).length,
                    hidden: false,
                    roleRequiredIds: [],
                });
                setExpanded((p) => ({ ...p, categories: true }));
                }}
            >
              <Plus size={16} />
              Add
            </button>
          }
        />

        {expanded.categories && (
          <div className="mt-4 space-y-3">
            {newCategory && (
                <div className="rounded border p-3">
                    <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Create Category</div>
                    <button
                        type="button"
                        className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
                        onClick={() => {
                        setNewCategory(null);
                        setCreateError(null);
                        }}
                    >
                        Cancel
                    </button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                        <label className="block text-sm font-medium">Category ID (set once)</label>
                        <input
                        className="w-full rounded border px-3 py-2 text-sm font-mono"
                        value={newCategory.id}
                        onChange={(e) => setNewCategory({ ...newCategory, id: e.target.value })}
                        placeholder="e.g. roles, cosmetics, boosts"
                        />
                        <p className="text-xs text-gray-500">
                        Allowed: letters, numbers, <span className="font-mono">_</span> or <span className="font-mono">-</span>.
                        Once created, you can’t change it.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium">Name</label>
                        <input
                        className="w-full rounded border px-3 py-2 text-sm"
                        value={newCategory.name}
                        onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium">Icon</label>
                        <input
                        className="w-full rounded border px-3 py-2 text-sm"
                        value={newCategory.icon ?? ""}
                        onChange={(e) => setNewCategory({ ...newCategory, icon: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                        <label className="block text-sm font-medium">Description</label>
                        <input
                        className="w-full rounded border px-3 py-2 text-sm"
                        value={newCategory.description ?? ""}
                        onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                        />
                    </div>
                    </div>

                    {createError && <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{createError}</div>}

                    <div className="mt-4 flex justify-end">
                    <button
                        type="button"
                        className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:opacity-95"
                        onClick={() => {
                        setCreateError(null);
                        const id = normalizeId(newCategory.id);

                        if (!id) return setCreateError("Category ID is required.");
                        if (!isValidId(id)) return setCreateError("Category ID must be 2–40 chars: letters/numbers/_/- only.");
                        if ((local.categories ?? {})[id]) return setCreateError("That category ID is already taken.");

                        const cat: shopCategoryConfig = {
                            id,
                            name: newCategory.name,
                            icon: newCategory.icon,
                            description: newCategory.description,
                            sortOrder: newCategory.sortOrder,
                            hidden: newCategory.hidden,
                            roleRequiredIds: newCategory.roleRequiredIds ?? [],
                        };

                        const nextCats = { ...(local.categories ?? {}) };
                        nextCats[id] = cat;
                        commit({ ...local, categories: nextCats });

                        setNewCategory(null);
                        setOpenCategoryId(id);
                        }}
                    >
                        Create Category
                    </button>
                    </div>
                </div>
                )}


            {sortedCategories.length === 0 ? (
              <div className="rounded border bg-gray-50 p-3 text-sm text-gray-600">
                No categories yet. Add one to start.
              </div>
            ) : (
              sortedCategories.map((cat) => {
                const isOpen = openCategoryId === cat.id;
                return (
                  <div key={cat.id} className="rounded border">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-3 text-left hover:bg-gray-50"
                      onClick={() => setOpenCategoryId(isOpen ? null : cat.id)}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-semibold">
                            {cat.icon ? `${cat.icon} ` : ""}
                            {cat.name}
                          </span>
                          {cat.hidden ? (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">Hidden</span>
                          ) : null}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          id: <span className="font-mono">{cat.id}</span>
                          {cat.description ? ` • ${cat.description}` : ""}
                        </div>
                      </div>
                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>

                    {isOpen && (
                      <div className="border-t p-3">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="block text-sm font-medium">Name</label>
                            <input
                              className="w-full rounded border px-3 py-2 text-sm"
                              value={cat.name}
                              onChange={(e) => upsertCategory({ ...cat, name: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="block text-sm font-medium">Icon (emoji)</label>
                            <input
                              className="w-full rounded border px-3 py-2 text-sm"
                              value={cat.icon ?? ""}
                              onChange={(e) => upsertCategory({ ...cat, icon: e.target.value })}
                              placeholder="🛍️"
                            />
                          </div>

                          <div className="space-y-2 sm:col-span-2">
                            <label className="block text-sm font-medium">Description</label>
                            <input
                              className="w-full rounded border px-3 py-2 text-sm"
                              value={cat.description ?? ""}
                              onChange={(e) => upsertCategory({ ...cat, description: e.target.value })}
                              placeholder="Optional"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="block text-sm font-medium">Sort Order</label>
                            <input
                              type="number"
                              className="w-full rounded border px-3 py-2 text-sm"
                              value={cat.sortOrder ?? 0}
                              onChange={(e) =>
                                upsertCategory({ ...cat, sortOrder: safeNumber(e.target.value, cat.sortOrder ?? 0) })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={!!cat.hidden}
                                onChange={(e) => upsertCategory({ ...cat, hidden: e.target.checked })}
                              />
                              Hidden
                            </label>
                            <div className="text-xs text-gray-500">Hidden categories won’t show in shop UI.</div>
                          </div>

                          <div className="space-y-2 sm:col-span-2">
                            <label className="block text-sm font-medium">Role Required IDs (CSV)</label>
                            <input
                              className="w-full rounded border px-3 py-2 text-sm font-mono"
                              value={toCsv(cat.roleRequiredIds)}
                              onChange={(e) => upsertCategory({ ...cat, roleRequiredIds: fromCsv(e.target.value) })}
                              placeholder="123, 456"
                            />
                          </div>
                        </div>

                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
                            onClick={() => deleteCategory(cat.id)}
                          >
                            <Trash2 size={16} />
                            Delete Category
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ITEMS */}
      <div className="rounded-lg border p-4">
        <SectionHeader
          title="Items"
          section="items"
          right={
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-gray-50"
              onClick={() => {
                setCreateError(null);
                const firstCategory = Object.values(local.categories ?? {})[0]?.id ?? "uncategorized";

                setNewItem({
                    id: "",
                    name: "New Item",
                    emoji: "✨",
                    description: "",
                    categoryId: firstCategory,
                    price: 100,
                    sellPrice: null,
                    minLevel: undefined,
                    requiresRoleIds: [],
                    maxPerUser: undefined,
                    stock: null,
                    hidden: false,
                    permanent: false,
                    tradeable: false,
                    actions: {},
                });
                setExpanded((p) => ({ ...p, items: true }));
                }}

            >
              <Plus size={16} />
              Add
            </button>
          }
        />

        {expanded.items && (
          <div className="mt-4 space-y-3">
            {newItem && (
                <div className="rounded border p-3">
                    <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">Create Item</div>
                    <button
                        type="button"
                        className="rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
                        onClick={() => {
                        setNewItem(null);
                        setCreateError(null);
                        }}
                    >
                        Cancel
                    </button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                        <label className="block text-sm font-medium">Item ID (set once)</label>
                        <input
                        className="w-full rounded border px-3 py-2 text-sm font-mono"
                        value={newItem.id}
                        onChange={(e) => setNewItem({ ...newItem, id: e.target.value })}
                        placeholder="e.g. vip_role, rename_token, booster_pack"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium">Name</label>
                        <input
                        className="w-full rounded border px-3 py-2 text-sm"
                        value={newItem.name}
                        onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium">Emoji</label>
                        <input
                        className="w-full rounded border px-3 py-2 text-sm"
                        value={newItem.emoji ?? ""}
                        onChange={(e) => setNewItem({ ...newItem, emoji: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                        <label className="block text-sm font-medium">Category</label>
                        <select
                        className="w-full rounded border px-3 py-2 text-sm"
                        value={newItem.categoryId}
                        onChange={(e) => setNewItem({ ...newItem, categoryId: e.target.value })}
                        >
                        {Object.values(local.categories ?? {}).map((c) => (
                            <option key={c.id} value={c.id}>
                            {c.icon ? `${c.icon} ` : ""}{c.name} ({c.id})
                            </option>
                        ))}
                        <option value="uncategorized">Uncategorized (uncategorized)</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium">Price</label>
                        <input
                        type="number"
                        className="w-full rounded border px-3 py-2 text-sm"
                        value={newItem.price}
                        onChange={(e) => setNewItem({ ...newItem, price: Number(e.target.value) })}
                        />
                    </div>
                    </div>

                    {createError && <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{createError}</div>}

                    <div className="mt-4 flex justify-end">
                    <button
                        type="button"
                        className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:opacity-95"
                        onClick={() => {
                        setCreateError(null);
                        const id = normalizeId(newItem.id);

                        if (!id) return setCreateError("Item ID is required.");
                        if (!isValidId(id)) return setCreateError("Item ID must be 2–40 chars: letters/numbers/_/- only.");
                        if ((local.items ?? {})[id]) return setCreateError("That item ID is already taken.");

                        const item: shopItemConfig = {
                            id,
                            name: newItem.name,
                            emoji: newItem.emoji,
                            description: newItem.description,
                            categoryId: newItem.categoryId,
                            price: newItem.price,
                            sellPrice: newItem.sellPrice ?? null,
                            minLevel: newItem.minLevel,
                            requiresRoleIds: newItem.requiresRoleIds ?? [],
                            maxPerUser: newItem.maxPerUser,
                            stock: newItem.stock ?? null,
                            hidden: newItem.hidden,
                            permanent: newItem.permanent,
                            tradeable: newItem.tradeable,
                            actions: newItem.actions ?? {},
                        };

                        const nextItems = { ...(local.items ?? {}) };
                        nextItems[id] = item;
                        commit({ ...local, items: nextItems });

                        setNewItem(null);
                        setOpenItemId(id);
                        }}
                    >
                        Create Item
                    </button>
                    </div>
                </div>
                )}


            {sortedItems.length === 0 ? (
              <div className="rounded border bg-gray-50 p-3 text-sm text-gray-600">
                No items yet. Add one to start.
              </div>
            ) : (
              sortedItems.map((it) => {
                const isOpen = openItemId === it.id;
                const catName =
                  localCategories[it.categoryId]?.name ??
                  (it.categoryId === "uncategorized" ? "Uncategorized" : it.categoryId);

                return (
                  <div key={it.id} className="rounded border">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-3 text-left hover:bg-gray-50"
                      onClick={() => setOpenItemId(isOpen ? null : it.id)}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold">
                            {it.emoji ? `${it.emoji} ` : ""}
                            {it.name}
                          </span>

                          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{catName}</span>

                          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                            Price: {it.price}
                          </span>

                          {it.hidden ? (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">Hidden</span>
                          ) : null}
                          {it.permanent ? (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">Permanent</span>
                          ) : null}
                          {it.tradeable ? (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">Tradeable</span>
                          ) : null}
                        </div>

                        <div className="truncate text-xs text-gray-500">
                          id: <span className="font-mono">{it.id}</span>
                          {it.description ? ` • ${it.description}` : ""}
                        </div>
                      </div>

                      {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>

                    {isOpen && (
                      <div className="border-t p-3 space-y-6">
                        {/* Basic fields */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="block text-sm font-medium">Name</label>
                            <input
                              className="w-full rounded border px-3 py-2 text-sm"
                              value={it.name}
                              onChange={(e) => upsertItem({ ...it, name: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="block text-sm font-medium">Emoji</label>
                            <input
                              className="w-full rounded border px-3 py-2 text-sm"
                              value={it.emoji ?? ""}
                              onChange={(e) => upsertItem({ ...it, emoji: e.target.value })}
                              placeholder="✨"
                            />
                          </div>

                          <div className="space-y-2 sm:col-span-2">
                            <label className="block text-sm font-medium">Description</label>
                            <input
                              className="w-full rounded border px-3 py-2 text-sm"
                              value={it.description ?? ""}
                              onChange={(e) => upsertItem({ ...it, description: e.target.value })}
                              placeholder="Optional"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="block text-sm font-medium">Category</label>
                            <select
                              className="w-full rounded border px-3 py-2 text-sm"
                              value={it.categoryId}
                              onChange={(e) => upsertItem({ ...it, categoryId: e.target.value })}
                            >
                              {sortedCategories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.icon ? `${c.icon} ` : ""}
                                  {c.name} ({c.id})
                                </option>
                              ))}
                              <option value="uncategorized">Uncategorized (uncategorized)</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-sm font-medium">Price</label>
                            <input
                              type="number"
                              className="w-full rounded border px-3 py-2 text-sm"
                              value={it.price}
                              onChange={(e) => upsertItem({ ...it, price: safeNumber(e.target.value, it.price) })}
                            />
                          </div>

                          {/* sellPrice nullable */}
                          <div className="space-y-2">
                            <label className="block text-sm font-medium">Sell Price</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                className="w-full rounded border px-3 py-2 text-sm"
                                value={it.sellPrice ?? ""}
                                onChange={(e) => {
                                  const raw = e.target.value.trim();
                                  upsertItem({ ...it, sellPrice: raw === "" ? null : safeNumber(raw, 0) });
                                }}
                                placeholder="(null)"
                              />
                              <button
                                type="button"
                                className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => upsertItem({ ...it, sellPrice: null })}
                                title="Set to null"
                              >
                                Null
                              </button>
                            </div>
                            <div className="text-xs text-gray-500">Leave null to disable selling (if that’s your logic).</div>
                          </div>

                          {/* stock nullable */}
                          <div className="space-y-2">
                            <label className="block text-sm font-medium">Stock</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                className="w-full rounded border px-3 py-2 text-sm"
                                value={it.stock ?? ""}
                                onChange={(e) => {
                                  const raw = e.target.value.trim();
                                  upsertItem({ ...it, stock: raw === "" ? null : safeNumber(raw, 0) });
                                }}
                                placeholder="(null = unlimited)"
                              />
                              <button
                                type="button"
                                className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
                                onClick={() => upsertItem({ ...it, stock: null })}
                              >
                                Unlimited
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-sm font-medium">Min Level</label>
                            <input
                              type="number"
                              className="w-full rounded border px-3 py-2 text-sm"
                              value={it.minLevel ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                upsertItem({ ...it, minLevel: raw === "" ? undefined : safeNumber(raw, 0) });
                              }}
                              placeholder="(none)"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="block text-sm font-medium">Max Per User</label>
                            <input
                              type="number"
                              className="w-full rounded border px-3 py-2 text-sm"
                              value={it.maxPerUser ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                upsertItem({ ...it, maxPerUser: raw === "" ? undefined : safeNumber(raw, 0) });
                              }}
                              placeholder="(none)"
                            />
                          </div>

                          <div className="space-y-2 sm:col-span-2">
                            <label className="block text-sm font-medium">Requires Role IDs (CSV)</label>
                            <input
                              className="w-full rounded border px-3 py-2 text-sm font-mono"
                              value={toCsv(it.requiresRoleIds)}
                              onChange={(e) => upsertItem({ ...it, requiresRoleIds: fromCsv(e.target.value) })}
                              placeholder="123, 456"
                            />
                          </div>

                          <div className="flex flex-wrap gap-4 sm:col-span-2">
                            <label className="flex items-center gap-2 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={!!it.hidden}
                                onChange={(e) => upsertItem({ ...it, hidden: e.target.checked })}
                              />
                              Hidden
                            </label>
                            <label className="flex items-center gap-2 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={!!it.permanent}
                                onChange={(e) => upsertItem({ ...it, permanent: e.target.checked })}
                              />
                              Permanent
                            </label>
                            <label className="flex items-center gap-2 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={!!it.tradeable}
                                onChange={(e) => upsertItem({ ...it, tradeable: e.target.checked })}
                              />
                              Tradeable
                            </label>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="rounded border p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold">Actions</div>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => {
                                const current = it.actions ?? {};
                                const keys = Object.keys(current).map((k) => Number(k)).filter(Number.isFinite);
                                const nextKey = (keys.length ? Math.max(...keys) : -1) + 1;

                                const nextActions: Record<number, shopItemAction> = {
                                  ...current,
                                  [nextKey]: { type: "sendMessage", message: "Thanks for your purchase!" },
                                };
                                upsertItem({ ...it, actions: nextActions });
                              }}
                            >
                              <Plus size={16} />
                              Add Action
                            </button>
                          </div>

                          <div className="mt-3 space-y-3">
                            {Object.keys(it.actions ?? {}).length === 0 ? (
                              <div className="text-xs text-gray-500">No actions. Add one if this item should do something on purchase.</div>
                            ) : (
                              Object.entries(it.actions ?? {})
                                .map(([k, v]) => [Number(k), v] as const)
                                .sort((a, b) => a[0] - b[0])
                                .map(([key, action]) => {
                                  const setAction = (patch: Partial<shopItemAction>) => {
                                    const nextActions = { ...(it.actions ?? {}) };
                                    nextActions[key] = { ...action, ...patch };
                                    upsertItem({ ...it, actions: nextActions });
                                  };

                                  const removeAction = () => {
                                    const nextActions = { ...(it.actions ?? {}) };
                                    delete nextActions[key];
                                    upsertItem({ ...it, actions: nextActions });
                                  };

                                  return (
                                    <div key={key} className="rounded border p-3">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="text-sm font-medium">
                                          Action #{key}{" "}
                                          <span className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                                            {action.type}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          className="inline-flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
                                          onClick={removeAction}
                                        >
                                          <Trash2 size={16} />
                                          Remove
                                        </button>
                                      </div>

                                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div className="space-y-2">
                                          <label className="block text-xs font-medium text-gray-600">Type</label>
                                          <select
                                            className="w-full rounded border px-3 py-2 text-sm"
                                            value={action.type}
                                            onChange={(e) => setAction({ type: e.target.value as shopItemAction["type"] })}
                                          >
                                            <option value="assignRole">assignRole</option>
                                            <option value="removeRole">removeRole</option>
                                            <option value="sendMessage">sendMessage</option>
                                            <option value="runCommand">runCommand</option>
                                            <option value="giveStat">giveStat</option>
                                          </select>
                                        </div>

                                        {(action.type === "assignRole" || action.type === "removeRole") && (
                                          <div className="space-y-2">
                                            <label className="block text-xs font-medium text-gray-600">Role ID</label>
                                            <input
                                              className="w-full rounded border px-3 py-2 text-sm font-mono"
                                              value={action.roleId ?? ""}
                                              onChange={(e) => setAction({ roleId: e.target.value })}
                                              placeholder="1234567890"
                                            />
                                          </div>
                                        )}

                                        {action.type === "sendMessage" && (
                                          <>
                                            <div className="space-y-2 sm:col-span-2">
                                              <label className="block text-xs font-medium text-gray-600">Message</label>
                                              <input
                                                className="w-full rounded border px-3 py-2 text-sm"
                                                value={action.message ?? ""}
                                                onChange={(e) => setAction({ message: e.target.value })}
                                                placeholder="Message to send"
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <label className="block text-xs font-medium text-gray-600">Channel ID (optional)</label>
                                              <input
                                                className="w-full rounded border px-3 py-2 text-sm font-mono"
                                                value={action.channelId ?? ""}
                                                onChange={(e) => setAction({ channelId: e.target.value })}
                                                placeholder="(optional)"
                                              />
                                            </div>
                                          </>
                                        )}

                                        {action.type === "runCommand" && (
                                          <div className="space-y-2 sm:col-span-2">
                                            <label className="block text-xs font-medium text-gray-600">Command</label>
                                            <input
                                              className="w-full rounded border px-3 py-2 text-sm font-mono"
                                              value={action.command ?? ""}
                                              onChange={(e) => setAction({ command: e.target.value })}
                                              placeholder="e.g. /grant @user something"
                                            />
                                          </div>
                                        )}

                                        {action.type === "giveStat" && (
                                          <>
                                            <div className="space-y-2">
                                              <label className="block text-xs font-medium text-gray-600">Stat ID</label>
                                              <input
                                                className="w-full rounded border px-3 py-2 text-sm font-mono"
                                                value={action.statId ?? ""}
                                                onChange={(e) => setAction({ statId: e.target.value })}
                                                placeholder="stat_id"
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <label className="block text-xs font-medium text-gray-600">Amount</label>
                                              <input
                                                type="number"
                                                className="w-full rounded border px-3 py-2 text-sm"
                                                value={action.amount ?? 0}
                                                onChange={(e) => setAction({ amount: safeNumber(e.target.value, 0) })}
                                              />
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                            )}
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
                            onClick={() => deleteItem(it.id)}
                          >
                            <Trash2 size={16} />
                            Delete Item
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
