"use client";

import { Plus, Trash2 } from "lucide-react";
import { Field, FieldGrid, NumberField, Section, SelectField, TextField, Toggle } from "@/app/components/ui/form";
import { ContentBrowser, EntryTooltip, idFromName } from "@/app/components/ui/slots";
import { PlaceChannelsField } from "@/app/components/ui/pickers";
import type { CombatConfig } from "./combatEditor";
import type { PlaceConfig } from "./moveText";

const FIGHT_STYLES = [
  { value: "thread" as const, label: "In a thread, off one line in chat" },
  { value: "channel" as const, label: "Right in the channel" },
];

/** Places: the server's channels as its map, each with the enemies met there. */
export default function PlacesEditor({ value, onChange }: {
  value: CombatConfig;
  onChange: (next: CombatConfig) => void;
}) {
  const places = value.places ?? {};
  const enemies = Object.values(value.enemies ?? {}).filter((e) => !e.boss);
  const enemyOptions = enemies.map((e) => ({ value: e.id, label: `${e.emoji} ${e.name} (Combat ${e.minLevel}${e.maxLevel == null ? "+" : `–${e.maxLevel}`})` }));
  const upsert = (p: PlaceConfig) => onChange({ ...value, places: { ...places, [p.id]: p } });
  const entries = Object.entries(places).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]));

  return (
    <div className="space-y-4">
      <Section
        title="Places"
        description="Tie enemies to channels, so the server's channel list becomes its map: wolves in #the-woods, the Lich only in #the-crypt. /fight and random encounters there draw from the place's enemies. A place can cover a whole category."
      >
        <ContentBrowser<PlaceConfig>
          entries={entries}
          newLabel="New place"
          empty="No places yet. Everywhere, members meet any enemy that suits their level."
          look={(id, p) => ({ icon: p.emoji, label: p.name || id, faded: !p.channelIds?.length })}
          tooltip={(id, p) => (
            <EntryTooltip
              title={`${p.emoji ?? ""} ${p.name || id}`}
              lines={[
                `${p.channelIds?.length ?? 0} channel${p.channelIds?.length === 1 ? "" : "s"} · ${(p.fights ?? "thread") === "thread" ? "fights in threads" : "fights in the channel"}`,
                (p.enemies ?? []).map((e) => value.enemies?.[e.enemyId]?.emoji ?? "?").join(" ") || "No enemies",
              ]}
            />
          )}
          onCreate={(name) => {
            const id = idFromName(name, Object.keys(places));
            upsert({ id, name, emoji: "🌲", channelIds: [], enemies: [] });
            return id;
          }}
          onRemove={(id) => {
            const next = { ...places };
            delete next[id];
            onChange({ ...value, places: next });
          }}
          renderItem={(id, place) => {
            const pool = place.enemies ?? [];
            const total = pool.reduce((sum, e) => sum + Math.max(0, e.weight ?? 1), 0);
            const setPool = (next: PlaceConfig["enemies"]) => upsert({ ...place, enemies: next });
            return (
              <div className="space-y-4">
                <FieldGrid>
                  <TextField label="Name" value={place.name} onChange={(v) => upsert({ ...place, name: v })} />
                  <TextField label="Emoji" value={place.emoji ?? ""} onChange={(v) => upsert({ ...place, emoji: v })} />
                  <TextField
                    wide
                    label="How enemies turn up"
                    value={place.arrival ?? ""}
                    onChange={(v) => upsert({ ...place, arrival: v || undefined })}
                    placeholder="prowls out of the treeline"
                    hint={`Random encounters here read “A wild Grey Wolf ${place.arrival || "appears"}!”`}
                  />
                </FieldGrid>

                <PlaceChannelsField
                  label="Channels"
                  value={place.channelIds ?? []}
                  onChange={(v) => upsert({ ...place, channelIds: v })}
                  hint="Pick channels, or a 📁 category for every channel in it. A channel picked on its own belongs to that place rather than its category's."
                />

                <SelectField
                  label="Fights show"
                  value={place.fights ?? "thread"}
                  onChange={(v) => upsert({ ...place, fights: v })}
                  options={FIGHT_STYLES}
                  hint={(place.fights ?? "thread") === "thread"
                    ? "For chat channels: chat sees one line, the fight opens in a thread off it, and the line shows the result when it ends."
                    : "For RPG channels: the whole fight plays out in the channel."}
                />

                <Field label="Enemies here" hint="Each fight picks one by weight, among those that suit the member's Combat level.">
                  <div className="space-y-3">
                    {pool.map((p, i) => {
                      const share = total > 0 ? Math.round((Math.max(0, p.weight ?? 1) / total) * 100) : 0;
                      return (
                        <div key={i} className="flex items-end gap-3">
                          <div className="grid flex-1 gap-3 sm:grid-cols-2">
                            <SelectField
                              label="Enemy"
                              value={p.enemyId}
                              onChange={(v) => setPool(pool.map((x, j) => (j === i ? { ...x, enemyId: v } : x)))}
                              options={enemyOptions.some((o) => o.value === p.enemyId) ? enemyOptions : [{ value: p.enemyId, label: `Deleted (${p.enemyId})` }, ...enemyOptions]}
                            />
                            <NumberField
                              label="Weight"
                              value={p.weight ?? 1}
                              min={0}
                              onChange={(v) => setPool(pool.map((x, j) => (j === i ? { ...x, weight: v } : x)))}
                              hint={`About ${share}% when all of them suit.`}
                            />
                          </div>
                          <button
                            type="button"
                            aria-label="Remove enemy"
                            onClick={() => setPool(pool.filter((_, j) => j !== i))}
                            className="mb-2 text-[var(--muted)] transition-colors hover:text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                    {enemyOptions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPool([...pool, { enemyId: enemyOptions.find((o) => !pool.some((p) => p.enemyId === o.value))?.value ?? enemyOptions[0]!.value, weight: 1 }])}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--surface)]"
                      >
                        <Plus size={14} /> Add enemy
                      </button>
                    )}
                  </div>
                </Field>
                <p className="font-mono text-xs text-[var(--muted)]">id: {id}</p>
              </div>
            );
          }}
        />
      </Section>

      <Section title="Everywhere else" description="Channels outside every place, and picking enemies by name.">
        <div className="space-y-4">
          <SelectField
            label="Fights outside places show"
            value={value.fightsIn ?? "channel"}
            onChange={(v) => onChange({ ...value, fightsIn: v })}
            options={FIGHT_STYLES}
          />
          <Toggle
            label="Members can pick an enemy with /fight"
            checked={!!value.allowEnemyChoice}
            onChange={(v) => onChange({ ...value, allowEnemyChoice: v || undefined })}
            hint={value.allowEnemyChoice
              ? "Anyone can name any enemy their level allows, wherever they are."
              : "Off: /fight finds an enemy where you are. Managers can still pick one, for testing."}
          />
        </div>
      </Section>
    </div>
  );
}
