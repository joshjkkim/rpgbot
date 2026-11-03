"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  act, canDig, choiceFor, gridCounts, hintsAt, reelZone, shaftHint, SIDE, SNAP, distance, DRINK, itemsLeft, occupant, RELICS, TRAITS, USE, WALK_HOURS, fightMoves, gather, GRID, HOURS, kitOf, LEVEL_BONUS, LEVELS, levelOf, LOADOUT_SIZE, LOOT, mapScore, neighbours, PULLS, XP,
  LEVEL, REST_HEAL, START_NODE, startFight, startState, statsAt, TUNNEL,
  type Daily, type GatherSpec, type GatherState, type MapAction, type MapNode, type MapState, type ShopItem, type Slot,
} from "@content/daily";
import { describeMove, moveById, playTurn, type Fight } from "@content/fight";
import { RARITIES } from "@/app/components/shop/itemTooltip";
import { Pixels, Sprite } from "@/app/components/ui/sprite";
import { SPRITES } from "@/app/sprites";
import { inviteUrl } from "@/app/lib/invite";
import { Emoji } from "./emoji";
import { FightStage } from "./fightStage";
import { hrs, Overworld } from "./overworld";
import { greeting, Shelf, Smithy, Stall } from "./places";
import { lightAt, Minimap, PixelWipe, STEP_SECONDS, World, type Reward } from "./world";
import { PANEL } from "./panel";
import { Scene, themeFor, type Theme } from "./scene";

/*
 * The Daily as an open map: you start in the middle of the day's world with
 * 24 hours to beat its quest. Every action takes an hour (walking a tile,
 * gathering, fighting, crafting, praying, resting); shopping in town is free.
 * The rules are all in @content/daily (act): this page only shows them and
 * sends your actions through them, the same way the server checks a run.
 */

/** How each gathering game works, in a line. */
const RULES = {
  grid: `Dig up finds, avoid the ${GRID.hazards} hazards. Hit one and you keep half.`,
  tunnel: "Dig down one level at a time. Deeper finds are worth more, but you can only see right below you. Hit a cave-in and you keep half.",
  pulls: "Reel when the marker is in the green. Miss and you keep half.",
} as const;
const GAME_NAME = { grid: "Grid", pulls: "Pulls", tunnel: "Tunnel" } as const;

const rarityColour = (r: string) => RARITIES.find((x) => x.value === r)?.colour ?? "var(--foreground)";
/** A rarity's colour on parchment: the pale ones (common, poor) in ink instead, so they read. */
const inkColour = (r: string) => (r === "common" || r === "poor" ? "var(--foreground)" : rarityColour(r));

/** What an item does, short: "+40 ATK · −25 SPD", "Teaches 🩸 Rend", "Every fight starts with ATK +40% for 2 turns". */
function itemText(daily: Daily, item: ShopItem) {
  const labels = { atk: "ATK", def: "DEF", hp: "max HP", spd: "SPD", crit: "% crit chance" } as const;
  const parts = (Object.entries(item.stats ?? {}) as Array<[keyof typeof labels, number]>)
    .map(([k, v]) => `${v > 0 ? "+" : "−"}${Math.abs(v)}${k === "crit" ? "" : " "}${labels[k]}`);
  if (item.heal) parts.push(`Heals ${item.heal} HP in a fight, using your turn`);
  if (item.teaches) { const m = moveById(daily.config, item.teaches); parts.push(`Teaches ${m.emoji} ${m.name}, a fifth move`); }
  if (item.opener) {
    const atk = daily.config.combat?.statuses?.[item.opener.statusId]?.stats?.atk ?? 0;
    parts.push(`Taken before the run: every fight starts with ATK +${atk}% for ${item.opener.turns} turns`);
  }
  if (item.id === "heavy") parts.push("enemies act first more often");
  if (item.use) parts.push(`${describeMove(moveById(daily.config, item.use), daily.config).does.join(" ")} Used in a fight from your bag; it takes your turn`);
  return parts.join(" · ");
}

/** The bar pinned to the bottom of the screen, for the view's main action. */
function ActionBar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`fixed inset-x-0 bottom-0 z-20 border-t-[3px] border-black bg-[#120e0b] px-4 py-3 shadow-[0_-3px_0_#3b3226] ${className}`}>
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3">{children}</div>
    </div>
  );
}

/** A view's heading: its emoji large, its name in the gold serif. */
function Heading({ emoji, title, sub }: { emoji: string; title: string; sub?: string | undefined }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center">
      <Emoji e={emoji} size={64} />
      <h2 className="mt-2 font-display text-3xl text-[var(--gold)] [text-shadow:2px_2px_0_#000]">{title}</h2>
      {sub && <p className="mt-1 text-sm text-[var(--muted)] [text-shadow:1px_1px_0_#000]">{sub}</p>}
    </motion.div>
  );
}

const SLOT_NAME: Record<Slot, string> = { weapon: "Weapon", armour: "Armour", trinket: "Trinket" };

/** A boss's traits, from its lair. */
function traitsOf(node: MapNode) {
  return (node.enemy?.traits ?? []).map((id) => TRAITS.find((t) => t.id === id)!).filter(Boolean);
}

/** Each tile's role in a line, for the map's panel. */
/** What a fight's XP does for you: "+3 XP: up to Lv 3 (+25% ATK and max HP)" or "+1 XP (2 more for Lv 3)". */
function xpText(xp: number, gain: number): string {
  const lv = levelOf(xp), after = levelOf(xp + gain), next = LEVELS[after];
  if (after > lv) return `+${gain} XP: up to Lv ${after} (+${Math.round(LEVEL_BONUS * 100 * (after - lv))}% ATK and max HP)`;
  return next == null ? `+${gain} XP (max level)` : `+${gain} XP (${next - xp - gain} more for Lv ${after + 1})`;
}

function tileText(daily: Daily, node: MapNode, xp: number): string {
  switch (node.kind) {
    case "start": return "Where the day starts. Pick your four moves here or in town.";
    case "town": return "Sell what you gathered, buy gear and potions, change your moves. Shopping takes no time.";
    case "forge": return daily.map.recipes.map((r) => `${r.needs.map((n) => `${n.count}× ${n.emoji} ${n.name}`).join(" + ")} → ${r.gives.emoji} ${r.gives.name}`).join(" · ");
    case "shrine": {
      const sh = daily.shrine;
      return [sh.atk && `ATK ${sh.atk > 0 ? "+" : ""}${sh.atk}%`, sh.def && `DEF ${sh.def > 0 ? "+" : ""}${sh.def}%`, sh.spd && `SPD +${sh.spd}%`, sh.crit && `+${sh.crit}% crit`, sh.maxHp && `+${sh.maxHp} max HP`, sh.hpCost && `costs ${sh.hpCost}% of your HP`].filter(Boolean).join(" · ") + ", for the rest of the day.";
    }
    case "camp": return `Rest by the fire: +${Math.round(REST_HEAL * 100)}% of your max HP an hour.`;
    case "gather": {
      const finds = [...new Map(node.gather!.tiles.filter((t) => t && t !== "hazard").map((t) => [(t as { name: string }).name, t as { emoji: string; name: string }])).values()];
      return `${GAME_NAME[node.gather!.game]} · ${node.gather!.place} · finds ${finds.map((t) => `${t.emoji} ${t.name}`).join(", ")}`;
    }
    case "enemy": return `${node.enemy!.hp} HP · ${node.enemy!.atk} ATK · ${xpText(xp, XP.enemy)} · ${LOOT.normal} gold.`;
    case "elite": return `Elite: ${node.enemy!.hp} HP · ${node.enemy!.atk} ATK · ${xpText(xp, XP.elite)} · ${LOOT.elite} gold, ${node.trophy?.emoji ?? ""} ${node.trophy?.name ?? "a trophy"}, and your pick of one relic:`;
    case "lair": return `The quest: ${node.enemy!.name} (${node.enemy!.hp} HP, ${node.enemy!.atk} ATK). ${traitsOf(node).map((t) => `${t.emoji} ${t.name}: ${t.text}`).join(" ")}`;
    case "wild": return "Open road.";
    case "blocked": return "Cliffs: no way through.";
  }
}

