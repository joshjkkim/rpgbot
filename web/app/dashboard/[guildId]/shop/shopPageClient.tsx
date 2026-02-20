"use client";

import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigDisplay from "@/app/components/configDisplay"; // make it display-only
import ShopEconomyEditor from "@/app/components/shop/shopBasicsEditor";

export default function ShopPageClient({ guildId }: { guildId: string }) {
  const { config, setConfig, loading, saving, error, save } = useGuildConfig(guildId);

  const shop = config?.shop ?? null;

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Shop</h1>

        <button
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={loading || saving || !config}
          onClick={() => save(config)}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {loading && <div className="rounded border bg-zinc-50 p-3 text-black text-sm">Loading…</div>}
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!loading && config && (
        <>
          <ShopEconomyEditor
            value={shop}
            onChange={(nextShop) => setConfig((prev: any) => ({ ...prev, shop: nextShop }))}
          />

          <details className="rounded-lg border border-zinc-200 bg-white p-4">
            <summary className="cursor-pointer text-sm text-black font-medium">Advanced (raw JSON)</summary>
            <div className="mt-3">
              <ConfigDisplay config={shop} />
            </div>
          </details>
        </>
      )}
    </main>
  );
}
