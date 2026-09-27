/**
 * The chat's safety net (CLAUDE.md: the LLM never calculates). Every number in an answer must
 * appear in the facts we sent or in the user's question; place links must name real places.
 */

export type PlaceKind = "county" | "utility";
export type ChatPart = { type: "text"; text: string } | { type: "place"; kind: PlaceKind; id: string; label: string };

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const PLACE_LINK = /\[\[(county|utility):([^|\]]+)\|([^\]]+)\]\]/g;

/** Every number in the text, normalized so "1,660,703" = "1660703" and "2.70" = "2.7". */
export function numbersIn(text: string): string[] {
  return (text.match(NUMBER) ?? []).map((n) => String(Number(n.replace(/,/g, ""))));
}

/** Replace place links with their labels (their ids are codes, not claims). */
export function stripPlaceLinks(text: string): string {
  return text.replace(PLACE_LINK, (_, _kind, _id, label: string) => label);
}

/** Numbers in the reply that the facts and question don't contain, without repeats. */
export function unverifiedNumbers(reply: string, allowed: Set<string>): string[] {
  return [...new Set(numbersIn(stripPlaceLinks(reply)).filter((n) => !allowed.has(n)))];
}

/** Drop every sentence that contains an unverified number; keep the rest and the line breaks. */
export function dropUnverified(reply: string, bad: string[]): string {
  const badSet = new Set(bad);
  return reply
    .split("\n")
    .map((line) =>
      line
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !numbersIn(stripPlaceLinks(sentence)).some((n) => badSet.has(n)))
        .join(" "),
    )
    .filter((line, i, lines) => line.trim() !== "" || (i > 0 && lines[i - 1].trim() !== "" && i < lines.length - 1))
    .join("\n")
    .trim();
}

/** Split an answer into text and place links; a link to an unknown id becomes its label as text. */
export function parseAnswer(reply: string, ids: Record<PlaceKind, Set<string>>): ChatPart[] {
  const parts: ChatPart[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last?.type === "text") last.text += text;
    else parts.push({ type: "text", text });
  };
  let at = 0;
  for (const m of reply.matchAll(PLACE_LINK)) {
    pushText(reply.slice(at, m.index));
    const [, kind, id, label] = m as unknown as [string, PlaceKind, string, string];
    if (ids[kind].has(id)) parts.push({ type: "place", kind, id, label });
    else pushText(label);
    at = m.index! + m[0].length;
  }
  pushText(reply.slice(at));
  return parts;
}