type View = "map" | "gather" | "town" | "forge" | "moves" | "fight";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Today's run on the map. */
export default function DailyRun({ daily }: { daily: Daily }) {
  const [s, setS] = useState<MapState>(() => startState(daily));
  const [trail, setTrail] = useState<string[]>([]);
  const [view, setView] = useState<View>("map");
  const [selected, setSelected] = useState(START_NODE);
  const [walking, setWalking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // The moves being picked: null when not changing them (then the screen shows the four you have).
  const [draft, setDraft] = useState<string[] | null>(null);
  const [opened, setOpened] = useState<number[]>([]);
  const [left, setLeft] = useState(false);
  const [f, setFight] = useState<Fight | null>(null);
  const [fightLog, setFightLog] = useState<string[]>([]);
  const [picks, setPicks] = useState<string[]>([]);
  const [lastPick, setLastPick] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Overlays over the world, one at a time: the whole map, the journal, the character sheet.
  const [overlay, setOverlay] = useState<"map" | "journal" | "character" | null>(null);
  const toggle = (o: NonNullable<typeof overlay>) => setOverlay((cur) => (cur === o ? null : o));
  const mapOpen = overlay === "map", journalOpen = overlay === "journal", characterOpen = overlay === "character";
  // Tries today: as many as you like; the result says which one it was.
  const [tries, setTries] = useState(1);
  // What actions won, waiting to float up over the hero on the map.
  const [rewards, setRewards] = useState<Reward[]>([]);
  const rewardId = useRef(0);
  const clearRewards = useCallback(() => setRewards([]), []);
  // Into a fight: the creature lunges, the screen closes in squares and opens on the fight. Out of one: dust where it stood.
  const [engaging, setEngaging] = useState(false);
  const [wipe, setWipe] = useState<"in" | "out" | null>(null);
  const [poof, setPoof] = useState<number | null>(null);
  // When the smith last struck the anvil (each forge), for the sparks.
  const [struck, setStruck] = useState(0);
  // Each ask replays the tour.
  const [tourAsked, setTourAsked] = useState(0);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view]);

  // Keys, like a game: arrows or WASD walk a tile, M the map, J the journal, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view !== "map" || e.metaKey || e.ctrlKey || (e.target as Element | null)?.closest?.("input, textarea")) return;
      const k = e.key.toLowerCase();
      if (k === "escape") { setOverlay(null); return; }
      if (k === "m" || k === "j" || k === "i") { toggle(k === "m" ? "map" : k === "j" ? "journal" : "character"); return; }
      const step = ({ arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] } as Record<string, [number, number]>)[k];
      if (!step || overlay || walking || s.over) return;
      e.preventDefault();
      const x = (s.at % SIDE) + step[0], y = Math.floor(s.at / SIDE) + step[1];
      const to = y * SIDE + x;
      if (x < 0 || y < 0 || x >= SIDE || y >= SIDE || !neighbours(daily.map, s.at).includes(to)) return;
      setSelected(to);
      void walkTo(to);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const theme = themeFor(daily.worldId);
  const here = daily.map.nodes[s.at]!;
  const kit = kitOf(daily, s);

  /** Sends one action through the rules; false (and nothing changes) when they refuse it. */
  function apply(a: MapAction, mark?: string): MapState | null {
    const next = act(daily, s, a);
    if (!next) return null;
    const won = gainsOf(daily, s, next);
    if (won.length) setRewards((r) => [...r, ...won.map((w) => ({ ...w, id: rewardId.current++ }))]);
    setS(next);
    if (mark) setTrail((t) => [...t, mark]);
    return next;
  }

  /** Walks tile by tile along the shortest road, an hour a step, so the hero is seen to travel. */
  async function walkTo(target: number) {
    if (walking) return;
    setWalking(true);
    let cur = s;
    while (cur.at !== target && !cur.over) {
      const step = neighbours(daily.map, cur.at).sort((a, b) => distance(daily.map, a, target) - distance(daily.map, b, target))[0]!;
      const next = act(daily, cur, { type: "move", to: step });
      if (!next) break;
      cur = next;
      setS(cur);
      await sleep(STEP_SECONDS * 1000);
    }
    setWalking(false);
  }

  function flash(text: string) {
    setNote(text);
    setTimeout(() => setNote((n) => (n === text ? null : n)), 2600);
  }

  function startFightHere() {
    if (engaging) return;
    const fight = startFight(daily, 100 + here.id, here.enemy!, kit, s.hp);
    setEngaging(true);
    setTimeout(() => setWipe("in"), 380);
    setTimeout(() => {
      setFight(fight);
      setFightLog([]);
      setPicks([]);
      setLastPick(null);
      setView("fight");
      setEngaging(false);
      setWipe("out");
    }, 900);
    setTimeout(() => setWipe(null), 1450);
  }

  /** Back to the map after a win: the beaten creature bursts into dust. */
  function leaveFight() {
    setPoof(here.id);
    setView("map");
    setTimeout(() => setPoof(null), 1000);
  }

  function pick(id: string) {
    if (!f || s.over) return;
    const all = [...picks, id];
    setPicks(all);
    setLastPick(id);
    // playTurn changes the fight it's given, so it gets a copy and the copy becomes the state.
    const next = structuredClone(f);
    const turn = playTurn(next, { you: choiceFor(daily, id) }, daily.config);
    next.round += 1;
    setFight(next);
    setFightLog(turn.log);
    if (turn.outcome !== "continue") apply({ type: "fight", picks: all }, here.emoji);
  }

  function collect() {
    if (apply({ type: "gather", opened }, here.emoji)) setView("map");
  }

  function setMoves(id: string) {
    const set = s.loadout.length === LOADOUT_SIZE;
    if (set && here.kind !== "town" && here.kind !== "start") return flash("Your moves are set: change them in town.");
    // A change in progress carries on from itself, even with nothing picked; otherwise start from the four you have.
    const base = draft ?? s.loadout;
    const nextDraft = base.includes(id) ? base.filter((x) => x !== id) : base.length < LOADOUT_SIZE ? [...base, id] : base;
    if (nextDraft.length === LOADOUT_SIZE) {
      setDraft(null);
      apply({ type: "loadout", moves: nextDraft });
    } else setDraft(nextDraft);
  }

  function restart() {
    setTries((t) => t + 1);
    setS(startState(daily));
    setTrail([]);
    setView("map");
    setSelected(START_NODE);
    setDraft(null);
    setFight(null);
    setCopied(false);
  }

  const result = s.over && view !== "fight" ? s.over : null;
  const share = `havocish daily #${daily.day} · ${daily.world}\n${s.over === "won" ? `⏱️ ${hrs(s.hour)} · ❤️ ${s.hp}${tries > 1 ? ` · try ${tries}` : ""}` : s.over === "timeout" ? "⏱️ out of time" : "💀 fell on the road"}\n${trail.join(" ")}\nhavocish.com/daily`;

  return (
    <div className="relative min-h-dvh">
      <Scene theme={theme} silhouettes={[...new Set(daily.map.nodes.filter((n) => n.enemy).map((n) => n.emoji))]} />
      {view === "map" && <World daily={daily} theme={theme} s={s} selected={selected} onSelect={setSelected} onWalk={(id) => void walkTo(id)} walking={walking} wanted={wantedOn(daily, s)} rewards={rewards} onRewardsShown={clearRewards} engaging={engaging} poof={poof} tourAsked={tourAsked} />}
      {/* Away from the map, the scene takes the hour's light too: a fight at night is fought at night. */}
      {view !== "map" && <div aria-hidden className="pointer-events-none fixed inset-0 -z-[5] transition-[background-color] duration-1000" style={{ backgroundColor: lightAt(s.hour).shade, mixBlendMode: "multiply" }} />}
      {wipe && <PixelWipe out={wipe === "out"} />}
      <Hud daily={daily} s={s} kitMax={kit.stats.maxHp} />

      <main className={`mx-auto px-4 pt-4 pb-36 ${view === "map" || view === "town" ? "max-w-6xl lg:pb-12" : view === "forge" ? "max-w-4xl" : view === "fight" ? "max-w-3xl" : "max-w-xl"}`}>
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {view === "gather" && here.gather && <GatherView spec={here.gather} theme={theme} dug={gather(here.gather, opened, left)!} opened={opened} onDig={(i) => { const dug = gather(here.gather!, opened, left)!; if (!dug.end && !opened.includes(i) && gather(here.gather!, [...opened, i])) setOpened([...opened, i]); }} />}
            {view === "town" && <MarketStall daily={daily} s={s} theme={theme} onBuy={(id, add) => apply(add ? { type: "buy", id } : { type: "unbuy", id })} onSell={(name, count) => apply({ type: "sell", name, count })} />}
            {(view === "town" || view === "moves") && <MovesView daily={daily} loadout={draft ?? s.loadout} onMove={setMoves} />}
            {view === "forge" && <ForgeScene daily={daily} s={s} struck={struck} onCraft={(id) => { const r = daily.map.recipes.find((x) => x.id === id)!; if (apply({ type: "craft", recipe: id }, "⚒️")) { setStruck(Date.now()); flash(`Forged ${r.gives.emoji} ${r.gives.name}`); } }} />}
            {view === "fight" && f && fightView()}
          </motion.div>
        </AnimatePresence>

        {/* A short note after an action: what the hour bought. */}
        <AnimatePresence>
          {note && (
            <motion.p key={note} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="px-frame px-shadow fixed inset-x-0 top-28 z-30 mx-auto w-fit px-3 py-1 text-sm">
              {note}
            </motion.p>
          )}
        </AnimatePresence>

        {result && (
          <div className="fixed inset-x-0 top-[22vh] z-30 flex justify-center px-4">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="px-frame px-shadow w-full max-w-md space-y-3 p-4">
              <p className="font-display text-2xl text-[var(--gold)]">
                {result === "won" ? `🏆 Quest done in ${hrs(s.hour, true)}` : result === "timeout" ? "🌙 The day ran out" : "💀 You fell on the road"}
              </p>
              {result === "won" && <p className="text-sm">With {s.hp} HP left, on try {tries}. Score {mapScore(daily, s).toLocaleString()}.</p>}
              <pre className="px-well whitespace-pre-wrap p-2 font-sans text-sm">{share}</pre>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn px-4 py-2" onClick={() => navigator.clipboard.writeText(share).then(() => setCopied(true))}>{copied ? "Copied" : "📋 Copy result"}</button>
                {/* As many tries as you like; the result and the share say which try it was. */}
                <button type="button" className="btn btn-stone px-4 py-2" onClick={restart}>🔁 Try again</button>
                {inviteUrl() && <a href={inviteUrl()!} target="_blank" rel="noreferrer" className="btn btn-stone px-4 py-2">Add havocish to your server</a>}
              </div>
            </motion.div>
          </div>
        )}
      </main>

      {view === "map" && !result && (
        <>
          {/* The HUD's buttons, top left. */}
          <div className="fixed top-[5.5rem] left-2 z-20 flex flex-col gap-1.5 sm:top-24 sm:left-5 sm:gap-2">
            {([["🗺️", "Map", "M", mapOpen, () => toggle("map")], ["📜", "Journal", "J", journalOpen, () => toggle("journal")], ["🧍", "Hero", "I", characterOpen, () => toggle("character")], ["❔", "Tour", "", false, () => { setOverlay(null); setTourAsked((n) => n + 1); }]] as const).map(([e, label, key, on, toggle]) => (
              <button key={label} type="button" onClick={toggle} title={`${label}${key ? ` (${key})` : ""}`} aria-label={label} className={`${on ? "px-frame-gold" : "px-frame"} px-shadow flex flex-col items-center px-1 py-0.5 sm:px-1.5 sm:py-1`}>
                <Emoji e={e} size={24} />
                <span className="hidden font-display text-[10px] text-[var(--gold)] sm:block">{label} <span className="text-[var(--muted)]">{key}</span></span>
              </button>
            ))}
          </div>

          {/* The corner map: choose where to go without opening the big one. */}
          {!mapOpen && <div className="fixed top-[5.5rem] right-2 z-20 sm:top-24 sm:right-5"><Minimap daily={daily} theme={theme} s={s} selected={selected} onSelect={setSelected} /></div>}

          {/* The chosen spot's note, bottom middle. */}
          {!overlay && <div className="fixed inset-x-0 bottom-3 z-20 mx-auto w-[min(94vw,30rem)]">{mapBar().panel}</div>}

          {mapOpen && (
            <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/70 p-3 lg:flex-row lg:gap-6" onClick={(e) => { if (e.target === e.currentTarget) setOverlay(null); }}>
              {/* The chosen place's note goes beside the map, not on it, so every place stays in view. */}
              <div className="w-full max-w-[min(92vw,720px,calc(100dvh_-_7rem))] lg:w-[min(720px,calc(100dvh_-_7rem))]">
                <Overworld daily={daily} theme={theme} s={s} selected={selected} onSelect={setSelected} walking={walking} popup={null} wanted={wantedOn(daily, s)} />
              </div>
              <div className="flex w-[min(94vw,22rem)] flex-col gap-2">
                {mapBar().panel}
                <p className="text-center text-xs text-[var(--muted)]">Pick a place, then walk there · Esc or M to close</p>
              </div>
            </div>
          )}
          {characterOpen && (
            <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-3 pt-24" onClick={(e) => { if (e.target === e.currentTarget) setOverlay(null); }}>
              <CharacterSheet daily={daily} s={s} />
            </div>
          )}
          {journalOpen && (
            <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-3 pt-24" onClick={(e) => { if (e.target === e.currentTarget) setOverlay(null); }}>
              <Journal daily={daily} s={s} />
            </div>
          )}
        </>
      )}
      {view === "gather" && here.gather && (() => {
        const dug = gather(here.gather!, opened, left)!;
        return (
          <ActionBar>
            <span className="text-sm text-[var(--muted)]">
              {dug.end === "hazard" ? `💥 ${here.gather!.game === "pulls" ? "The line snapped" : "A hazard"}: half your finds are gone.` : dug.end === "out" ? "Out of tries." : dug.end ? "You stopped there." : "Stop whenever you like."}
            </span>
            {dug.end ? (
              <button type="button" className="btn px-5 py-2.5" onClick={collect}>Take it all (1h)</button>
            ) : (
              <button type="button" className="btn btn-stone px-5 py-2.5" onClick={() => setLeft(true)}>Stop here</button>
            )}
          </ActionBar>
        );
      })()}
      {(view === "town" || view === "forge" || view === "moves") && (
        <ActionBar>
          <span className="text-sm text-[var(--muted)]">
            {s.loadout.length !== LOADOUT_SIZE ? `Pick ${LOADOUT_SIZE - (draft ?? s.loadout).length} more moves before any fight.`
              : draft ? `Pick ${LOADOUT_SIZE - draft.length} more to change your moves, or leave to keep your old ones.`
              : "Your moves are set."}
          </span>
          {/* Leaving with a change half-made keeps the four you had. */}
          <button type="button" className="btn px-5 py-2.5" onClick={() => { if (s.loadout.length === LOADOUT_SIZE) setDraft(null); setView("map"); }}>🗺️ Back to the map</button>
        </ActionBar>
      )}
    </div>
  );

  /** The map's bottom bar: what the selected tile is, and what you can do about it. */
  function mapBar() {
    const node = daily.map.nodes[selected]!;
    const away = distance(daily.map, s.at, selected);
    const atIt = selected === s.at;
    const done = s.done.includes(selected);
    const needMoves = s.loadout.length !== LOADOUT_SIZE;
    let action: React.ReactNode = null;
    if (atIt) {
      if (node.kind === "gather" && !done) action = <button type="button" className="btn px-4 py-2" onClick={() => { setOpened([]); setLeft(false); setView("gather"); }}>{node.emoji} Gather (1h)</button>;
      else if ((node.kind === "enemy" || node.kind === "elite" || node.kind === "lair") && !done) {
        action = needMoves
          ? <button type="button" className="btn btn-stone px-4 py-2" onClick={() => setView("moves")}>Pick your moves first</button>
          : <button type="button" className="btn px-4 py-2" onClick={startFightHere}>⚔️ Fight (1h)</button>;
      } else if (node.kind === "town") action = <button type="button" className="btn px-4 py-2" onClick={() => setView("town")}>🏘️ Enter town</button>;
      else if (node.kind === "start") action = <button type="button" className="btn px-4 py-2" onClick={() => setView("moves")}>📖 Your moves</button>;
      else if (node.kind === "forge") action = <button type="button" className="btn px-4 py-2" onClick={() => setView("forge")}>⚒️ Use the forge</button>;
      else if (node.kind === "shrine") action = <button type="button" className="btn px-4 py-2" disabled={s.blessed} onClick={() => { if (apply({ type: "pray" }, node.emoji)) flash(`${node.emoji} ${node.name}: blessed`); }}>{s.blessed ? "Already blessed" : "🙏 Pray (1h)"}</button>;
      else if (node.kind === "camp") action = <button type="button" className="btn px-4 py-2" disabled={s.hp >= kit.stats.maxHp} onClick={() => { const next = apply({ type: "rest" }, "🏕️"); if (next) flash(`Rested: ❤️ ${s.hp} → ${next.hp}`); }}>🔥 Rest (1h)</button>;
    } else if (node.kind !== "blocked" && Number.isFinite(away)) {
      action = <button type="button" className="btn px-4 py-2" disabled={walking || s.hour + away * WALK_HOURS > HOURS} onClick={() => { setOverlay(null); void walkTo(selected); }}>🥾 Walk here ({hrs(away * WALK_HOURS)})</button>;
    }
    // An elite's relics, each with what it does, so which elite to face can be planned.
    const relics = node.kind === "elite" && !done && (
      <ul className="mt-1 space-y-0.5 text-xs">
        {(node.relics ?? []).map((id) => { const r = RELICS.find((x) => x.id === id)!; return <li key={id}><b className="text-[var(--gold)]">{r.emoji} {r.name}:</b> {r.text}</li>; })}
      </ul>
    );
    const title = <p className="font-display text-[var(--gold)]">{node.name}{done ? " ✓" : ""}{atIt ? <span className="ml-2 text-xs text-[var(--muted)]">you&apos;re here</span> : null}</p>;
    return {
      bar: (
        <ActionBar className="lg:hidden">
          <div className="flex min-w-0 items-start gap-3">
            <span className="slot h-12 w-12 shrink-0"><Emoji e={node.emoji} size={30} /></span>
            <div className="min-w-0">
              {title}
              <p className="line-clamp-2 text-xs text-[var(--foreground)]/85">{tileText(daily, node, s.xp)}</p>
              {relics}
            </div>
          </div>
          <div className="shrink-0">{action}</div>
        </ActionBar>
      ),
      panel: (
        <div className="px-parchment px-shadow space-y-2 p-3">
          <div className="flex items-start gap-3">
            <span className="shrink-0"><Emoji e={node.emoji} size={36} /></span>
            <div className="min-w-0">
              {title}
              <p className="text-sm text-[var(--foreground)]/90">{tileText(daily, node, s.xp)}</p>
              {relics}
            </div>
          </div>
          {action && <div className="flex justify-end">{action}</div>}
        </div>
      ),
    };
  }

  function fightView() {
    const fight = f!;
    const me = fight.members[0]!;
    const won = fight.enemyCurrentHp <= 0;
    const ended = won || me.hp <= 0;
    const drank = picks.filter((p) => p === DRINK).length;
    return (
      <FightStage
        daily={daily} fight={fight} log={fightLog} moves={fightMoves(s.loadout, kit)}
        potion={daily.shop.find((x) => x.heal)} potions={kit.potions - s.potionsUsed - (ended ? 0 : drank)}
        items={daily.shop.filter((x) => x.use).map((item) => ({ item, left: (itemsLeft(daily, s)[item.id] ?? 0) - (ended ? 0 : picks.filter((p) => p === `${USE}${item.id}`).length) }))}
        boss={here.kind === "lair"} lastPick={lastPick} onPick={pick}
      >
        {ended && !s.over && s.pendingRelic != null ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="space-y-2">
            <p className="text-sm">✅ <b>{here.enemy!.name}</b> is down. <span className="text-[var(--gold)]">It guarded three relics: take one.</span></p>
            <div className="grid gap-2 sm:grid-cols-3">
              {(daily.map.nodes[s.pendingRelic]!.relics ?? []).map((id) => {
                const r = RELICS.find((x) => x.id === id)!;
                return (
                  <motion.button key={id} type="button" whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} onClick={() => apply({ type: "relic", id }, r.emoji)} className="px-frame-gold px-shadow flex flex-col items-center gap-1 p-2 text-center">
                    <Emoji e={r.emoji} size={40} />
                    <span className="font-display text-[var(--gold)]">{r.name}</span>
                    <span className="text-[11px] leading-snug">{r.text}</span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        ) : ended && !s.over ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              ✅ <b>{here.enemy!.name}</b> is down.
              {here.kind !== "lair" && <span className="inline-flex items-center gap-1 text-[var(--gold)]"> +<Sprite name="coin" size={14} />{LOOT[here.kind === "elite" ? "elite" : "normal"]} · +{XP[here.kind === "elite" ? "elite" : "enemy"]} XP</span>}
              {here.trophy && <span className="text-[var(--gold)]"> · {here.trophy.emoji} {here.trophy.name}</span>}
              {levelOf(s.xp) > levelOf(s.xp - (here.kind === "elite" ? XP.elite : XP.enemy)) && <b className="ml-1 text-[#9fe08a]">Level {levelOf(s.xp)}! Stronger and tougher.</b>} You have <b>{s.hp} HP</b>.
            </p>
            <button type="button" className="btn px-4 py-2" onClick={leaveFight}>🗺️ Back to the map</button>
          </motion.div>
        ) : ended ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-display text-xl text-[var(--gold)]">{won ? "🏆 The quest is done!" : "💀 You fall."}</p>
            <button type="button" className="btn px-4 py-2" onClick={() => setView("map")}>See how you did</button>
          </motion.div>
        ) : undefined}
      </FightStage>
    );
  }
}

