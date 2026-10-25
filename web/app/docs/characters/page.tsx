import type { Metadata } from "next";
import { C, DocTitle, H2, List, Note, P, Table, Where } from "../ui";

export const metadata: Metadata = { title: "Characters" };

export default function Characters() {
  return (
    <>
      <DocTitle
        path="characters"
        title="Characters"
        lead="The people and creatures of your world, posting under their own name and picture: a boss arriving with a threat, the quest giver thanking you, the merchant shouting about your rare find."
      />

      <H2>Make a character</H2>
      <P>
        Characters live at <Where>Characters</Where>. Each has a <b>name</b>, a <b>picture</b> and, if you like, a few{" "}
        <b>lines</b> they say. The page shows their post as it looks in Discord while you edit.
      </P>
      <List>
        <li><b>Picture:</b> an emoji, a link to an image, or an upload (PNG, JPEG, GIF or WebP, up to 512 KB).</li>
        <li><b>Lines:</b> one per line. When they turn up (an enemy appearing, a boss arriving) they say one at random.</li>
      </List>

      <H2>Who speaks for what</H2>
      <Table
        head={["Set on", "They post"]}
        rows={[
          [<>An enemy&apos;s <b>Speaks as</b> (Combat)</>, "When it turns up in chat and, for a world boss, when it arrives. Its fight board stays under its name."],
          [<>A quest&apos;s <b>Quest giver</b> (Quests)</>, "The announcement when someone finishes the quest."],
          [<><b>Shopkeeper</b> (Characters)</>, "Rare-find announcements."],
          [<><b>Announcer</b> (Characters)</>, "Level-ups, achievements, collection milestones, unlocks, streaks, role rewards, and quests with no giver of their own."],
        ]}
      />
      <P>Anything with no character posts as havocish, exactly as before.</P>

      <H2>The Manage Webhooks permission</H2>
      <P>
        With <b>Manage Webhooks</b>, characters post through a webhook in each channel, so the message comes from the
        character itself (Discord adds a small APP tag). Buttons on their posts work as usual. Without the permission,
        havocish posts as itself with the character&apos;s name and picture at the top, and the health check suggests
        granting it.
      </P>
      <Note>
        Replies to commands, like <C>/shop</C> or <C>/fight</C>, always come from havocish: Discord requires it. Characters
        speak in the public posts.
      </Note>

      <H2>Starter pack casts</H2>
      <P>
        Classic Fantasy brings Marta the Tavern Keeper (announcer), Old Bram the Merchant, the Captain of the Watch, a smith,
        an apothecary, and the Hollow King, the Lich, the Ashen Wyrm and the Bandit Captain with their own lines. Frontier
        Station brings Station Control, Quartermaster Vex, a security chief, an engineer, a doctor, and the Hive Mind, a
        rogue AI and two villains. Add a pack again from the Library to get its cast; your own characters are kept.
      </P>
    </>
  );
}
