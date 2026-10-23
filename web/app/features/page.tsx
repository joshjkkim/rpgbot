import type { Metadata } from "next";
import pack from "@/app/lib/packs/classic-fantasy.json";
import ItemTooltip from "@/app/components/shop/itemTooltip";
import type { shopItemConfig } from "@/app/components/shop/shopBasicsEditor";
import { SiteFooter, SiteHeader } from "@/app/components/siteChrome";
import { inviteUrl } from "@/app/lib/invite";
import { FightMock, GatherDemo, QuestMock } from "./demos";

export const metadata: Metadata = {
  title: "Features",
  description: "Levels, fights you read and unlock moves for, parties, gathering minigames with daily conditions, crafting, a collection log, quests and a dashboard to design it all. Everything havocish adds to a Discord server.",
};

const items = pack.content.shop.items as unknown as Record<string, shopItemConfig>;
const enemies = pack.content.combat.enemies as Record<string, { name: string; emoji: string; boss?: boolean }>;

function Feature({ title, children, visual, flip }: { title: string; children: React.ReactNode; visual: React.ReactNode; flip?: boolean }) {
  return (
    <section className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
      <div className={`flex justify-center ${flip ? "md:order-2" : ""}`}>{visual}</div>
      <div>
        <h2 className="text-2xl sm:text-3xl">{title}</h2>
        <div className="mt-3 space-y-3 leading-relaxed text-[var(--muted)] [&_b]:font-normal [&_b]:text-[var(--foreground)]">{children}</div>
      </div>
    </section>
  );
}

const Points = ({ items: lines }: { items: React.ReactNode[] }) => (
  <ul className="space-y-1.5">
    {lines.map((l, i) => (
      <li key={i} className="flex gap-2.5"><span className="text-[var(--accent)]">◆</span><span>{l}</span></li>
    ))}
  </ul>
);