/** What an action won, to float over the hero: gold, XP, a level, finds, health, a relic, forged gear. */
function gainsOf(daily: Daily, before: MapState, after: MapState): Array<Omit<Reward, "id">> {
  const out: Array<Omit<Reward, "id">> = [];
  if (levelOf(after.xp) > levelOf(before.xp)) out.push({ text: `Level ${levelOf(after.xp)}!`, colour: "#ffd27a", level: true });
  if (after.gold > before.gold) out.push({ text: `+${after.gold - before.gold} gold`, colour: "#ffd27a" });
  if (after.xp > before.xp) out.push({ text: `+${after.xp - before.xp} XP`, colour: "#c4a8ff" });
  for (const [name, n] of Object.entries(after.mats)) {
    const more = n - (before.mats[name] ?? 0);
    if (more > 0) out.push({ text: `+${more} ${findEmoji(daily, name)} ${name}`, colour: "#f2e4bf" });
  }
  if (after.hp > before.hp && after.at === before.at) out.push({ text: `+${after.hp - before.hp} HP`, colour: "#9fe08a" });
  for (const id of after.relics.filter((r) => !before.relics.includes(r))) {
    const r = RELICS.find((x) => x.id === id);
    if (r) out.push({ text: `${r.emoji} ${r.name}`, colour: "#ffc070" });
  }
  for (const id of after.crafted.filter((c) => !before.crafted.includes(c))) {
    const r = daily.map.recipes.find((x) => x.id === id);
    if (r) out.push({ text: `${r.gives.emoji} ${r.gives.name}`, colour: "#ffc070" });
  }
  return out;
}

