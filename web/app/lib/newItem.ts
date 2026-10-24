import type { Dispatch, SetStateAction } from "react";
import type { DashboardConfig } from "@/app/lib/dashboardConfig";
import { idFromName } from "@/app/components/ui/slots";

/**
 * "+ New item…" in an item picker: adds a plain item to the shop section and
 * returns its id. Hidden and common, which is what a new drop or ingredient
 * usually is; the Items page has the rest. Saved with the page.
 */
export function itemCreator(config: DashboardConfig | null, setConfig: Dispatch<SetStateAction<DashboardConfig | null>>) {
  return (name: string) => {
    const items = config?.shop?.items ?? {};
    const id = idFromName(name, Object.keys(items));
    const categoryId = Object.keys(config?.shop?.categories ?? {})[0] ?? "";
    setConfig((prev) => ({
      ...prev,
      shop: {
        ...prev?.shop,
        items: { ...prev?.shop?.items, [id]: { id, name, emoji: "📦", rarity: "common", categoryId, price: 0, sellPrice: 5, hidden: true, tradeable: true } },
      },
    }));
    return id;
  };
}
