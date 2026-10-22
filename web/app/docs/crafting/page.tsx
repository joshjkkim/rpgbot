import type { Metadata } from "next";
import { C, DocTitle, H2, List, Note, P, Steps, Table, Where } from "../ui";

export const metadata: Metadata = { title: "Crafting" };

export default function Crafting() {
  return (
    <>
      <DocTitle
        path="crafting"
        title="Crafting"
        lead="Stations where members turn items into better items with /craft. Each station is its own skill, and every recipe is yours to design."
      />

      <H2>How it fits together</H2>
      <List>
        <li>A <b>station</b> (like Smithing or Engineering) has a name, a skill name and its recipes.</li>
        <li>A <b>recipe</b> uses up some items, and optionally gold, to make an item. Better recipes need a higher skill.</li>
        <li>Each successful craft gives crafting-skill XP. Crafting skills share the skill curve set on the Gathering page.</li>
        <li>A lucky craft can be a <b>masterwork</b>, giving something better from the recipe&apos;s masterwork table.</li>
      </List>
      <P>Turn crafting on and build stations at <Where>Crafting</Where>.</P>

      <H2>Make a station</H2>
      <Steps>
        <li>Click <b>New station</b> and name it. Set its emoji and skill name.</li>
        <li>Pick its <b>crafting style</b> (below).</li>
        <li>Add <b>recipes</b>: the item it makes, how many, its ingredients, any gold cost, the skill it needs and the XP it gives. One recipe must need skill 1, or nobody can start.</li>
        <li>Save. Members can now <C>/craft</C> there.</li>
      </Steps>

      <H2>Crafting styles</H2>
      <P><b>Forge meter</b> (the default). A bar sweeps across the message and the member clicks <b>Strike</b> to stop it:</P>
      <Table
        head={["Where it stops", "Result"]}
        rows={[
          ["🟩 the centre", "A masterwork (below)."],
          ["🟨 the zone", "The item is made."],
          ["⬛ anywhere else", "Ruined: part of each ingredient is lost (half by default). No gold is charged and no XP given."],
        ]}
      />
      <P>
        The zone lands in a different place every craft. Higher skill widens it: by default from 30% of the bar at skill 1
        to 50% at the top, with the centre growing from 6% to 10%. Members who wait two full sweeps miss. The strike is
        judged by what was on their screen when they clicked, so a slow connection doesn&apos;t count against them.
      </P>
      <P>
        <b>Straightforward.</b> A plain <b>Craft</b> button: have the ingredients, click, get the item. No timing and no
        ruin. Set a <b>masterwork chance</b> to give each craft a little luck.
      </P>

      <H2>Masterworks</H2>
      <P>
        Each recipe can have a <b>masterwork table</b>: a weighted list of what a masterwork craft gives instead of the plain
        result. Make each variant its own item on the Items page, with its own stats and rarity:
      </P>
      <Table
        head={["Iron Sword, masterwork gives", "Weight", "Share"]}
        rows={[
          ["Masterwork Iron Sword", "60", "60%"],
          ["Iron Sword of the Bear", "25", "25%"],
          ["Iron Sword of the Eagle", "10", "10%"],
          ["Emberforged Iron Sword", "5", "5%"],
        ]}
      />
      <P>A recipe with an empty table gives a bonus copy of its normal result on a masterwork instead.</P>
      <Table
        head={["Forge setting", "Default"]}
        rows={[
          ["Zone at skill 1 / at the top", "30% / 50% of the bar"],
          ["Centre at skill 1 / at the top", "6% / 10%, never less than one cell"],
          ["Ingredients lost on a ruin", "50%, rounded down; 0 turns ruin off"],
        ]}
      />

      <H2>Recipe scrolls</H2>
      <P>
        Turn on <b>Hidden until learned</b> on a recipe and members see it in <C>/craft</C> only as <b>???</b> until they
        learn it. To teach it, make an item at <Where>Items</Where> with the <b>Teach a recipe</b> use action, then put
        that scroll anywhere items come from: an enemy or world boss drop, a gathering spot, a quest reward, the shop.
        Reading it teaches the recipe for good and uses up the scroll. A member who already knows it keeps the scroll,
        so they can trade it.
      </P>
      <P>
        Each hidden recipe shows which items teach it, and the health check warns about a hidden recipe nothing
        teaches. In Classic Fantasy, the Starforged Blade is hidden: its scroll drops from the Hollow King, and rarely
        from liches.
      </P>

      <H2>What members see</H2>
      <P>
        <C>/craft</C> shows the station&apos;s recipes, privately, with how much of each ingredient the member has. Recipes
        above their skill show a lock. The Craft button works only when they have everything, and each craft reports its
        result and the skill XP gained. Crafting skills appear on <C>/me</C>.
      </P>
      <Note>
        Every item&apos;s page on the dashboard lists the recipes that make it and the recipes that use it, and warns when an
        ingredient can&apos;t be obtained anywhere.
      </Note>
    </>
  );
}