/** The emoji of a gathered material or trophy, by name. */
function findEmoji(daily: Daily, name: string): string {
  const t = daily.map.nodes.flatMap((n) => [...(n.gather?.tiles ?? []), ...(n.trophy ? [n.trophy] : [])]).find((x) => x && x !== "hazard" && x.name === name);
  return t && typeof t === "object" ? t.emoji : "📦";
}

/** Tiles with something a forge recipe still needs, so the map can mark them. */
function wantedOn(daily: Daily, s: MapState): (node: MapNode) => boolean {
  const wanted = new Set(daily.map.recipes.filter((r) => !s.crafted.includes(r.id)).flatMap((r) => r.needs.filter((n) => (s.mats[n.name] ?? 0) < n.count).map((n) => n.name)));
  return (node) => !s.done.includes(node.id) && (
    (node.gather?.tiles.some((t) => t && t !== "hazard" && wanted.has(t.name)) ?? false) || (!!node.trophy && wanted.has(node.trophy.name)));
}

/** The journal: the quest to plan the day around, what the forge makes, and what you carry. */
function Journal({ daily, s }: { daily: Daily; s: MapState }) {
  const forgeAway = distance(daily.map, s.at, daily.map.nodes.findIndex((n) => n.kind === "forge"));
  const lair = daily.map.nodes.find((n) => n.kind === "lair")!;
  return (
    <aside className="px-parchment px-shadow w-full max-w-md space-y-3 p-4 text-xs">
      <div>
        <p className="flex items-center gap-2 text-sm"><Emoji e={lair.emoji} size={28} /> <span>Beat <b className="font-display text-[var(--gold)]">{lair.enemy!.name}</b> before the day runs out.</span></p>
        <ul className="mt-1 space-y-0.5">
          {traitsOf(lair).map((t) => <li key={t.id}><b>{t.emoji} {t.name}:</b> {t.text}</li>)}
        </ul>
        <p className="mt-1 text-[11px] text-[var(--muted)]">Walking a tile takes half an hour; everything else you do, an hour.</p>
      </div>
      <hr className="border-dashed border-[var(--muted)]/40" />
      <div className="space-y-1.5">
        <p className="flex justify-between text-[var(--muted)]"><span className="font-display text-sm text-[var(--gold)]">⚒️ Forge</span><span>{s.at === daily.map.nodes.findIndex((n) => n.kind === "forge") ? "you're at the forge" : `${forgeAway}h away`} · ⚒️ on the map: what&apos;s needed</span></p>
        {daily.map.recipes.map((r) => {
          const made = s.crafted.includes(r.id);
          return (
            <p key={r.id} className={`flex flex-wrap items-center gap-x-2 ${made ? "opacity-50" : ""}`}>
              <Emoji e={r.gives.emoji} size={16} /> <b>{r.gives.name}</b>
              <span className="text-[var(--muted)]">{itemText(daily, r.gives)}</span>
              <span className="basis-full" />
              {r.needs.map((n) => {
                const have = Math.min(s.mats[n.name] ?? 0, n.count);
                return <span key={n.name} className={have >= n.count ? "font-semibold text-[var(--good)]" : ""}>{n.emoji} {n.name} {have}/{n.count}</span>;
              })}
              {made && <span className="text-[var(--gold)]">made ✓</span>}
            </p>
          );
        })}
      </div>
      <Bag daily={daily} s={s} />
    </aside>
  );
}

/**
 * The character sheet, WoW-style: gear on the left, you in the middle with your
 * level, stats on the right (and how far they've come from the start of the
 * day), then your moves, relics and bag.
 */
