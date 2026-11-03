"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DRINK, TRAITS, USE, WAIT, type Daily, type ShopItem } from "@content/daily";
import { comingNext, describeMove, ENERGY_MAX, hitEstimate, intentLine, intentThreat, landsThisTurn, moveById, turnOrderLine, usable, type Fight, type FighterState } from "@content/fight";
import { Inline } from "@/app/components/ui/markdown";
import { Pixels, Sprite } from "@/app/components/ui/sprite";
import { SPRITES } from "@/app/sprites";
import { Emoji } from "./emoji";
import { HORIZON } from "./landscape";

/*
 * A fight laid out like a game screen rather than a card: unit frames in the
 * top corners, the enemy standing in the world with what it does next above
 * it, the turn's log floating bottom left, and an action bar along the bottom
 * (number keys work). Everything shown comes from the fight engine.
 */

/** The callout's frame and text, by how worrying the enemy's next move is. */
const THREAT = {
  danger: { frame: "px-frame-red", text: "#f6d2c2" },
  defend: { frame: "px-frame-blue", text: "#d4e0f6" },
  normal: { frame: "px-frame", text: "var(--foreground)" },
} as const;

/** An HP bar that drains, chunky like the old default UI: lit top row, shaded bottom, notched; a pale trail shows the hit. */
function HpBar({ hp, max, colour }: { hp: number; max: number; colour: string }) {
  const pct = `${Math.max(0, (hp / max) * 100)}%`;
  return (
    <div className="relative h-[14px] overflow-hidden border-2 border-black bg-[#0a0806]">
      <motion.div className="absolute inset-y-0 left-0 bg-[#e8dcc0]" animate={{ width: pct }} transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }} />
      <motion.div
        className="absolute inset-y-0 left-0"
        style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${colour} 60%, white) 0 2px, ${colour} 2px 7px, color-mix(in srgb, ${colour} 55%, black) 7px)` }}
        animate={{ width: pct }} transition={{ duration: 0.2 }}
      />
      <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(90deg, transparent 0 8px, rgb(0 0 0 / 0.5) 8px 10px)" }} />
    </div>
  );
}

/** Energy pips: what's banked for the costly moves. */
function Energy({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-1" title={`${n} energy`}>
      {Array.from({ length: ENERGY_MAX }, (_, i) => (
        <motion.span key={i} animate={{ scale: i < n ? [1.4, 1] : 1 }} className="h-2.5 w-2.5 border-2 border-black" style={{ background: i < n ? "#ffd166" : "#2a2219" }} />
      ))}
      <span className="text-[10px] text-[#ffd166] [text-shadow:1px_1px_0_#000]">⚡</span>
    </span>
  );
}

/** What's on a fighter: statuses with turns left, a wind-up, a stun. */
function Chips({ daily, st }: { daily: Daily; st: FighterState }) {
  const statuses = daily.config.combat?.statuses ?? {};
  const chips = [
    ...Object.entries(st.statuses).map(([id, turns]) => ({ key: id, emoji: statuses[id]?.emoji ?? "✨", label: `${statuses[id]?.name ?? id} · ${turns}` })),
    ...(st.charging ? [{ key: "charge", emoji: "⏳", label: `Winding up · ${st.charging.turnsLeft}` }] : []),
    ...(st.stunned ? [{ key: "stun", emoji: "💫", label: "Stunned" }] : []),
  ];
  if (!chips.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c.key} title={c.label} className="flex items-center gap-1 border-2 border-black bg-[#1d1914] px-1 text-[10px] text-[var(--foreground)] shadow-[inset_0_0_0_1px_#4a3e2e]">
          <Emoji e={c.emoji} size={12} /> {c.label}
        </span>
      ))}
    </span>
  );
}

/** A unit frame, as in the top corners of the old default UI: portrait, name, health, what's on it. */
function UnitFrame({ portrait, name, hp, max, colour, children, hit, turn, flip }: {
  portrait: React.ReactNode; name: string; hp: number; max: number; colour: string; children?: React.ReactNode; hit: number; turn: number; flip?: boolean;
}) {
  return (
    <motion.div
      key={`${name}${turn}`}
      animate={hit > 0 ? { x: [0, -6, 5, -3, 0] } : {}}
      transition={{ duration: 0.35 }}
      className={`relative flex w-full max-w-[15rem] items-start gap-2 ${flip ? "flex-row-reverse text-right" : ""}`}
    >
      <span className="slot h-14 w-14 shrink-0">{portrait}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className={`flex items-baseline justify-between gap-2 ${flip ? "flex-row-reverse" : ""}`}>
          <span className="truncate font-display text-sm text-[var(--gold)] [text-shadow:2px_2px_0_#000]">{name}</span>
          <span className="text-[10px] tabular-nums text-[var(--foreground)] [text-shadow:1px_1px_0_#000]">{hp}/{max}</span>
        </div>
        <HpBar hp={hp} max={max} colour={colour} />
        {children}
      </div>
      <Hit n={hit} turn={turn} colour="#ff8a7a" className="left-1/2 top-2" />
    </motion.div>
  );
}

/** A number that rises off whoever took the hit. */
function Hit({ n, turn, crit, colour, className, delay = 0 }: { n: number; turn: number; crit?: boolean; colour: string; className: string; delay?: number }) {
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.span
          key={`hit${turn}`}
          initial={{ opacity: 0, y: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 1, 0], y: -44, scale: crit ? 1.5 : 1.1 }}
          transition={{ duration: 1.1, ease: "easeOut", delay }}
          className={`pointer-events-none absolute z-10 -translate-x-1/2 font-display text-3xl font-bold [text-shadow:3px_3px_0_#000,-1px_-1px_0_#000] ${className}`}
          style={{ color: crit ? "#ffd166" : colour }}
        >
          −{n}{crit ? "!" : ""}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/** You, as the hero sprite (app/sprites.ts), `h` pixels tall. */
function Hero({ h }: { h: number }) {
  return (
    <svg viewBox="0 0 12 16" width={(h * 12) / 16} height={h} shapeRendering="crispEdges" aria-hidden>
      <Pixels grid={SPRITES.hero} />
    </svg>
  );
}

/** A pixel slash across whatever was hit. */
function Slash({ turn }: { turn: number }) {
  return (
    <motion.svg
      key={`slash${turn}`} viewBox="0 0 16 16" width={96} height={96} shapeRendering="crispEdges"
      className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
      initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1.1, 1.1, 1.2] }} transition={{ delay: 0.18, duration: 0.35 }}
    >
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => <rect key={k} x={2 + k} y={13 - k} width={2} height={1} fill={k % 3 ? "#fff6dc" : "#ffd166"} />)}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => <rect key={`b${k}`} x={4 + k} y={14 - k} width={1} height={1} fill="#c9a03e" />)}
    </motion.svg>
  );
}

