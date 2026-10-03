import type { Metadata } from "next";
import { CONTACT_EMAIL } from "../contact";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What the havocish Discord bot and dashboard store, and what they do not.",
};

const UPDATED = "3 October 2026";

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="!mt-2 text-sm text-[var(--muted)]">Last updated {UPDATED}</p>

      <p>
        This describes what the havocish Discord bot and the dashboard at{" "}
        <a href="https://havocish.com">havocish.com</a> store, why, and how to have it removed.
        It is written against what the code actually does rather than in the widest terms we could
        get away with.
      </p>

      <h2>What we do not collect</h2>
      <p>
        The bot does not have Discord&rsquo;s <strong>Message Content</strong> intent. It cannot
        read what you write, and it stores no message text. Awarding XP uses only the fact that
        you sent a message in a configured channel, and when.
      </p>
      <p>We also never collect:</p>
      <ul>
        <li>the content of messages, attachments or direct messages;</li>
        <li>voice audio — voice XP counts time connected to a channel, nothing more;</li>
        <li>your email address, real name, phone number or IP-based location;</li>
        <li>payment details, because havocish takes no payments.</li>
      </ul>
      <p>
        There are no third-party analytics, trackers or advertising on the dashboard, and your
        data is never sold or shared for marketing.
      </p>

      <h2>What the bot stores</h2>
      <p>For each player, and separately for each server they play in:</p>
      <ul>
        <li>
          your Discord user ID, and your username and avatar URL so the dashboard and profile
          cards can show who you are;
        </li>
        <li>
          progression: XP, level, gold, streak count, inventory, equipped items, quest progress,
          achievements and combat stats;
        </li>
        <li>
          timestamps for your last message and last daily claim, which is how cooldowns and
          streaks work;
        </li>
        <li>your own privacy and DM preferences for the bot;</li>
        <li>
          trade offers you send or receive: the two user IDs, the items and gold on each side, the
          status and the timing.
        </li>
      </ul>
      <p>For each server:</p>
      <ul>
        <li>the server ID, name and icon URL;</li>
        <li>
          the configuration its owner set: XP rates, level curve, role rewards, shop items,
          quests, achievements, enemies, logging and style settings.
        </li>
      </ul>
      <p>
        The bot also keeps an <strong>event log</strong> so a server&rsquo;s owner can audit what
        happened: entries such as &ldquo;XP gained&rdquo;, &ldquo;daily claimed&rdquo;,
        &ldquo;item bought&rdquo;, &ldquo;level changed&rdquo; or &ldquo;trade completed&rdquo;,
        each with the user ID involved, the amounts and a timestamp. No message content appears in
        it.
      </p>

      <h2>What the dashboard stores</h2>
      <p>
        Signing in uses Discord OAuth with the <code>identify</code> and <code>guilds</code>{" "}
        scopes: your account and the list of servers you are in, so we can show the ones you own.
        Your session, including the Discord access token, is held in an encrypted cookie in your
        browser — the token is not written to our database. Signing out clears it.
      </p>
      <p>
        One strictly necessary cookie carries that session. There are no advertising or analytics
        cookies, so there is nothing to opt into.
      </p>

      <h2>Where it is stored</h2>
      <p>
        Data sits in a PostgreSQL database hosted by <a href="https://neon.com" target="_blank" rel="noreferrer">Neon</a>{" "}
        in the United States. The bot runs on <a href="https://fly.io" target="_blank" rel="noreferrer">Fly.io</a>{" "}
        and the dashboard on <a href="https://vercel.com" target="_blank" rel="noreferrer">Vercel</a>.
        Those providers process data on our behalf, as does{" "}
        <a href="https://discord.com/privacy" target="_blank" rel="noreferrer">Discord</a>, which
        is where the bot operates. If you are outside the United States, using havocish means your
        data is handled there.
      </p>
      <p>
        Uncaught errors are posted to a private Discord channel we watch, so a crash gets noticed.
        Those reports can include a user or server ID, never message content.
      </p>

      <h2>How long it is kept</h2>
      <p>
        Progression is kept while you keep playing. Removing the bot from a server does{" "}
        <strong>not</strong> delete that server&rsquo;s data: it is marked as removed, so
        progression survives an accidental kick and is there again if the bot is re-added. Event
        log entries are kept for auditing. Everything is deleted on request, as below.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask us to send you a copy of everything stored about your account, correct it, or
        delete it. Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from an address we
        can tie to your Discord account, or contact us from an account that can prove ownership,
        and include your Discord user ID. We answer within 30 days.
      </p>
      <p>
        Deleting your data removes your progression, inventory, gold and trade history for the
        servers you ask about, which cannot be undone. Depending on where you live you may also
        have rights to object to or restrict processing, or to complain to a data protection
        authority. A server owner can ask for their server&rsquo;s configuration and event log to
        be deleted the same way.
      </p>
      <p>
        You can also simply stop: leaving the server, or asking its owner to remove the bot, means
        nothing new is recorded.
      </p>

      <h2>Children</h2>
      <p>
        havocish is not for anyone under 13, or under the minimum Discord age in your country. We
        do not knowingly keep data for such an account; if you believe we have, email us and it
        will be removed.
      </p>

      <h2>Changes</h2>
      <p>
        This policy changes when what we store changes. The date at the top says when it last did,
        and the <a href="/legal/terms">Terms of Service</a> cover the rest of the arrangement.
      </p>
    </>
  );
}