function CharacterSheet({ daily, s }: { daily: Daily; s: MapState }) {
  const kit = kitOf(daily, s);
  const start = statsAt(LEVEL);
  const lv = levelOf(s.xp), next = LEVELS[lv];
  const gear = (slot: Slot) => {
    const o = occupant(daily, s, slot);
    if (!o) return null;
    return "bought" in o ? daily.shop.find((x) => x.id === o.bought)! : daily.map.recipes.find((x) => x.id === o.forged)!.gives;
  };
  const stats: Array<[string, number, number, string?]> = [
    ["Health", kit.stats.maxHp, start.maxHp],
    ["Attack", kit.stats.atk, start.atk],
    ["Defence", kit.stats.def, start.def],
    ["Speed", kit.stats.spd, start.spd],
    ["Crit chance", kit.stats.critChance, start.critChance, "%"],
  ];
  const bag = itemsLeft(daily, s);
  const potions = kit.potions - s.potionsUsed;
  const moves = [...s.loadout, ...kit.taught.filter((m) => !s.loadout.includes(m))];
  return (
    <div className="px-parchment px-shadow w-full max-w-2xl space-y-4 p-4 text-sm">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
        {/* Gear. */}
        <div className="order-2 space-y-2 sm:order-1">
          {(["weapon", "armour", "trinket"] as const).map((slot) => {
            const it = gear(slot);
            return (
              <div key={slot} className="flex items-start gap-2">
                <span className="px-well flex h-11 w-11 shrink-0 items-center justify-center">{it ? <Emoji e={it.emoji} size={28} /> : null}</span>
                <div className="min-w-0 text-xs">
                  <p className="text-[var(--muted)]">{SLOT_NAME[slot]}</p>
                  {it ? <><p className="font-semibold">{it.name}</p><p className="text-[var(--muted)]">{itemText(daily, it)}</p></> : <p className="text-[var(--muted)] italic">Empty: the shop or the forge</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* You. */}
        <div className="order-1 flex flex-col items-center sm:order-2">
          <div className="px-well flex h-36 w-28 items-end justify-center pb-2">
            <svg viewBox="0 0 12 16" width={72} height={96} shapeRendering="crispEdges" aria-hidden><Pixels grid={SPRITES.hero} /></svg>
          </div>
          <p className="mt-2 font-display text-lg text-[var(--gold)]">Level {lv}</p>
          <div className="relative mt-1 h-2.5 w-28 border border-black bg-[#3a2814]/30">
            <span className="absolute inset-y-0 left-0 bg-[#7a5ad0]" style={{ width: `${next == null ? 100 : ((s.xp - LEVELS[lv - 1]!) / (next - LEVELS[lv - 1]!)) * 100}%` }} />
          </div>
          <p className="mt-1 text-center text-xs text-[var(--muted)]">
            {next == null ? "Max level" : `${s.xp}/${next} XP to level ${lv + 1}`}<br />
            {lv > 1 ? `Levels: +${Math.round(LEVEL_BONUS * 100 * (lv - 1))}% attack and health` : `Each level: +${Math.round(LEVEL_BONUS * 100)}% attack and health`}
          </p>
        </div>

        {/* Stats. */}
        <div className="order-3 space-y-1">
          {stats.map(([name, now, was, unit = ""]) => {
            const diff = Math.round(now - was);
            return (
              <p key={name} className="flex justify-between gap-3 border-b border-dashed border-[var(--muted)]/30 pb-0.5">
                <span className="text-[var(--muted)]">{name}</span>
                <span className="tabular-nums">
                  <b>{name === "Health" ? `${s.hp}/${now}` : `${Math.round(now)}${unit}`}</b>
                  {diff !== 0 && <span className={`ml-1 text-xs ${diff > 0 ? "text-[var(--good)]" : "text-[#9a2a1a]"}`}>{diff > 0 ? "+" : "−"}{Math.abs(diff)}</span>}
                </span>
              </p>
            );
          })}
          <p className="flex justify-between gap-3"><span className="text-[var(--muted)]">Crit hits</span><b>×{kit.stats.critMultiplier}</b></p>
          {s.blessed && <p className="pt-1 text-xs">{daily.shrine.emoji} Blessed at the {daily.shrine.name}</p>}
        </div>
      </div>

      <div className="grid gap-4 border-t border-dashed border-[var(--muted)]/40 pt-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="font-display text-[var(--gold)]">Moves</p>
          {moves.length ? moves.map((id) => {
            const m = moveById(daily.config, id);
            return <p key={id} className="text-xs"><b>{m.emoji} {m.name}</b> <span className="text-[var(--muted)]">{describeMove(m, daily.config).does.join(" ")}</span></p>;
          }) : <p className="text-xs text-[var(--muted)] italic">Not picked yet: at the start or in town.</p>}
        </div>
        <div className="space-y-1.5">
          <p className="font-display text-[var(--gold)]">Relics</p>
          {s.relics.length ? RELICS.filter((r) => s.relics.includes(r.id)).map((r) => <p key={r.id} className="text-xs"><b>{r.emoji} {r.name}:</b> {r.text}</p>)
            : <p className="text-xs text-[var(--muted)] italic">None yet: beat an elite to choose one.</p>}
          <p className="pt-1 font-display text-[var(--gold)]">Bag</p>
          {potions > 0 || daily.shop.some((it) => it.use && (bag[it.id] ?? 0) > 0) ? (
            <>
              {potions > 0 && <p className="text-xs">{daily.shop.find((it) => it.heal)?.emoji ?? "🧪"} {daily.shop.find((it) => it.heal)?.name ?? "Potion"} ×{potions}</p>}
              {daily.shop.filter((it) => it.use && (bag[it.id] ?? 0) > 0).map((it) => <p key={it.id} className="text-xs">{it.emoji} {it.name} ×{bag[it.id]}</p>)}
            </>
          ) : <p className="text-xs text-[var(--muted)] italic">Nothing to use in a fight.</p>}
        </div>
      </div>
    </div>
  );
}

/** What you carry: materials, effect items and relics, in words (the HUD has them as icons). */
function Bag({ daily, s }: { daily: Daily; s: MapState }) {
  const mats = Object.entries(s.mats).filter(([, n]) => n > 0);
  const bag = itemsLeft(daily, s);
  const relics = RELICS.filter((r) => s.relics.includes(r.id));
  if (!mats.length && !relics.length && !Object.values(bag).some((n) => n > 0)) return null;
  return (
    <div className="space-y-1.5 border-t border-dashed border-[var(--muted)]/40 pt-3">
      <p className="font-display text-sm text-[var(--gold)]">🎒 Your bag</p>
      {mats.length > 0 && <p className="flex flex-wrap gap-x-3 gap-y-1">{mats.map(([name, n]) => <span key={name}>{findEmoji(daily, name)} {name} ×{n}</span>)}</p>}
      {daily.shop.filter((it) => it.use && (bag[it.id] ?? 0) > 0).map((it) => <p key={it.id}>{it.emoji} {it.name} ×{bag[it.id]}</p>)}
      {relics.map((r) => <p key={r.id}><b>{r.emoji} {r.name}:</b> {r.text}</p>)}
    </div>
  );
}

/** The name of what fills a slot, if anything. */
function occupantName(daily: Daily, s: MapState, slot: Slot): string | null {
  const o = occupant(daily, s, slot);
  if (!o) return null;
  if ("bought" in o) { const it = daily.shop.find((x) => x.id === o.bought)!; return `${it.emoji} ${it.name}`; }
  const r = daily.map.recipes.find((x) => x.id === o.forged)!;
  return `${r.gives.emoji} ${r.gives.name}`;
}

/** What each material sells for, with its emoji and rarity: gathered finds at their worth, trophies at nothing (they're for the forge). */
function matValues(daily: Daily): Map<string, { emoji: string; value: number; rarity: string }> {
  const values = new Map<string, { emoji: string; value: number; rarity: string }>();
  for (const n of daily.map.nodes) {
    for (const t of n.gather?.tiles ?? []) if (t && t !== "hazard") values.set(t.name, { emoji: t.emoji, value: t.value, rarity: t.rarity });
    if (n.trophy) values.set(n.trophy.name, { emoji: n.trophy.emoji, value: 0, rarity: "epic" });
  }
  return values;
}

/** One of the shop's goods, standing on the shelf: its slot, and its price tag under it. */
function Ware({ daily, it, owned, afford, on, onPick }: { daily: Daily; it: ShopItem; owned: number; afford: boolean; on: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} title={`${it.name}: ${itemText(daily, it)}`} className="group flex flex-col items-center gap-0.5">
      <span className="slot relative h-14 w-14 group-hover:brightness-125" style={{ borderColor: on ? "var(--accent)" : rarityColour(it.rarity), boxShadow: on ? "0 0 0 2px #000, 0 0 0 4px var(--accent)" : undefined }}>
        <span className={afford ? "" : "opacity-40 grayscale"}><Emoji e={it.emoji} size={36} /></span>
        {owned > 0 && <span className="absolute -right-1.5 -bottom-1.5 border-2 border-black bg-[var(--accent)] px-1 text-[10px] font-bold text-black">{it.stock > 1 ? `×${owned}` : "✓"}</span>}
      </span>
      {/* The price tag. */}
      <span className="flex items-center gap-0.5 border border-black bg-[#e9dcb4] px-1 text-[10px] font-bold tabular-nums text-[#3a2814]"><Sprite name="coin" size={10} />{it.price}</span>
    </button>
  );
}

/**
 * The town as a market stall you use: goods on the shelves to pick, your finds laid on the counter to
 * sell, and the merchant telling you about whatever you picked, with the Buy or Sell buttons.
 */
function MarketStall({ daily, s, theme, onBuy, onSell }: { daily: Daily; s: MapState; theme: Theme; onBuy: (id: string, add: boolean) => void; onSell: (name: string, count: number) => void }) {
  const [sel, setSel] = useState<{ kind: "item"; id: string } | { kind: "mat"; name: string } | null>(null);
  const values = matValues(daily);
  const carried = Object.entries(s.mats).filter(([, n]) => n > 0);
  const recipeFor = (name: string) => daily.map.recipes.find((r) => !s.crafted.includes(r.id) && r.needs.some((n) => n.name === name));
  const half = Math.ceil(daily.shop.length / 2);
  const owned = (id: string) => s.buys.filter((x) => x === id).length;
  const ware = (it: ShopItem) => (
    <Ware key={it.id} daily={daily} it={it} owned={owned(it.id)} afford={s.gold >= it.price || owned(it.id) > 0} on={sel?.kind === "item" && sel.id === it.id} onPick={() => setSel({ kind: "item", id: it.id })} />
  );
  const item = sel?.kind === "item" ? daily.shop.find((x) => x.id === sel.id) : undefined;
  const mat = sel?.kind === "mat" ? carried.find(([name]) => name === sel.name) : undefined;

  let says: React.ReactNode = (
    <p>{greeting("merchant", daily.day)} <span className="text-[var(--muted)]">Pick something off the shelf{carried.length ? ", or something on the counter to sell it" : ""}.</span></p>
  );
  if (item) {
    const n = owned(item.id);
    // Gear for a filled slot swaps in: what's there is discarded, not refunded.
    const replaces = item.slot && n === 0 ? occupantName(daily, s, item.slot) : null;
    says = (
      <div className="space-y-1">
        <p className="font-display text-base" style={{ color: inkColour(item.rarity) }}>{item.emoji} {item.name}</p>
        <p>{itemText(daily, item)}</p>
        {item.slot && <p className={replaces ? "text-[#9a2a1a]" : "text-[var(--muted)]"}>{SLOT_NAME[item.slot]} slot{n ? ": you have it on." : replaces ? `: replaces your ${replaces} (no refund).` : ""}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="flex items-center gap-1 font-bold"><Sprite name="coin" size={12} />{item.price}{item.stock > 1 ? ` · up to ${item.stock}` : ""}</span>
          {(item.stock > 1 || n === 0) && <button type="button" className="btn px-3 py-1 text-xs" disabled={n >= item.stock || s.gold < item.price} onClick={() => onBuy(item.id, true)}>{replaces ? "Swap in" : "Buy"}</button>}
          {n > 0 && !item.slot && <button type="button" className="btn btn-stone px-3 py-1 text-xs" onClick={() => onBuy(item.id, false)}>{item.stock > 1 ? `Return one (${n})` : "Return"}</button>}
        </div>
      </div>
    );
  } else if (mat) {
    const [name, n] = mat;
    const v = values.get(name);
    const r = recipeFor(name);
    says = (
      <div className="space-y-1">
        <p className="font-display text-base" style={{ color: inkColour(v?.rarity ?? "common") }}>{v?.emoji} {name} ×{n}</p>
        {v?.value ? <p>I&apos;ll give you <b>{v.value}</b> gold apiece.</p> : <p>No use to me. Take it to the forge.</p>}
        {r && <p className="text-[#9a2a1a]">The forge needs this for {r.gives.emoji} {r.gives.name}.</p>}
        {!!v?.value && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="btn btn-stone px-3 py-1 text-xs" onClick={() => onSell(name, 1)}>Sell 1 · {v.value}</button>
            {n > 1 && <button type="button" className="btn btn-stone px-3 py-1 text-xs" onClick={() => onSell(name, n)}>Sell all · {v.value * n}</button>}
          </div>
        )}
      </div>
    );
  }

  return (
    <Stall
      theme={theme}
      shelves={[<Shelf key="a">{daily.shop.slice(0, half).map(ware)}</Shelf>, <Shelf key="b">{daily.shop.slice(half).map(ware)}</Shelf>]}
      says={says}
      counter={carried.length ? (
        // Your finds, laid on the counter: tap one to sell it.
        <div className="flex flex-wrap justify-center gap-2">
          {carried.map(([name, n]) => {
            const v = values.get(name);
            const on = sel?.kind === "mat" && sel.name === name;
            return (
              <button key={name} type="button" title={name} onClick={() => setSel({ kind: "mat", name })} className="slot relative h-11 w-11 hover:brightness-125" style={{ borderColor: on ? "var(--accent)" : rarityColour(v?.rarity ?? "common"), boxShadow: on ? "0 0 0 2px #000, 0 0 0 4px var(--accent)" : undefined }}>
                <Emoji e={v?.emoji ?? "📦"} size={28} />
                <span className="absolute right-0.5 bottom-0 text-[10px] font-bold [text-shadow:1px_1px_0_#000,-1px_-1px_0_#000]">{n}</span>
                {recipeFor(name) && <span className="absolute top-0 left-0.5 text-[9px]">⚒️</span>}
              </button>
            );
          })}
        </div>
      ) : <p className="text-center text-xs text-[#f2e4bf]/70">Nothing of yours to sell. Gather some finds first.</p>}
    />
  );
}

/**
 * The forge as a smithy you use: today's recipes pinned to the wall, the smith telling you what the one
 * you picked needs, and the Forge button on the anvil.
 */
function ForgeScene({ daily, s, struck, onCraft }: { daily: Daily; s: MapState; struck: number; onCraft: (id: string) => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const r = daily.map.recipes.find((x) => x.id === pick);
  const made = !!r && s.crafted.includes(r.id);
  const ready = !!r && r.needs.every((n) => (s.mats[n.name] ?? 0) >= n.count);
  const replaces = r && !made && r.gives.slot ? occupantName(daily, s, r.gives.slot) : null;
  return (
    <Smithy
      struck={struck}
      notices={daily.map.recipes.map((x) => {
        const done = s.crafted.includes(x.id);
        const can = x.needs.every((n) => (s.mats[n.name] ?? 0) >= n.count);
        return (
          // A notice pinned to the wall: what the recipe makes.
          <button key={x.id} type="button" onClick={() => setPick(x.id)}
            className={`px-parchment px-shadow relative flex w-36 flex-col items-center gap-0.5 px-2 pt-3 pb-1.5 text-center text-xs ${pick === x.id ? "-translate-y-1 outline-2 outline-[var(--accent)]" : "hover:-translate-y-0.5"}`}>
            <span className="absolute top-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full border border-black bg-[#7d8290]" />
            <Emoji e={x.gives.emoji} size={28} />
            <b className="leading-tight" style={{ color: inkColour(x.gives.rarity) }}>{x.gives.name}</b>
            <span className="text-[10px] text-[var(--muted)]">{done ? "Made ✓" : can ? "Ready to forge" : "Needs more"}</span>
          </button>
        );
      })}
      says={r ? (
        <div className="space-y-1">
          <p className="font-display text-base" style={{ color: inkColour(r.gives.rarity) }}>{r.gives.emoji} {r.gives.name}</p>
          <p>{itemText(daily, r.gives)}</p>
          <p className="flex flex-wrap gap-x-2">
            {r.needs.map((n) => {
              const have = s.mats[n.name] ?? 0;
              return <span key={n.name} className={have >= n.count ? "font-bold text-[var(--good)]" : ""}>{n.emoji} {n.name} {Math.min(have, n.count)}/{n.count}</span>;
            })}
          </p>
          {replaces && <p className="text-[#9a2a1a]">Replaces your {replaces} (it&apos;s discarded).</p>}
          {made ? <p className="text-[var(--muted)]">Already made.</p> : !ready && <p className="text-[var(--muted)]">Bring me the rest. The ⚒️ on the map shows where.</p>}
        </div>
      ) : <p>{greeting("smith", daily.day)} <span className="text-[var(--muted)]">Pick a recipe on the wall.</span></p>}
      anvil={r && (
        <button type="button" className="btn px-4 py-1.5 text-sm" disabled={made || !ready} onClick={() => onCraft(r.id)}>{made ? "Made" : "⚒️ Forge (1h)"}</button>
      )}
    />
  );
}

/** How far into the current level your XP is, 0 to 1 (1 at the top level). */
function xpShare(xp: number): number {
  const lv = levelOf(xp);
  const from = LEVELS[lv - 1]!, to = LEVELS[lv];
  return to == null ? 1 : (xp - from) / (to - from);
}

/** The top of the screen: the day, the clock, and what you carry. */
/** The time of day, in words, for the clock. */
function partOfDay(h: number): string {
  return h < 2 ? "Dawn" : h < 12 ? "Morning" : h < 15 ? "Afternoon" : h < 18 ? "Dusk" : "Night";
}

/**
 * The HUD, like a game's: your unit frame on the left (portrait, level, health
 * and XP), the day's clock in the middle as the sun (then the moon) crossing a
 * sky arc, and what you carry on the right.
 */
function Hud({ daily, s, kitMax }: { daily: Daily; s: MapState; kitMax: number }) {
  const mats = Object.values(s.mats).reduce((a, b) => a + b, 0);
  const lv = levelOf(s.xp), next = LEVELS[lv];
  const t = Math.min(1, s.hour / HOURS);
  const at = (f: number) => ({ x: 110 - 100 * Math.cos(Math.PI * f), y: 46 - 38 * Math.sin(Math.PI * f) });
  const sun = at(t), night = at(18 / HOURS);
  const arc = "M10,46 A100,38 0 0 1 210,46";
  return (
    <header className="sticky top-0 z-20 border-b-[3px] border-black bg-[#120e0b]/95 px-3 py-2 shadow-[0_3px_0_#3b3226]">
      <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* You. */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="px-well flex h-10 w-10 shrink-0 items-end justify-center sm:h-12 sm:w-12">
            <svg viewBox="0 0 12 16" width={27} height={36} shapeRendering="crispEdges" aria-hidden><Pixels grid={SPRITES.hero} /></svg>
          </span>
          <div className="w-20 min-w-0 space-y-0.5 sm:w-44">
            <p className="flex items-baseline justify-between text-xs">
              <span className="hidden font-display text-sm text-[var(--gold)] sm:inline">You</span>
              <span title={`Each level: +${Math.round(LEVEL_BONUS * 100)}% ATK and max HP. Enemies give ${XP.enemy} XP, elites ${XP.elite}.`} className="text-[var(--muted)]"><span className="hidden sm:inline">Level</span><span className="sm:hidden">Lv</span> {lv}</span>
            </p>
            <div className="relative h-3 border-2 border-black bg-[#0a0806]">
              <motion.span className="absolute inset-y-0 left-0 bg-[#5f9a4a]" animate={{ width: `${Math.min(100, (s.hp / kitMax) * 100)}%` }} transition={{ duration: 0.4 }} />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] leading-none font-bold tabular-nums text-white [text-shadow:1px_1px_0_#000]">{s.hp} / {kitMax}</span>
            </div>
            <div title={next == null ? "Max level" : `${s.xp}/${next} XP to level ${lv + 1}`} className="relative h-1.5 border border-black bg-[#0a0806]">
              <motion.span className="absolute inset-y-0 left-0 bg-[#7a5ad0]" animate={{ width: `${xpShare(s.xp) * 100}%` }} transition={{ duration: 0.4 }} />
            </div>
          </div>
        </div>

        {/* The clock: the sun crossing the day, the moon after 18h. */}
        <div className="flex flex-col items-center">
          <svg viewBox="0 0 220 52" aria-hidden className="h-7 w-28 overflow-visible sm:h-[42px] sm:w-[180px]">
            <path d={arc} fill="none" stroke="#3b3226" strokeWidth={4} strokeDasharray="6 4" />
            <path d={arc} fill="none" stroke="#1a1a3a" strokeWidth={4} pathLength={1} strokeDasharray={`0 ${18 / HOURS} 1`} />
            <path d={arc} fill="none" stroke={s.hour >= 18 ? "#6a6ab0" : "#c99a4a"} strokeWidth={4} pathLength={1} strokeDasharray={`${t} 1`} />
            <circle cx={night.x} cy={night.y} r={3} fill="#6a6ab0" />
          </svg>
          <motion.span className="absolute hidden sm:block" style={{ marginTop: -6 }} animate={{ x: (sun.x - 110) * (180 / 220), y: (sun.y - 26) * (42 / 52) }} transition={{ type: "spring", stiffness: 160, damping: 22 }}>
            <Emoji e={s.hour >= 18 ? "🌙" : "☀️"} size={22} />
          </motion.span>
          <p className="-mt-1 font-display text-sm leading-none tabular-nums text-[var(--gold)]">
            {hrs(s.hour)} <span className="text-xs text-[var(--muted)]"><span className="hidden sm:inline">· {partOfDay(s.hour)} </span>· {hrs(HOURS - s.hour)} left</span>
          </p>
        </div>

        {/* What you carry, and where you are. */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2 tabular-nums">
            {s.relics.map((id) => { const r = RELICS.find((x) => x.id === id)!; return <span key={id} title={`${r.name}: ${r.text}`}><Emoji e={r.emoji} size={18} /></span>; })}
            {mats > 0 && <span title="Materials carried" className="text-xs">🎒 {mats}</span>}
            <span className="px-well flex items-center gap-1 px-2 py-0.5 font-display text-base text-[var(--gold)]"><Sprite name="coin" size={16} />{s.gold}</span>
          </div>
          <Link href="/" className="hidden items-center gap-1.5 text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] sm:flex">
            {/* eslint-disable-next-line @next/next/no-img-element -- the 64px pixel logo */}
            <img src="/logo.png" alt="" width={14} height={14} className="[image-rendering:pixelated]" />
            <span className="hidden sm:inline">havocish daily ·</span> #{daily.day} · {daily.world}
          </Link>
        </div>
      </div>
    </header>
  );
}

/** The day's gathering minigame, laid out for its kind. */
function GatherView({ spec, theme, dug, opened, onDig }: { spec: GatherSpec; theme: Theme; dug: GatherState; opened: number[]; onDig: (i: number) => void }) {
  const g = spec;
  return (
    <div className="space-y-6">
      <Heading emoji={g.emoji} title={g.name} sub={g.place} />
      <p className="mx-auto max-w-md text-center text-sm leading-relaxed text-[var(--foreground)]/80">{RULES[g.game]}</p>

      <div className="flex items-end justify-center gap-6">
        <div className="text-center">
          <motion.p key={dug.gold} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="flex items-center justify-center gap-2 font-display text-4xl text-[var(--gold)] tabular-nums [text-shadow:2px_2px_0_#000]"><Sprite name="coin" size={32} /> {dug.gold}</motion.p>
          <p className="text-xs text-[var(--muted)]">found</p>
        </div>
        <div className="pb-1 text-center">
          <p className="flex gap-1">
            {Array.from({ length: dug.triesLeft + dug.opened.length }, (_, i) => (
              <span key={i} className="h-3 w-3 border-2 border-black" style={{ background: i < dug.triesLeft ? theme.tint : "#2a2219" }} />
            ))}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">{dug.triesLeft} {g.game === "pulls" ? "pulls" : "tries"} left</p>
        </div>
      </div>

      {g.game === "pulls" ? <Pulls spec={g} theme={theme} dug={dug} opened={opened} onPull={(landed) => onDig(landed ? opened.length : SNAP)} /> : g.game === "tunnel" ? <Shaft spec={g} dug={dug} opened={opened} onDig={onDig} /> : (
        <div className="mx-auto grid w-fit gap-2" style={{ perspective: 600, gridTemplateColumns: g.game === "grid" ? "repeat(4, auto) auto" : "repeat(4, auto)" }}>
          {g.tiles.flatMap((tile, i) => {
            const shown = opened.includes(i);
            const open = !shown && !dug.end;
            const hint = shown && tile !== "hazard" ? hintsAt(g, opened, i) : null;
            const counts = g.game === "grid" ? gridCounts(g) : null;
            // The grid's clue at the end of each row, and a row of column clues under it.
            const rowClue = counts && i % 4 === 3 ? [<Clue key={`r${i}`} n={counts.rows[Math.floor(i / 4)]!} />] : [];
            const colClues = counts && i === g.tiles.length - 1 ? [...counts.cols.map((n, c) => <Clue key={`c${c}`} n={n} />), <span key="corner" />] : [];
            return [
              <motion.button
                key={i}
                type="button"
                onClick={() => onDig(i)}
                disabled={!open}
                aria-label={shown ? (tile === "hazard" ? "Hazard" : tile ? tile.name : "Nothing") : "Hidden tile"}
                title={shown && tile && tile !== "hazard" ? `${tile.name}: ${tile.value} gold` : undefined}
                animate={{ rotateY: shown ? 180 : 0 }}
                whileHover={open ? { y: -3 } : {}}
                transition={{ duration: 0.35 }}
                className="relative h-16 w-16 [transform-style:preserve-3d] sm:h-20 sm:w-20"
              >
                {/* Face down: a block of the world's stone. */}
                <span
                  className={`${open ? "px-frame-gold" : "px-tile"} px-shadow absolute inset-0 flex items-center justify-center font-display text-xl [backface-visibility:hidden]`}
                  style={{ color: open ? "var(--gold)" : "#8a7656" }}
                >
                  ?
                </span>
                {/* Face up: what was under it. */}
                <span
                  className={`${tile === "hazard" ? "px-frame-red" : "px-well"} absolute inset-0 flex flex-col items-center justify-center [backface-visibility:hidden] [transform:rotateY(180deg)]`}
                >
                  {tile === "hazard" ? <Emoji e="💥" size={30} /> : tile ? (
                    <>
                      <Emoji e={tile.emoji} size={28} />
                      <span className="text-[11px] font-semibold tabular-nums text-[var(--gold)]">+{tile.value}</span>
                    </>
                  ) : hint && hint.danger > 0 ? null : <span className="text-[var(--muted)]">·</span>}
                  {/* What it tells you: a red number for the hazards touching it (big on an empty tile), a gold spark for a find next door. */}
                  {hint && hint.danger > 0 && (
                    <span title={`${hint.danger} ${g.game === "tunnel" ? "cave-in" : "hazard"}${hint.danger === 1 ? "" : "s"} touching this`}
                      className={`absolute font-display font-bold text-[#ff7a5a] [text-shadow:1px_1px_0_#000] ${tile ? "top-0.5 left-1.5 text-base" : "inset-0 flex items-center justify-center text-3xl"}`}>
                      {hint.danger}
                    </span>
                  )}
                  {hint?.glint && <Spark />}
                </span>
              </motion.button>,
              ...rowClue,
              ...colClues,
            ];
          })}
        </div>
      )}
      {g.game === "grid" && (
        // The clues, shown rather than explained.
        <div className="mx-auto flex w-fit flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
          <span className="flex items-center gap-1.5"><b className="font-display text-base text-[#ff7a5a]">2</b> hazards touching it</span>
          <span className="flex items-center gap-1.5"><span className="relative inline-block h-3 w-3"><Spark /></span> a find next to it</span>
          <span className="flex items-center gap-1.5"><b className="font-display text-base text-[#ff7a5a]">1</b> on the edge: hazards in that row or column</span>
        </div>
      )}
    </div>
  );
}

/** Cracks in the rock: a cave-in. */
function Cracks() {
  return (
    <svg viewBox="0 0 20 20" className="pointer-events-none absolute inset-0 h-full w-full" shapeRendering="crispEdges" aria-hidden>
      <polyline points="3,2 7,7 5,10 10,14 8,18" fill="none" stroke="#ff7a5a" strokeWidth={1.4} />
      <polyline points="16,3 13,8 15,11 12,16" fill="none" stroke="#ff7a5a" strokeWidth={1.2} />
    </svg>
  );
}

/**
 * The descent, seen from the side: the shaft's levels top to bottom, three spots across. You dig one a
 * level, straight down or one step aside; the spot right under you shows cracks (a cave-in) or a glint (ore).
 */
function Shaft({ spec, dug, opened, onDig }: { spec: GatherSpec; dug: GatherState; opened: number[]; onDig: (i: number) => void }) {
  const below = shaftHint(spec, opened);
  const last = opened.at(-1);
  return (
    <div className="mx-auto w-fit">
      <div className="mb-1 flex items-end gap-2">
        <span className="w-12" />
        <div className="h-3 flex-1 border-2 border-black bg-[#4a5a32]" />
      </div>
      {Array.from({ length: TUNNEL.rows }, (_, row) => {
        const ahead = row === opened.length && !dug.end;
        const past = row < opened.length;
        return (
          <div key={row} className="flex items-center gap-2">
            <span className="w-12 text-right text-xs tabular-nums text-[var(--muted)]">{(row + 1) * 10} m</span>
            <div className={`flex gap-1 border-x-4 border-[#2a2219] bg-[#1a1510] px-1 py-1 ${!past && !ahead ? "opacity-35" : ""}`}>
              {Array.from({ length: TUNNEL.cols }, (_, col) => {
                const i = row * TUNNEL.cols + col;
                const tile = spec.tiles[i];
                const shown = opened.includes(i);
                const can = ahead && canDig(opened, i);
                const underYou = last != null && i === last + TUNNEL.cols && !dug.end;
                return (
                  <motion.button
                    key={col} type="button" disabled={!can} onClick={() => onDig(i)} whileHover={can ? { y: -2 } : {}}
                    aria-label={shown ? (tile === "hazard" ? "Cave-in" : tile ? tile.name : "Nothing") : can ? "Dig here" : "Rock"}
                    className={`relative flex h-14 w-16 flex-col items-center justify-center sm:h-16 sm:w-20 ${shown ? (tile === "hazard" ? "px-frame-red" : "px-well") : can ? "px-frame-gold" : "px-tile"}`}
                  >
                    {shown ? (tile === "hazard" ? <Emoji e="💥" size={26} /> : tile ? (
                      <>
                        <Emoji e={tile.emoji} size={24} />
                        <span className="text-[11px] font-semibold tabular-nums text-[var(--gold)]">+{tile.value}</span>
                      </>
                    ) : <span className="text-[var(--muted)]">·</span>) : can ? <span className="font-display text-[var(--gold)]">⛏</span> : null}
                    {/* What you can see from where you stand: only the spot right under you. */}
                    {underYou && below?.cracks && <Cracks />}
                    {underYou && below?.glint && <Spark />}
                    {underYou && below && !below.cracks && !below.glint && <span className="absolute bottom-0.5 text-[10px] text-[var(--muted)]">safe</span>}
                    {shown && i === last && !dug.end && <span className="absolute -top-2 -right-2"><Emoji e="⛏️" size={18} /></span>}
                  </motion.button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
        <span className="flex items-center gap-1.5"><span className="relative inline-block h-4 w-4 bg-[#2e261c]"><Cracks /></span> cave-in below</span>
        <span className="flex items-center gap-1.5"><span className="relative inline-block h-3 w-3"><Spark /></span> ore below</span>
        <span>deeper is richer</span>
      </div>
    </div>
  );
}

/** The gold spark on a dug tile: a find lies next to it. */
function Spark() {
  return <span aria-label="A find lies next to this" className="absolute right-1 bottom-1 h-2 w-2 rotate-45 bg-[#ffd27a] shadow-[0_0_6px_#ffd27a]" style={{ animation: "daily-twinkle 1.4s ease-in-out infinite" }} />;
}

/** A grid clue: how many hazards a row or column holds. */
function Clue({ n }: { n: number }) {
  return (
    <span title={`${n} hazard${n === 1 ? "" : "s"} in this line`} className={`flex min-w-8 items-center justify-center self-center font-display text-base ${n ? "text-[#ff8a6a]" : "text-[var(--muted)]"}`}>
      {n || "·"}
    </span>
  );
}

/**
 * Pulls, played on timing: a marker sweeps the tension bar and you reel (click, or space) when it's in
 * the zone. Land it and the catch comes up; miss and the line snaps. Each zone is narrower and faster.
 */
function Pulls({ spec, theme, dug, opened, onPull }: { spec: GatherSpec; theme: Theme; dug: GatherState; opened: number[]; onPull: (landed: boolean) => void }) {
  const k = opened.length;
  const zone = reelZone(spec, k);
  const marker = useRef<HTMLSpanElement>(null);
  const start = useRef(0);
  const live = !dug.end && k < PULLS.zone.length;
  // Where the marker is now: back and forth across the bar, `speed` sweeps a second.
  const at = useCallback(() => {
    const phase = (((performance.now() - start.current) / 1000) * zone.speed) % 2;
    return phase < 1 ? phase : 2 - phase;
  }, [zone.speed]);
  useEffect(() => {
    if (!live) return;
    start.current = performance.now();
    let frame = requestAnimationFrame(function tick() {
      if (marker.current) marker.current.style.left = `${at() * 100}%`;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [live, k, at]);
  const reel = useCallback(() => { if (live) onPull(Math.abs(at() - zone.centre) <= zone.width / 2); }, [live, at, zone.centre, zone.width, onPull]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === " ") { e.preventDefault(); reel(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [reel]);

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center">
      <div className="h-6 w-[3px]" style={{ background: theme.tint }} />
      <ul className="w-full space-y-2">
        <AnimatePresence>
          {opened.map((i) => {
            const t = i === SNAP ? "hazard" : spec.tiles[i];
            return (
              <motion.li
                key={i}
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex items-center gap-3 px-3 py-2 ${t === "hazard" ? "px-frame-red px-shadow" : PANEL}`}
              >
                {t === "hazard" ? (
                  <><Emoji e="💥" size={28} /><span className="font-display text-lg text-[#f2c4b0]">Snap! The line broke.</span></>
                ) : t ? (
                  <>
                    <Emoji e={t.emoji} size={28} />
                    <span className="flex-1" style={{ color: rarityColour(t.rarity) }}>{t.name}</span>
                    <span className="font-semibold tabular-nums text-[var(--gold)]">+{t.value}</span>
                  </>
                ) : null}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {live && (
        <div className="mt-4 w-full space-y-2">
          {/* The tension bar: the zone to land it in, and the marker sweeping. */}
          <div className="relative h-8 border-[3px] border-black bg-[#0a0806]" onClick={reel}>
            <span className="absolute inset-y-0 bg-[#5f9a4a]/80 shadow-[inset_0_0_0_2px_#9fe08a]" style={{ left: `${(zone.centre - zone.width / 2) * 100}%`, width: `${zone.width * 100}%` }} />
            <span ref={marker} className="absolute -top-1.5 -bottom-1.5 w-1.5 -translate-x-1/2 border-x-2 border-black bg-[#ffd27a]" />
          </div>
          <motion.button type="button" onClick={reel} whileTap={{ scale: 0.95 }} className="btn w-full flex-col py-3">
            <span className="text-lg">🎣 {k ? "Reel again" : "Cast and reel"} <span className="text-xs opacity-70">(space)</span></span>
            <span className="text-xs opacity-80">Catch {k + 1} of {PULLS.zone.length} · the zone gets smaller each time</span>
          </motion.button>
        </div>
      )}
    </div>
  );
}

/** Your moves: the day's spellbook to pick four from, and what the one you're looking at does. */
function MovesView({ daily, loadout, onMove }: { daily: Daily; loadout: string[]; onMove: (id: string) => void }) {
  const [look, setLook] = useState(daily.movePool[0]!);
  const move = moveById(daily.config, look);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl text-[var(--gold)] [text-shadow:2px_2px_0_#000]">Your moves <span className="text-sm text-[var(--muted)]">· pick {LOADOUT_SIZE}</span></h2>
        <p className="text-sm text-[var(--muted)] [text-shadow:1px_1px_0_#000]">You take them into every fight. You can change them in town.</p>
      </div>
      <ul className="flex flex-wrap gap-3">
        {daily.movePool.map((id) => {
          const m = moveById(daily.config, id);
          const on = loadout.includes(id);
          return (
            <li key={id}>
              <button type="button" onClick={() => { setLook(id); onMove(id); }} className="group flex w-16 flex-col items-center gap-1">
                <span className="slot relative h-14 w-14 group-hover:brightness-125" style={{ borderColor: on ? "var(--accent)" : undefined, boxShadow: look === id ? "0 0 0 2px #000, 0 0 0 4px var(--accent)" : undefined }}>
                  <Emoji e={m.emoji} size={34} />
                  {on && <span className="absolute -right-1.5 -bottom-1.5 border-2 border-black bg-[var(--accent)] px-1 text-[10px] font-bold text-black">{loadout.indexOf(id) + 1}</span>}
                </span>
                <span className={`line-clamp-2 text-center text-[11px] leading-tight [text-shadow:1px_1px_0_#000] ${on ? "text-[var(--gold)]" : "text-[var(--foreground)]"}`}>{m.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <motion.div key={look} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="px-frame px-shadow max-w-md p-3 text-sm">
        <div className="flex items-start gap-3">
          <span className="slot h-14 w-14 shrink-0"><Emoji e={move.emoji} size={36} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base text-[var(--gold)]">{move.name}</p>
            {describeMove(move, daily.config).does.map((d) => <p key={d}>{d}</p>)}
            {describeMove(move, daily.config).drawbacks.map((d) => <p key={d} className="text-[#e0a070]">⚠️ {d}</p>)}
            <p className="mt-1 text-xs text-[var(--muted)]">{loadout.includes(move.id) ? "On your bar. Tap it again to take it off." : loadout.length < LOADOUT_SIZE ? "Tap to put it on your bar." : "Your bar is full: take one off first."}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