export function FightStage({ daily, fight, log, moves, potion, potions, items = [], boss, lastPick, onPick, children }: {
  daily: Daily; fight: Fight; log: string[]; moves: string[]; potion: ShopItem | undefined; potions: number; items?: Array<{ item: ShopItem; left: number }>; boss: boolean;
  lastPick: string | null; onPick: (id: string) => void; children?: React.ReactNode;
}) {
  const enemy = fight.enemy;
  const me = fight.members[0]!;
  const over = fight.enemyCurrentHp <= 0 || me.hp <= 0 || !!children;
  const threat = THREAT[over ? "normal" : intentThreat(fight, daily.config)];
  const landing = over ? null : landsThisTurn(fight, daily.config);
  const incoming = landing ? hitEstimate(fight, daily.config, landing.id, "foe") : 0;
  const turn = fight.round;
  const dealt = fight.lastHits?.enemy ?? 0;
  const taken = fight.lastHits?.members.you ?? 0;
  const crit = log.some((l) => l.includes("critical") && l.includes("**You**"));
  const picked = lastPick && lastPick !== DRINK && lastPick !== WAIT ? moveById(daily.config, lastPick) : null;
  const guarded = !!picked?.effects.some((e) => e.type === "guard");
  const drank = lastPick === DRINK && turn > 0;
  const winding = fight.foe.charging && !over;
  const size = boss ? 168 : 136;
  // The turn's big moments, read from what happened: each gets a banner, and the hard ones shake the screen.
  const said = (bit: string) => log.some((l) => l.includes(bit));
  const killed = fight.enemyCurrentHp <= 0 && dealt > 0;
  const bigHit = taken >= me.stats.maxHp * 0.2;
  const moment = killed ? null
    : guarded && said("**0** damage (blocked") ? { text: "PARRY!", colour: "#8ac0ff" }
    : said("interrupted 💫") ? { text: "INTERRUPTED!", colour: "#ffd27a" }
    : crit ? { text: "CRITICAL!", colour: "#ff9a4a" }
    : said("is enraged") ? { text: "ENRAGED!", colour: "#ff5a4a" }
    : null;
  const lowHp = me.hp > 0 && me.hp < me.stats.maxHp * 0.25;
  // A boss's entrance: the screen goes dark, its name slams in with its traits, and it rises into view.
  const [entering, setEntering] = useState(boss && fight.round === 0);
  useEffect(() => {
    if (!entering) return;
    const t = setTimeout(() => setEntering(false), 2600);
    return () => clearTimeout(t);
  }, [entering]);
  const traits = ((fight.enemy as { traits?: string[] }).traits ?? []).flatMap((id) => TRAITS.filter((t) => t.id === id));

  return (
    <div className="pb-40">
      {/* The unit frames: you, and what you're fighting. */}
      <div className="flex items-start justify-between gap-4">
        <UnitFrame portrait={<Sprite name="hood" size={40} />} name="You" hp={me.hp} max={me.stats.maxHp} colour="#5f9a4a" hit={0} turn={turn}>
          {me.state.energy != null && <Energy n={me.state.energy} />}
          <Chips daily={daily} st={me.state} />
        </UnitFrame>
        <UnitFrame portrait={<Emoji e={enemy.emoji} size={40} />} name={enemy.name} hp={fight.enemyCurrentHp} max={fight.enemyMaxHp} colour="#b5523b" hit={0} turn={turn} flip>
          <Chips daily={daily} st={fight.foe} />
          {/* A boss's traits, kept in view through the fight. */}
          {((fight.enemy as { traits?: string[] }).traits ?? []).length > 0 && (
            <span className="flex flex-wrap justify-end gap-1">
              {((fight.enemy as { traits?: string[] }).traits ?? []).map((id) => { const t = TRAITS.find((x) => x.id === id); return t ? <span key={id} title={t.text} className="border-2 border-black bg-[#3c140e] px-1 text-[10px] text-[#f6d2c2]">{t.emoji} {t.name}</span> : null; })}
            </span>
          )}
        </UnitFrame>
      </div>

      {entering && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/85 px-4 text-center" style={{ animation: "daily-curtain 2.6s ease both" }}>
          <span className="font-display text-sm tracking-[0.4em] text-[#ff7060]">« QUEST »</span>
          <span className="font-display text-5xl uppercase text-[#f2e4bf] [text-shadow:4px_4px_0_#5a0e0a] sm:text-7xl" style={{ animation: "daily-slam 0.7s ease-out 0.2s both" }}>{enemy.name}</span>
          <span className="flex flex-wrap justify-center gap-2" style={{ animation: "daily-emerge 0.5s ease-out 0.9s both" }}>
            {traits.map((t) => <span key={t.id} className="border-2 border-black bg-[#3c140e] px-2 py-0.5 text-sm text-[#f6d2c2]">{t.emoji} {t.name}</span>)}
          </span>
        </div>
      )}

      {/* A big hit taken: the screen flashes red. The killing blow: it flashes white. */}
      {bigHit && <div key={`red${turn}`} aria-hidden className="pointer-events-none fixed inset-0 z-20 bg-[#ff2a1a]/25" style={{ animation: "daily-flash 0.45s ease-out both" }} />}
      {killed && <div key={`white${turn}`} aria-hidden className="pointer-events-none fixed inset-0 z-20 bg-white/60" style={{ animation: "daily-flash 0.5s ease-out 0.15s both" }} />}
      {/* Low on health: the edges of the screen pulse like a heartbeat. */}
      {lowHp && !over && <div aria-hidden className="pointer-events-none fixed inset-0 z-[5]" style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgb(180 20 10 / 0.55))", animation: "daily-heartbeat 1.1s ease-in-out infinite" }} />}
      {/* The turn's moment, as a banner. */}
      {moment && (
        <div key={`m${turn}`} aria-hidden className="pointer-events-none fixed inset-x-0 top-[30vh] z-30 flex justify-center">
          <span className="font-display text-5xl sm:text-6xl [text-shadow:3px_3px_0_#000,-2px_-2px_0_#000]" style={{ color: moment.colour, animation: "daily-banner 1.2s ease-out both" }}>{moment.text}</span>
        </div>
      )}

      {/* The fighters, standing on the world's ground line: you on the left, it on the right. Big hits shake them. */}
      <div key={`stage${turn}`} className="pointer-events-none fixed inset-x-0 z-10" style={{ top: `${HORIZON * 100}vh`, ...((bigHit || crit || killed) && { animation: "daily-shake 0.4s ease-out" }) }}>
        <div className="relative mx-auto flex max-w-3xl -translate-y-full items-end justify-between px-[8%]">
          {/* You: step in to strike, flinch when hit, a shield or a sparkle when that's what you did. */}
          <div className="relative flex flex-col items-center">
            <Hit n={taken} turn={turn} colour="#ff8a7a" className="left-1/2 -top-4" delay={0.7} />
            <AnimatePresence>
              {guarded && <motion.span key={`shield${turn}`} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: [0, 1, 1, 0], scale: 1.2 }} transition={{ duration: 1.1 }} className="absolute -right-4 top-6 z-10"><Emoji e="🛡️" size={48} /></motion.span>}
              {drank && <motion.span key={`heal${turn}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: [0, 1, 0], y: -30 }} transition={{ duration: 1.2 }} className="absolute top-0 z-10 font-display text-xl text-[#9fe08a] [text-shadow:2px_2px_0_#000]">✚ ✚</motion.span>}
            </AnimatePresence>
            <motion.div
              key={`me${turn}`}
              animate={me.hp <= 0
                ? { rotate: -90, y: 20, opacity: 0.6 }
                : { x: dealt > 0 ? [0, 56, 0] : 0, ...(taken > 0 ? { filter: ["brightness(1)", "brightness(1)", "brightness(2.5)", "brightness(1)"] } : {}) }}
              transition={{ duration: me.hp <= 0 ? 0.6 : 0.9 }}
            >
              <motion.div animate={{ y: [0, -2, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}>
                <Hero h={112} />
              </motion.div>
            </motion.div>
            <span className="h-2 w-16 bg-black/50" />
          </div>

          {/* It: what it does next above it, a lunge when it hits you, a slash when you hit it. */}
          <div className="relative flex flex-col items-center">
            <AnimatePresence mode="wait">
              {!over && (
                <motion.div
                  key={`intent${turn}`}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={`${threat.frame} px-shadow mb-3 w-64 px-2 py-1 text-center text-xs`}
                  style={{ color: threat.text }}
                >
                  <Inline text={intentLine(fight, daily.config)} />
                  {incoming > 0 && <span className="ml-1 whitespace-nowrap font-semibold">· ≈ {incoming} to you</span>}
                  {/* Its habit: what it does after this, so the big hit can be planned for. */}
                  {fight.enemy.pattern && (
                    <span className="mt-0.5 block text-[11px] opacity-80">
                      Then: {comingNext(fight, daily.config, 2).map(({ move: m, lands }, k) => (
                        <span key={k}>{k ? " → " : ""}{m.charge ? (lands ? "❗" : "⏳") : m.emoji} {m.name}{m.charge ? (lands ? " lands" : " winds up") : ""}</span>
                      ))}
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {boss && <span className="mb-1 font-display text-sm tracking-[0.3em] text-[#d0894a] [text-shadow:2px_2px_0_#000]">BOSS</span>}
            <div className="relative" style={boss && turn === 0 ? { animation: "daily-emerge 0.9s ease-out 2s both" } : undefined}>
              <Hit n={dealt} turn={turn} crit={crit} colour="#f4ead2" className="left-1/2 top-0" delay={0.2} />
              {dealt > 0 && <Slash turn={turn} />}
              <motion.div
                key={`e${turn}`}
                animate={fight.enemyCurrentHp <= 0
                  ? { opacity: 0, y: 30, rotate: 14, filter: "grayscale(1)" }
                  : {
                      x: [0, ...(dealt > 0 ? [10, -6, 0] : [0, 0, 0]), ...(taken > 0 ? [-64, 0] : [0, 0])],
                      filter: dealt > 0 ? ["brightness(1)", "brightness(2.6)", "brightness(1)", "brightness(1)", "brightness(1)", "brightness(1)"] : "brightness(1)",
                    }}
                // A boss falls slowly.
                transition={{ duration: fight.enemyCurrentHp <= 0 ? (boss ? 1.8 : 0.8) : 1.0, delay: fight.enemyCurrentHp <= 0 ? 0.25 : 0 }}
              >
                {/* Winding up: it glows red until it lets go. */}
                <motion.div
                  animate={{ y: [0, -5, 0], filter: winding ? ["drop-shadow(0 0 0 #f00)", "drop-shadow(0 0 6px #ff3a2a)", "drop-shadow(0 0 0 #f00)"] : "none" }}
                  transition={{ duration: winding ? 0.9 : 2.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Emoji e={enemy.emoji} size={size} />
                </motion.div>
              </motion.div>
            </div>
            <span className="h-2 bg-black/50" style={{ width: size * 0.6 }} />
          </div>
        </div>
      </div>

      {/* Win, loss, onward: a banner over the scene. */}
      {children && (
        <div className="fixed inset-x-0 top-[22vh] z-30 flex justify-center px-4">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 }} className="px-frame px-shadow w-full max-w-md p-3">
            {children}
          </motion.div>
        </div>
      )}

      {/* The turn just played, on the ground like the old chat frame. */}
      <AnimatePresence>
        {log.length > 0 && !children && (
          <motion.ul
            key={`log${turn}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="fixed inset-x-0 bottom-[9.5rem] z-10 mx-auto max-w-3xl space-y-0.5 px-4 text-sm text-[var(--foreground)] [text-shadow:1px_1px_0_#000,2px_2px_0_#000]"
          >
            {log.map((line, i) => <li key={i}><Inline text={line} /></li>)}
          </motion.ul>
        )}
      </AnimatePresence>

      {!children && !entering && <ActionBar daily={daily} fight={fight} moves={moves} potion={potion} potions={potions} items={items} onPick={onPick} />}
    </div>
  );
}

