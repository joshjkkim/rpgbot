/*
 * Writes a world for the website's Daily from a description, with the same
 * prompt and builder as the Library's AI worlds, and saves the parts the
 * Daily uses to havocish/src/content/worlds/<id>.json. Add it to WORLDS in
 * content/daily.ts after reading it through.
 *
 *   npx tsx --env-file=.env.local scripts/daily-world.mts <id> "<description>"
 *
 * One world costs about 7 cents (Sonnet). It doesn't count against any
 * server's allowance or the daily AI budget.
 */
import { writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { buildPack, parseSkeleton, SKELETON_PROMPT } from "../../havocish/src/content/aiPack.ts";

const [id, prompt] = process.argv.slice(2);
if (!id || !/^[a-z0-9-]+$/.test(id) || !prompt) throw new Error('Usage: daily-world.mts <id> "<description>"');

const message = await new Anthropic().messages
  .stream({
    model: "claude-sonnet-5-5",
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system: SKELETON_PROMPT,
    messages: [{ role: "user", content: prompt }],
  })
  .finalMessage();
const text = message.content.find((b) => b.type === "text")?.text;
const skeleton = text && parseSkeleton(text);
if (!skeleton) throw new Error(`No world came back (stop reason: ${message.stop_reason}).`);
const pack = buildPack(skeleton, id);
const c = pack.content as any;

// Only what the Daily reads: enemies and their moves, gear, potions and finds, and the gathering places.
const loot = new Set<string>();
for (const a of Object.values<any>(c.gathering?.activities ?? {})) for (const l of Object.values<any>(a.locations)) for (const d of l.loot ?? []) loot.add(d.itemId);
const keepItem = (it: any) => it.equipSlot || loot.has(it.id) || Object.values<any>(it.actions ?? {}).some((a) => a.type === "giveStat" && a.statId === "health");
const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

const world = {
  id,
  name: pack.name,
  prompt,
  content: {
    combat: {
      enemies: Object.fromEntries(Object.entries<any>(c.combat.enemies).map(([k, e]) => [k, pick(e, ["id", "name", "emoji", "boss", "minLevel", "moves"])])),
      moves: c.combat.moves ?? {},
      statuses: c.combat.statuses ?? {},
    },
    shop: { items: Object.fromEntries(Object.entries<any>(c.shop.items).filter(([, it]) => keepItem(it)).map(([k, it]) => [k, pick(it, ["id", "name", "emoji", "rarity", "equipSlot", "actions"])])) },
    gathering: {
      activities: Object.fromEntries(Object.entries<any>(c.gathering?.activities ?? {}).map(([k, a]) => [k, {
        id: a.id, name: a.name, emoji: a.emoji,
        locations: Object.fromEntries(Object.entries<any>(a.locations).map(([lk, l]) => [lk, pick(l, ["id", "name", "emoji", "loot"])])),
      }])),
    },
  },
};
const out = new URL(`../../havocish/src/content/worlds/${id}.json`, import.meta.url);
writeFileSync(out, JSON.stringify(world, null, 2) + "\n");
const { input_tokens, output_tokens } = message.usage;
console.log(`${pack.name}: ${Object.keys(world.content.combat.enemies).length} enemies, ${Object.keys(world.content.shop.items).length} items · ${input_tokens} in / ${output_tokens} out · ~$${((input_tokens * 2 + output_tokens * 10) / 1e6).toFixed(3)}`);
