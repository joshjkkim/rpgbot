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
        <li>Set the <b>masterwork chance</b>: the share of crafts that roll the masterwork table. 0 turns masterworks off.</li>
        <li>Add <b>recipes</b>: the item it makes, how many, its ingredients, any gold cost, the skill it needs and the XP it gives. One recipe must need skill 1, or nobody can start.</li>
        <li>Save. Members can now <C>/craft</C> there.</li>
      </Steps>

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