export default function FeaturesPage() {
  const invite = inviteUrl();

  return (
    <div className="min-h-screen flex flex-col bg-[linear-gradient(#0f0b0e,#0a0807)]">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 pt-12 pb-6 text-center sm:pt-16">
          <h1 className="text-4xl leading-tight sm:text-5xl">Everything havocish does</h1>
          <p className="mt-4 text-lg leading-relaxed text-[var(--foreground)]/80">
            A whole RPG for your server: characters that level up, fights, gathering, crafting, gear and quests.
            You decide what every enemy, move, place, item and minigame is called and what it does.
          </p>
        </div>

        <div className="mx-auto max-w-5xl space-y-24 px-6 py-16">
          <Feature
            title="Every member gets a character"
            visual={
              <div className="w-full max-w-[460px] space-y-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- the bot's real render */}
                <img src="/showcase/profile.png" width={1100} height={420} alt="A member's profile card" className="h-auto w-full" />
                {/* eslint-disable-next-line @next/next/no-img-element -- the bot's real render */}
                <img src="/showcase/levelup.png" width={1120} height={280} alt="A level-up banner" className="h-auto w-full" />
              </div>
            }
          >
            <p>Members earn XP for being part of the server, and watch their character grow.</p>
            <Points items={[
              <><b>Chat levels for talking</b> and voice, and a separate <b>Combat level</b> for fighting. Each chat level makes a member a little stronger in fights.</>,
              <><b>Level-ups people notice:</b> a banner in your colours, with roles, gold, items or Combat XP at the levels you pick.</>,
              <><b>Already have a leveling bot?</b> Keep it. Switch havocish&apos;s leveling off, reward the roles your bot gives, and lock gear and quests behind them.</>,
              <><b>Daily rewards</b> with streak bonuses, and <b>/me</b>, a character sheet with stats, gear and skills.</>,
            ]} />
          </Feature>

          <Feature flip title="Fights you read, not just click" visual={<div className="w-full max-w-[460px]"><FightMock /></div>}>
            <p>Every enemy shows what it does next. Guard the big hit, interrupt the wind-up, and save your best move for the opening.</p>
            <Points items={[
              <><b>Drawn as a scene:</b> the enemy, your avatar and the place, redrawn every turn. Use any emoji, even your server&apos;s own, as a monster.</>,
              <><b>Moves to unlock:</b> new ones as your Combat level grows, from gear, and from scrolls rare enemies drop. Owners build moves from effects: bleeds, stuns, wind-ups, drawbacks.</>,
              <><b>Fight together:</b> anyone can click Join, up to three a fight. The enemy picks a target each turn and says who.</>,
              <><b>Your channels are places:</b> wolves in #darkwood, the Lich only in the crypt. In chat, a fight opens in a thread so the conversation carries on.</>,
              <><b>World bosses</b> like {enemies["hollow-king"]?.emoji} the {enemies["hollow-king"]?.name ?? "Hollow King"} take the whole server, and <b>duels</b> put gold on the line.</>,
              <><b>Wounds take time:</b> HP comes back over a couple of hours, faster with food and potions. Lose, and you&apos;re back on your feet at a quarter of your health.</>,
            ]} />
          </Feature>

          <Feature title="Gathering, worded your way" visual={<div className="w-full max-w-[460px]"><GatherDemo /></div>}>
            <p>
              Three minigames, played with buttons: push your luck on a grid, react to a signal in time, or spot the
              target among look-alikes.
            </p>
            <Points items={[
              <><b>Make any activity you like.</b> Pick a minigame and write every word players see. Mining for a fantasy server, salvage for a sci-fi one, baking for a cozy one.</>,
              <><b>Places with character:</b> one is pitch dark, so you plan a path; one has fast water, so it takes two good pulls. Each plays differently, not just harder.</>,
              <><b>Weather that changes daily:</b> a storm makes it rough but turns up rarer finds; fog closes in; a clear day eases off. Everyone sees the same, and tomorrow is different.</>,
              <><b>Skills from 1 to 50</b> open better locations, and <b>tools</b> from your shop make the game easier.</>,
            ]} />
          </Feature>

          <Feature
            flip
            title="Gear you design, find and craft"
            visual={
              <div className="grid w-full max-w-[460px] gap-3 sm:grid-cols-2">
                <ItemTooltip item={items["dragonfang-sword"]!} />
                <div className="space-y-3">
                  <ItemTooltip item={items["iron-pickaxe"]!} />
                  <ItemTooltip item={items["superior-healing-draught"]!} />
                </div>
              </div>
            }
          >
            <p>Stock a shop with your own weapons, armour, potions and tools, each with its own rarity and stats.</p>
            <Points items={[
              <><b>Crafting stations</b> with a timing minigame: a perfect strike makes a masterwork. The best gear and food come from crafting and drops, not the shop.</>,
              <><b>Recipes you discover:</b> find a rare material once and a new recipe opens up. Others come from scrolls.</>,
              <><b>A collection log:</b> /collection shows everything you&apos;ve found, enemy by enemy and place by place, with blanks for what&apos;s left.</>,
              <><b>Nine gear slots,</b> items that heal, give XP, roles or moves, and a shop whose stock can refresh daily.</>,
              <><b>A living economy:</b> members buy, sell, trade and gift, and rare drops are announced to the server.</>,
            ]} />
          </Feature>

          <Feature title="Quests and achievements" visual={<QuestMock />}>
            <p>Give members something to work toward, today and this week.</p>
            <Points items={[
              <><b>Quests</b> for chatting, voice time, dailies, spending, winning duels or hunting a particular enemy.</>,
              <><b>Daily and weekly repeats,</b> with XP, gold, items and roles as rewards.</>,
              <><b>Achievements</b> unlock on their own and get announced to the server.</>,
            ]} />
          </Feature>

          <Feature
            flip
            title="Set up in minutes, tune it forever"
            visual={
              <div className="frame w-full max-w-[460px] p-4">
                <p className="mb-3 font-display text-[var(--gold)]">Enemies</p>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
                  {Object.entries(enemies).slice(0, 12).map(([id, e]) => (
                    <li key={id} className="flex flex-col items-center gap-1 rounded-sm border border-[var(--border)] bg-black/30 p-1.5">
                      <span className="slot h-11 w-11 text-2xl" style={e.boss ? { borderColor: "#d0894a" } : undefined}>{e.emoji}</span>
                      <span className="w-full truncate text-center text-[11px] leading-tight" style={e.boss ? { color: "#d0894a" } : undefined}>{e.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            }
          >
            <p>A web dashboard where every enemy, move, place, item, quest and minigame is a slot you click and edit.</p>
            <Points items={[
              <><b>A setup wizard</b> asks five questions and configures the bot for you.</>,
              <><b>Starter packs</b> fill your shop, enemies, quests and gathering in one click, and never overwrite your own work.</>,
              <><b>Simple and Advanced</b> settings, and a health check that spots what would quietly fail.</>,
              <><b>Kind to newcomers:</b> new players get a private tip the first time they fight, win, lose or join a party, and anyone can turn off pings with /settings quiet.</>,
              <><b>Your moderators can help:</b> anyone with Manage Server can use the dashboard, and <b>/config</b> switches features on and off from Discord.</>,
            ]} />
          </Feature>
        </div>

        <section className="mx-auto max-w-2xl px-6 pb-24 text-center">
          <h2 className="text-3xl sm:text-4xl">Gather your party</h2>
          <p className="mt-3 text-[var(--muted)]">Free to add. Set up in a few minutes.</p>
          {invite && (
            <div className="mt-7 flex justify-center">
              <a href={invite} target="_blank" rel="noreferrer" className="btn px-5 py-2.5">Add to Server</a>
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
