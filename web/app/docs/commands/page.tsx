import type { Metadata } from "next";
import commands from "../commands.json";
import { C, DocTitle, H2, Note, P } from "../ui";

export const metadata: Metadata = { title: "Commands" };

/*
 * Generated: commands.json is written from the bot's own command list by
 * `npm run docs:commands` in havocish/, and CI fails if it's stale.
 */

type Opt = { name: string; description: string; type?: string; required?: boolean; kind?: "subcommand" | "group"; options?: Opt[] };
type Command = { name: string; description: string; managersOnly: boolean; options: Opt[] };

// Kept until owners have had a chance to move to the dashboard and /config.
const LEGACY = /^config-/;

function Options({ options }: { options: Opt[] }) {
  if (!options.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {options.map((o) => (
        <li key={o.name} className="flex flex-wrap gap-x-2">
          <span className="font-mono text-[var(--foreground)]">{o.name}</span>
          <span className="font-mono text-xs leading-5 text-[var(--muted)]">{o.type}{o.required ? "" : ", optional"}</span>
          <span className="text-[var(--foreground)]/70">{o.description}</span>
        </li>
      ))}
    </ul>
  );
}

/** A command's subcommands, groups flattened into "group sub" the way Discord shows them. */
function usages(c: Command): Array<{ usage: string; description: string; options: Opt[] }> {
  const subs = c.options.filter((o) => o.kind);
  if (!subs.length) return [{ usage: `/${c.name}`, description: c.description, options: c.options }];
  return subs.flatMap((s) =>
    s.kind === "group"
      ? (s.options ?? []).map((sub) => ({ usage: `/${c.name} ${s.name} ${sub.name}`, description: sub.description, options: sub.options ?? [] }))
      : [{ usage: `/${c.name} ${s.name}`, description: s.description, options: s.options ?? [] }],
  );
}

function CommandCard({ c }: { c: Command }) {
  const list = usages(c);
  return (
    <section id={c.name} className="scroll-mt-6 rounded-sm border border-[var(--border)] bg-black/20 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="font-mono text-base text-[var(--gold)]">
          <a href={`#${c.name}`}>/{c.name}</a>
        </h3>
        <span className="text-sm text-[var(--foreground)]/80">{c.description}</span>
      </div>
      {list.length === 1 && list[0]!.usage === `/${c.name}` ? (
        <Options options={list[0]!.options} />
      ) : (
        <ul className="mt-3 space-y-3 border-l border-[var(--border)] pl-4">
          {list.map((u) => (
            <li key={u.usage}>
              <span className="font-mono text-sm text-[var(--foreground)]">{u.usage}</span>
              <span className="ml-2 text-sm text-[var(--foreground)]/70">{u.description}</span>
              <Options options={u.options} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function CommandsPage() {
  const all = commands as Command[];
  const players = all.filter((c) => !c.managersOnly);
  const managers = all.filter((c) => c.managersOnly && !LEGACY.test(c.name));
  const legacy = all.filter((c) => LEGACY.test(c.name));

  return (
    <>
      <DocTitle
        path="commands"
        title="Commands"
        lead={<>Every slash command havocish has, generated from the bot itself. Type <C>/</C> in Discord to see them with autocomplete.</>}
      />

      <H2>For everyone</H2>
      <div className="space-y-3">{players.map((c) => <CommandCard key={c.name} c={c} />)}</div>

      <H2>For managers</H2>
      <P>Only the server owner and members with <b>Manage Server</b> see these.</P>
      <div className="space-y-3">{managers.map((c) => <CommandCard key={c.name} c={c} />)}</div>

      <H2>Older config commands</H2>
      <Note>
        These edit settings by typing values into Discord. The dashboard does all of it with pickers and previews, and{" "}
        <C>/config</C> covers quick on/off switches. They still work, but we plan to retire them.
      </Note>
      <ul className="flex flex-wrap gap-2">
        {legacy.map((c) => <li key={c.name}><C>/{c.name}</C></li>)}
      </ul>
    </>
  );
}