/** The bar along the bottom: a slot per move and the potion, keys 1 to 6, a tooltip on hover. */
function ActionBar({ daily, fight, moves, potion, potions, items, onPick }: {
  daily: Daily; fight: Fight; moves: string[]; potion: ShopItem | undefined; potions: number; items: Array<{ item: ShopItem; left: number }>; onPick: (id: string) => void;
}) {
  const me = fight.members[0]!;
  const [hover, setHover] = useState<string | null>(null);
  const locked = me.state.stunned || !!me.state.charging;
  const ready = (id: string) => !locked && usable(me.state, moveById(daily.config, id));
  const slots = [...moves, ...(potion && potions > 0 ? [DRINK] : []), ...items.filter((x) => x.left > 0).map((x) => `${USE}${x.item.id}`)];
  // An effect item in a slot: the item, and the move it plays.
  const bagItem = (id: string) => (id.startsWith(USE) ? items.find((x) => x.item.id === id.slice(USE.length)) : undefined);
  const stuck = !locked && moves.every((id) => !ready(id));

  // Number keys play the slot under them.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const id = slots[Number(ev.key) - 1];
      if (!id || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (locked || stuck) return onPick(WAIT);
      if (id === DRINK || ready(id)) onPick(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hoverItem = hover ? bagItem(hover) : undefined;
  const tip = hover === DRINK ? null : hoverItem ? { ...moveById(daily.config, hoverItem.item.use!), name: hoverItem.item.name } : hover ? moveById(daily.config, hover) : null;
  const tipText = tip ? describeMove(tip, daily.config) : null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t-[3px] border-black bg-[#120e0b] px-4 pt-2 pb-3 shadow-[0_-3px_0_#3b3226]">
      <div className="relative mx-auto max-w-xl">
        {/* The tooltip, as the old default UI drew them: name in gold, then what it does. */}
        <AnimatePresence>
          {(tip || hover === DRINK) && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="px-frame px-shadow pointer-events-none absolute bottom-full left-1/2 mb-3 w-72 -translate-x-1/2 p-2 text-xs">
              {tip && tipText ? (
                <>
                  <p className="font-display text-sm text-[var(--gold)]">{tip.name}</p>
                  {tipText.does.map((d) => <p key={d} className="text-[var(--foreground)]">{d}</p>)}
                  {tipText.drawbacks.map((d) => <p key={d} className="text-[#e0a070]">⚠️ {d}</p>)}
                  {hoverItem && <p className="text-[var(--muted)]">From your bag: uses your turn. {hoverItem.left} left.</p>}
                </>
              ) : potion ? (
                <>
                  <p className="font-display text-sm text-[#b8d89a]">{potion.name}</p>
                  <p>Heals {potion.heal} HP, using your turn. {potions} left.</p>
                </>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mb-1.5 text-center text-[11px] text-[var(--muted)]">Round {fight.round + 1} · {turnOrderLine(fight, daily.config)}</p>
        {locked || stuck ? (
          <button type="button" className="btn w-full px-4 py-3" onClick={() => onPick(WAIT)}>
            {me.state.stunned ? "💫 You're stunned: carry on" : me.state.charging ? `⏳ Winding up ${moveById(daily.config, me.state.charging.moveId).name}: carry on` : "⏳ Everything's cooling down: wait a turn"}
          </button>
        ) : (
          <div className="flex justify-center gap-2">
            {slots.map((id, i) => {
              const isPotion = id === DRINK;
              const bag = bagItem(id);
              const move = isPotion ? null : moveById(daily.config, bag ? bag.item.use! : id);
              const can = isPotion || !!bag || ready(id);
              const wait = isPotion || bag ? 0 : me.state.cooldowns[id];
              const dmg = move ? hitEstimate(fight, daily.config, move.id, "member") : 0;
              return (
                <motion.button
                  key={id}
                  type="button"
                  disabled={!can}
                  onClick={() => onPick(id)}
                  onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(id)} onBlur={() => setHover(null)}
                  whileTap={can ? { scale: 0.92 } : {}}
                  className="group flex w-16 flex-col items-center gap-1 sm:w-[4.5rem]"
                >
                  <span className={`slot relative h-14 w-14 sm:h-16 sm:w-16 ${can ? "group-hover:border-[var(--accent)]" : ""}`} style={isPotion ? { borderColor: "#5a8a3c" } : bag ? { borderColor: "#8a6a2e" } : undefined}>
                    <span className={can ? "" : "opacity-40 grayscale"}><Emoji e={isPotion ? potion!.emoji : bag ? bag.item.emoji : move!.emoji} size={36} /></span>
                    <span className="absolute top-0 left-1 text-[10px] text-[var(--muted)] [text-shadow:1px_1px_0_#000]">{i + 1}</span>
                    {dmg > 0 && <span className="absolute right-1 bottom-0 text-[11px] font-bold tabular-nums text-[var(--foreground)] [text-shadow:1px_1px_0_#000,-1px_-1px_0_#000]">{dmg}</span>}
                    {move?.energy && !bag ? (
                      <span className={`absolute top-0 right-0.5 text-[10px] font-bold [text-shadow:1px_1px_0_#000] ${move.energy > 0 ? "text-[#ffd166]" : "text-[#9fe08a]"}`}>
                        {move.energy > 0 ? `⚡${move.energy}` : `+${-move.energy}⚡`}
                      </span>
                    ) : null}
                    {isPotion && <span className="absolute right-1 bottom-0 text-[11px] font-bold text-[#b8d89a] [text-shadow:1px_1px_0_#000]">×{potions}</span>}
                    {bag && <span className="absolute left-1 bottom-0 text-[11px] font-bold text-[var(--gold)] [text-shadow:1px_1px_0_#000]">×{bag.left}</span>}
                    {wait ? <span className="absolute inset-0 flex items-center justify-center bg-black/60 font-display text-2xl text-[var(--gold)] [text-shadow:2px_2px_0_#000]">{wait}</span> : null}
                  </span>
                  <span className={`w-full truncate text-center text-[10px] leading-tight ${can ? "text-[var(--foreground)]" : "text-[var(--muted)]"}`}>{isPotion ? potion!.name : bag ? bag.item.name : move!.name}</span>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
