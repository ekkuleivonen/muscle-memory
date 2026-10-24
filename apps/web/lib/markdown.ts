/**
 * A small markdown parser for authored descriptions and comments: paragraphs, headings,
 * lists, quotes, fenced code, inline code, bold, italics and links. It produces a tree that
 * is rendered as React elements, so raw HTML is never interpreted, and only http(s) and
 * same-site links become links. Anything it does not understand stays as plain text.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: number; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; children: Inline[] }
  | { type: "code"; lang?: string; value: string };

const FENCE = /^```\s*([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

/** Only web and same-site links; javascript:, data: and the like stay as text. */
export function safeHref(href: string): string | null {
  const value = href.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (value.startsWith("#")) return value;
  return null;
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = "";
  const flush = () => {
    if (plain) out.push({ type: "text", value: plain });
    plain = "";
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    // `code` wins over everything inside it.
    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      out.push({ type: "code", value: code[1] });
      i += code[0].length;
      continue;
    }
    // Only **bold**: __x__ reads as a dunder name (__proto__) far more often than as bold.
    const strong = /^\*\*(?=\S)([\s\S]*?\S)\*\*/.exec(rest);
    if (strong) {
      flush();
      out.push({ type: "strong", children: parseInline(strong[1]) });
      i += strong[0].length;
      continue;
    }
    // _x_ only at word boundaries, so snake_case names stay intact.
    const em =
      /^\*(?=\S)([\s\S]*?\S)\*/.exec(rest) ??
      (/[\w]/.test(text[i - 1] ?? "")
        ? null
        : /^_(?=[^\s_])([\s\S]*?[^\s_])_(?![\w])/.exec(rest));
    if (em) {
      flush();
      out.push({ type: "em", children: parseInline(em[1]) });
      i += em[0].length;
      continue;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      const href = safeHref(link[2]);
      flush();
      if (href)
        out.push({ type: "link", href, children: parseInline(link[1]) });
      else out.push(...parseInline(link[1]));
      i += link[0].length;
      continue;
    }
    plain += text[i];
    i += 1;
  }
  flush();
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      i += 1; // closing fence, or the end of an unclosed block
      blocks.push({
        type: "code",
        lang: fence[1] || undefined,
        value: body.join("\n"),
      });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        children: parseInline(heading[2].trim()),
      });
      i += 1;
      continue;
    }
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line) && !BULLET.test(line);
      const marker = ordered ? NUMBERED : BULLET;
      const items: string[] = [];
      while (i < lines.length && lines[i].trim()) {
        const item = marker.exec(lines[i]);
        if (item) items.push(item[1]);
        else if (/^\s+\S/.test(lines[i]) && items.length)
          items[items.length - 1] += " " + lines[i].trim();
        else break;
        i += 1;
      }
      blocks.push({ type: "list", ordered, items: items.map(parseInline) });
      continue;
    }
    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]))
        quoted.push(QUOTE.exec(lines[i++])![1]);
      blocks.push({ type: "quote", children: parseInline(quoted.join(" ")) });
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !NUMBERED.test(lines[i]) &&
      !QUOTE.test(lines[i])
    )
      paragraph.push(lines[i++].trim());
    blocks.push({
      type: "paragraph",
      children: parseInline(paragraph.join(" ")),
    });
  }
  return blocks;
}
