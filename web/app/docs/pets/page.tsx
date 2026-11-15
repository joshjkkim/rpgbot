import type { Metadata } from "next";
import { C, DocTitle, H2, List, Note, P, Steps, Table, Where } from "../ui";

export const metadata: Metadata = { title: "Pets" };

export default function Pets() {
  return (
    <>
      <DocTitle
        path="pets"
        title="Pets"
        lead="Companions members hatch or are given, then feed, raise and bring into fights. Every species is yours to design: a wolf, a drake, a drone, a spirit."
      />

      <H2>How it fits together</H2>
      <List>
        <li>A <b>species</b> has stats at level 1, what each level adds, its moves and its <b>stages</b>: from a level on it looks different and can learn more moves.</li>
        <li>Members can keep several pets but bring <b>one active pet</b>, switched in <C>/pet</C>. It shows on <C>/me</C> and fights beside them.</li>
        <li>Pets level on the same curve as skills, from food and from fights they win.</li>
      </List>
      <P>Turn pets on and make species at <Where>Pets</Where>.</P>

      <H2>Give members a pet</H2>
      <Steps>
        <li>Make a species on the Pets page: name, emoji or picture, stats, moves and stages. The preview shows it at each stage.</li>
        <li>Choose how members get one. A <b>nursery</b>: a timed station on the Crafting page with a recipe set to <b>Makes a pet</b>, where an egg goes in and the pet comes out after the time you set. Or an <b>item</b> with the <b>Give a pet</b> use action on the Items page, sold in the shop or dropped by an enemy.</li>
        <li>Add some <b>food</b>: items members can feed their pet in <C>/pet</C>, and the pet XP each gives.</li>
        <li>Save. Members see theirs with <C>/pet</C>.</li>
      </Steps>
      <P>Each species lists what hatches or gives it, with links straight to that station or item.</P>

      <H2>In fights</H2>
      <P>
        The active pet acts right after its owner each turn, with no extra buttons. It picks one of its moves by weight,
        among those whose condition holds, the same way an enemy does. Its damage counts as its owner&apos;s. What a pet aims
        at itself, like a heal, a guard or a boost, lands on its owner instead, and its &quot;self&quot; conditions check its
        owner: a pet with a heal set to <i>when HP is below 50%</i> heals its owner when they&apos;re low.
      </P>
      <P>
        <b>Enemies can hit pets</b> is your choice. Off, enemies only ever target players. On, an enemy sometimes goes for a pet
        instead, and its next move says so. The pet takes that hit, and at 0 HP it sits out the rest of the fight. Pets are
        never lost, and start every fight at full HP.
      </P>
      <P>After a win, the pet that fought gets a share of its owner&apos;s XP, and the result says when it levels up or reaches a new stage.</P>

      <H2>Defaults</H2>
      <Table
        head={["Setting", "Default"]}
        rows={[
          ["Pets a member can keep", "10 (1 to 50)"],
          ["Fight XP share", "50% of the XP its owner gets on a win (0 to 200)"],
          ["Enemies can hit pets", "Off"],
          ["Max level", "30, never above the skill cap on the Gathering page"],
          ["Crit chance and damage in fights", "5%, ×1.5"],
        ]}
      />
      <Note>
        Keep pets well below a player&apos;s own stats: they help, they don&apos;t carry. Classic Fantasy&apos;s Forest Wolf starts at
        40 HP and 5 attack and gains 6 HP and 0.8 attack a level, against a level 5 player&apos;s 150 HP and 20 attack.
      </Note>

      <H2>What members see</H2>
      <P>
        <C>/pet</C> shows the active pet&apos;s picture for its stage, its level bar, stats and moves, with a menu to feed it,
        a button to rename it, a menu to switch to another pet they keep, and a button to release one (they&apos;re asked
        first). Every word there is yours to change per species. Pets also count for achievements: <C>petsAdopted</C> and{" "}
        <C>petBestLevel</C>.
      </P>
    </>
  );
}
