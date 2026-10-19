import type { Metadata } from "next";
import { C, DocTitle, H2, H3, List, Note, P, Table, Where } from "../ui";

export const metadata: Metadata = { title: "Economy and items" };

export default function Economy() {
  return (
    <>
      <DocTitle
        path="economy"
        title="Economy and items"
        lead="Gold comes from dailies, fights, quests and selling. Members spend it in a shop you stock, on items you design."
      />

      <H2>The shop</H2>
      <P>
        Turn the shop on and stock it at <Where>Economy</Where>. Items sit in <b>categories</b> (like Armoury or
        Apothecary), each with an icon and description. A category can be hidden, or limited to members with a role.
        Members browse with <C>/shop</C>, which lists what each item does next to its price.
      </P>

      <H2>Designing an item</H2>
      <H3>Basics</H3>
      <Table
        head={["Field", "What it does"]}
        rows={[
          ["Name, emoji, description", "How it shows everywhere. Renaming an item updates it for members who already own it."],
          ["Rarity", "Poor, common, uncommon, rare, epic or legendary. Colours the name, and makes rare fish fight back harder."],
          ["Price", "Cost in the shop. 0 with Hidden on makes a drop-only item."],
          ["Sell price", <>What members get selling it back in <C>/inventory</C>. 0 means it can&apos;t be sold.</>],
        ]}
      />
      <H3>Availability</H3>
      <Table
        head={["Field", "What it does"]}
        rows={[
          ["Required level", "Members below it can't buy it."],
          ["Required roles", "Only members with one of these roles can buy it."],
          ["Stock", "How many the shop has in total. Empty means unlimited."],
          ["Max per member", "A cap on how many one member can own."],
          ["Hidden", "Not for sale. Still drops, gets rewarded and can be given."],
          ["Tradeable", <>Whether it can change hands with <C>/trade</C> and <C>/gift</C>.</>],
          ["Permanent", <>Not used up by <C>/use</C>.</>],
        ]}
      />

      <H2>Gear</H2>
      <P>
        Turn on <b>Equipable</b> and pick a slot: head, body, legs, feet, hands, weapon, shield, accessory or aura. Members
        wear it with <C>/equip</C> or the buttons in <C>/inventory</C>.
      </P>
      <Table
        head={["Effect", "While equipped"]}
        rows={[
          ["Stats", "Adds health, attack, defence, speed or crit chance in fights."],
          ["XP and gold multipliers", "Fights award more (or less) XP and gold. 1.1 means 10% more."],
          ["Title", "A title shown on the member's profile card."],
        ]}
      />
      <Note>Stats on an item that isn&apos;t equipable do nothing. The dashboard tooltip warns you when that happens.</Note>

      <H2>Items that do things</H2>
      <P>Give an item actions and members trigger them with <C>/use</C>. One item can have several.</P>
      <Table
        head={["Action", "Effect"]}
        rows={[
          [<C key="c">giveStat</C>, "Gives gold, XP or health. Healing items also show up as buttons during fights."],
          [<C key="c">giveItem</C>, "Gives another item, like a chest that opens into loot."],
          [<C key="c">assignRole</C>, "Gives a role, optionally for a limited time."],
          [<C key="c">removeRole</C>, "Takes a role away."],
          [<C key="c">sendMessage</C>, "Posts a message in a channel you pick."],
        ]}
      />

      <H2>Tools</H2>
      <P>
        Any item can be a <b>gathering tool</b>: pick the activity, a tier and a bonus under <b>Gathering tool</b> in the
        item editor. See <a href="/docs/gathering#tools" className="text-[var(--accent)] underline">Gathering → Tools</a>.
      </P>

      <H2>Selling, trading and gifting</H2>
      <List>
        <li><b>Selling:</b> <C>/inventory</C> has a menu to sell any item with a sell price.</li>
        <li><b>Trading:</b> <C>/trade offer</C> swaps items and gold between two members. Both sides confirm before anything moves.</li>
        <li><b>Gifting:</b> <C>/gift</C> gives an item away. Turn it on at <Where>Economy</Where>, with an optional minimum level and announcement.</li>
      </List>
      <P>
        Managers can fix a member&apos;s bag with <C>/admin items</C>: view, give, remove or clear.
      </P>
    </>
  );
}
