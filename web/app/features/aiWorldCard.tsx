import ItemTooltip from "@/app/components/shop/itemTooltip";
import type { shopItemConfig } from "@/app/components/shop/shopBasicsEditor";
// Real output: a world the AI builder wrote from the description in it.
import aiWorld from "./aiWorld.json";

export type Enemy = { name: string; emoji: string; boss?: boolean };

const aiItems = aiWorld.items as unknown as Record<string, shopItemConfig>;

export const EnemyGrid = ({ list }: { list: Enemy[] }) => (
  <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
    {list.map((e) => (
      <li key={e.name} className="flex flex-col items-center gap-1 rounded-sm border border-[var(--border)] bg-black/30 p-1.5">
        <span className="slot h-11 w-11 text-2xl" style={e.boss ? { borderColor: "#d0894a" } : undefined}>{e.emoji}</span>
        <span className="w-full truncate text-center text-[11px] leading-tight" style={e.boss ? { color: "#d0894a" } : undefined}>{e.name}</span>
      </li>
    ))}
  </ul>
);

/** The description an owner typed, and the world that came out of it. */
export function AiWorldCard() {
  return (
    <div className="w-full max-w-[460px] space-y-3">
      <div className="frame p-4">
        <p className="text-sm italic text-[var(--muted)]">&ldquo;{aiWorld.prompt}&rdquo;</p>
        <p className="mt-4 font-display text-[var(--gold)]">{aiWorld.name}</p>
        <p className="mt-1 mb-3 text-sm leading-relaxed text-[var(--muted)]">{aiWorld.description}</p>
        <EnemyGrid list={aiWorld.enemies.slice(-8)} />
        <p className="mt-3 text-sm text-[var(--muted)]">
          {[...aiWorld.places, ...aiWorld.activities, ...aiWorld.stations].map((x) => `${x.emoji} ${x.name}`).join(" · ")}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ItemTooltip item={aiItems["golden-scythe"]!} />
        <ItemTooltip item={aiItems["honeyed-mittens"]!} />
      </div>
    </div>
  );
}
