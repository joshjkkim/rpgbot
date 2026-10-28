/*
 * The little markdown havocish writes: paragraphs, "- " or "1. " lists,
 * headings, **bold**, *italic* and `code`. Shared by the changelog page and the
 * helper's replies, so neither needs a markdown dependency.
 */

export function Inline({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, i) =>
    part.startsWith("**") ? <strong key={i}><Inline text={part.slice(2, -2)} /></strong>
    : part.startsWith("`") ? <code key={i}>{part.slice(1, -1)}</code>
    : part.startsWith("*") && part.length > 2 ? <em key={i}>{part.slice(1, -1)}</em>
    : part,
  );
}

/** A short reply as blocks; headings come out as bold lines, lists keep their kind. */
export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let items: string[] = [];
  let ordered = false;
  const flush = () => {
    if (items.length) {
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={blocks.length} className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>{items.map((t, i) => <li key={i}><Inline text={t} /></li>)}</List>);
    }
    items = [];
  };
  for (const line of text.split("\n")) {
    const bullet = /^\s*[-*] (.*)/.exec(line);
    const numbered = /^\s*\d+\. (.*)/.exec(line);
    if (bullet || numbered) {
      if (items.length && ordered !== !!numbered) flush();
      ordered = !!numbered;
      items.push((bullet ?? numbered)![1]!);
      continue;
    }
    flush();
    const heading = /^#{1,6} (.*)/.exec(line);
    if (heading) blocks.push(<p key={blocks.length}><strong><Inline text={heading[1]!} /></strong></p>);
    else if (line.trim()) blocks.push(<p key={blocks.length}><Inline text={line} /></p>);
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}
