import type { Metadata } from "next";
import { CONTACT_EMAIL } from "../contact";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using the havocish Discord bot and dashboard.",
};

const UPDATED = "3 October 2026";

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="!mt-2 text-sm text-[var(--muted)]">Last updated {UPDATED}</p>

      <p>
        These terms cover the havocish Discord bot and the dashboard at{" "}
        <a href="https://havocish.com">havocish.com</a> (together, &ldquo;havocish&rdquo;,
        &ldquo;the service&rdquo;). By adding the bot to a Discord server, or by using it as a
        member of a server where it is installed, you agree to them. If you do not agree, remove
        the bot or stop using it.
      </p>

      <h2>1. What havocish is</h2>
      <p>
        havocish adds a role-playing game layer to a Discord server: experience points from
        messages and voice activity, levels with role rewards, daily streaks, gold, a shop with
        equipment and consumables, player trading, quests, achievements and turn-based combat. A
        server&rsquo;s owner configures all of it, from the dashboard or from Discord commands.
      </p>
      <p>
        havocish is an independent project. It is not affiliated with, endorsed by or sponsored
        by Discord Inc.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be old enough to use Discord in your country, and in all cases at least 13 years
        old, as required by the{" "}
        <a href="https://discord.com/terms" target="_blank" rel="noreferrer">
          Discord Terms of Service
        </a>
        . Using havocish does not exempt you from Discord&rsquo;s own terms and{" "}
        <a href="https://discord.com/guidelines" target="_blank" rel="noreferrer">
          Community Guidelines
        </a>
        , which continue to apply.
      </p>

      <h2>3. Virtual items have no real-world value</h2>
      <p>
        Gold, items, levels, experience, streaks, quests and achievements are entries in a
        database. They are <strong>not</strong> currency, property or anything redeemable. They
        cannot be bought from us, sold, exchanged for money or transferred off the service, and
        they carry no monetary value even where members trade them between each other. havocish
        takes no payment of any kind, and nothing in it is a purchase.
      </p>
      <p>
        Balances may be changed, reset or lost — by a server&rsquo;s own configuration, by a
        moderator, by a bug, or when a server removes the bot. We owe no compensation for any of
        that.
      </p>

      <h2>4. Server owners and managers</h2>
      <p>
        If you add havocish to a server, you confirm you have permission to do so, and you are
        responsible for how it is configured and used there. That includes the XP rates, rewards,
        shop prices, quest text, item names and descriptions, and the roles the bot is allowed to
        assign. Any content you enter through the dashboard or Discord commands is yours, and you
        must have the right to use it.
      </p>
      <p>
        Dashboard access is limited to a server&rsquo;s owner. Granting someone Manage Server
        permissions in Discord also lets them change the bot&rsquo;s configuration there, so grant
        it deliberately.
      </p>

      <h2>5. Acceptable use</h2>
      <p>Do not:</p>
      <ul>
        <li>
          automate activity to farm XP, gold or streaks — self-bots, alt accounts, scripted
          messages, idling in a voice channel with a macro, or similar;
        </li>
        <li>
          exploit a bug instead of reporting it, including anything that duplicates items or gold;
        </li>
        <li>
          attack the service: scraping, mass requests, attempts to break the dashboard&rsquo;s
          authentication, or any access to data that is not yours;
        </li>
        <li>
          use configurable text fields to publish content that is illegal, hateful, harassing or
          otherwise against Discord&rsquo;s guidelines;
        </li>
        <li>impersonate havocish, or represent a modified copy as the official bot.</li>
      </ul>

      <h2>6. Availability</h2>
      <p>
        havocish is provided as-is, with no uptime guarantee. It is a small project run on
        modest infrastructure: it can go down, lose a window of unsaved progression, be changed in
        ways that alter balance, or be discontinued. Features may be added or removed without
        notice.
      </p>

      <h2>7. Termination</h2>
      <p>
        You can stop using havocish at any time by removing the bot from your server. We may
        suspend or remove the bot from a server, or block an account from using it, if these terms
        are broken or if a server&rsquo;s use threatens the service or other users.
      </p>

      <h2>8. Disclaimer and liability</h2>
      <p>
        To the fullest extent the law allows, havocish is provided without warranties of any kind,
        express or implied, including fitness for a particular purpose and uninterrupted operation.
        We are not liable for indirect or consequential damages, for lost progression or virtual
        items, or for anything a server&rsquo;s own members or configuration cause. Nothing here
        limits liability that cannot be limited by law.
      </p>

      <h2>9. Changes</h2>
      <p>
        These terms may change as the service does. The date at the top says when they last did.
        Continuing to use havocish after a change means you accept the current version.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions, bug reports and takedown requests:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. How your data is handled is
        covered separately in the <a href="/legal/privacy">Privacy Policy</a>.
      </p>
    </>
  );
}
