"use client";

import { useState } from "react";
import { useGuildConfig } from "@/app/hooks/useGuildConfig";
import ConfigPage from "@/app/components/configPage";
import CombatEditor from "@/app/components/combat/combatEditor";
import MovesEditor from "@/app/components/combat/movesEditor";
import PlacesEditor from "@/app/components/combat/placesEditor";
import { skillOptions } from "@/app/components/ui/requirementsField";

/** The page in parts, so owners open the one they came for instead of scrolling past the rest. */
const TABS = [
  { id: "enemies", label: "Enemies", blurb: "What members fight: stats, moves, level range and drops." },
  { id: "places", label: "Places", blurb: "Where enemies are met: channels mapped to enemy pools, and whether fights there open in threads." },
  { id: "moves", label: "Moves", blurb: "What fighters do on their turn, built from effects, and the statuses moves can put on." },
  { id: "players", label: "Players", blurb: "Combat on or off, the level curve, player stats, the chat level bonus and death penalties." },
  { id: "events", label: "Parties, duels & bosses", blurb: "Others joining fights, fights between members, enemies that turn up in chat, and world bosses." },
] as const;
type Tab = (typeof TABS)[number]["id"];

/** The world's half (what members fight) and the rules' half (how fighting works) are separate pages. */
const WORLD: Tab[] = ["enemies", "places", "moves"];

export default function CombatPageClient({ guildId, rules = false }: { guildId: string; rules?: boolean }) {
  const { config, setConfig, loading, saving, dirty, error, save } = useGuildConfig(guildId);
  const tabs = TABS.filter((t) => WORLD.includes(t.id) !== rules);
  const [tab, setTab] = useState<Tab>(tabs[0]!.id);

  const combat = config?.combat ?? null;

  return (
    <ConfigPage
      title={rules ? "Combat rules" : "Combat"}
      description={rules
        ? "How fighting works: combat on or off, player stats, what losing costs, parties, duels, wild encounters and world bosses."
        : "What members fight: enemies, where they're met, and the moves everyone fights with."}
      loading={loading}
      saving={saving}
      error={error}
      dirty={dirty}
      onSave={() => save(config)}
      collections={config?.collections?.sets}
      rawSection={combat}
    >
      {config && (
        <>
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
          <p className="text-sm text-[var(--muted)]">{tabs.find((t) => t.id === tab)!.blurb}</p>

          {tab === "places" ? (
            <PlacesEditor
              value={combat ?? { enabled: false }}
              onChange={(next) => setConfig((prev) => ({ ...prev, combat: next }))}
            />
          ) : tab === "moves" ? (
            <MovesEditor
              moves={combat?.moves}
              statuses={combat?.statuses}
              onMoves={(next) => setConfig((prev) => ({ ...prev, combat: { enabled: false, ...prev?.combat, moves: next } }))}
              onStatuses={(next) => setConfig((prev) => ({ ...prev, combat: { enabled: false, ...prev?.combat, statuses: next } }))}
              skills={skillOptions(config)}
            />
          ) : (
            <CombatEditor
              part={tab}
              skills={skillOptions(config)}
              value={combat}
              shopItems={config.shop?.items ?? {}}
              onChange={(next) => setConfig((prev) => ({ ...prev, combat: next }))}
            />
          )}
        </>
      )}
    </ConfigPage>
  );
}
