/**
 * The chat's safety net (CLAUDE.md: the LLM never calculates). A number in an answer must appear
 * in the facts for the places that sentence talks about (or in the general lines: methods, bands,
 * Base facts), or in the user's own words. Place links must name real places.
 */

export type PlaceKind = "county" | "utility";
export type Place = { kind: PlaceKind; id: string; name: string };
export type ChatPart = { type: "text"; text: string } | { type: "place"; kind: PlaceKind; id: string; label: string };

// Thousands groups ("1,660,703"), decimals (".5", "2.7") and whole numbers; a minus counts as a
// sign only at the start of a word, so "1-20" and "2024-07-07" aren't read as negatives.
const NUMBER = /(?<![\w.])-?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,]*\d)|(?<![\w.])-?\d*\.\d+|(?<![\w.])-?\d+|\d+/g;
const PLACE_LINK = /\[\[(county|utility):([^|\]]+)\|([^\]]+)\]\]/g;
// "1.2 million", "3k", "$2M": a scale word turns a known number into a new one.
const SCALED = /\d[\d,]*(?:\.\d+)?\s*(?:million|billion|trillion|thousand|[kKMB]\b)/g;
// Multipliers state a calculation the facts don't make.
const MULTIPLIER = /\b(twice|thrice|double|triple|quadruple|half as)\b/gi;

/** Every number in the text, normalized so "1,660,703" = "1660703" and "2.70" = "2.7". */
export function numbersIn(text: string): string[] {
  return (text.match(NUMBER) ?? []).map((n) => String(Number(n.replace(/,/g, ""))));
}

// A link the model didn't close properly: show its name, not the brackets and id.
const BROKEN_LINK = /\[\[(?:county|utility):[^|\]]*\|([^\]]*)\]?(?!\])/g;
function fixBrokenLinks(text: string): string {
  return text.replace(BROKEN_LINK, "$1");
}

/** Replace place links with their labels (their ids are codes, not claims). */
export function stripPlaceLinks(text: string): string {
  return text.replace(PLACE_LINK, (_, _kind, _id, label: string) => label);
}

const splitSentences = (line: string) => line.split(/(?<=[.!?])\s+/);

/**
 * Builds the check for one request. badIn lists what a piece of text says that the facts can't
 * back; drop removes every sentence that has any.
 */
export function makeChecker(input: { facts: string; places: Place[]; userText: string }) {
  const { facts, places, userText } = input;
  const lines = facts.split("\n");
  const mentions = (text: string, p: Place) => text.includes(p.name) || text.startsWith(`${p.id} |`);
  // Each fact line belongs to the places it names; a line naming none is general.
  const general = new Set<string>();
  const byPlace = new Map<string, Set<string>>();
  for (const line of lines) {
    const named = places.filter((p) => mentions(line, p));
    if (named.length === 0) numbersIn(line).forEach((n) => general.add(n));
    for (const p of named) {
      const key = `${p.kind}:${p.id}`;
      if (!byPlace.has(key)) byPlace.set(key, new Set());
      numbersIn(line).forEach((n) => byPlace.get(key)!.add(n));
    }
  }
  const everything = new Set(numbersIn(facts));
  const fromUser = new Set(numbersIn(userText));

  const badInSentence = (sentence: string): string[] => {
    const bad: string[] = [];
    const linked = [...sentence.matchAll(PLACE_LINK)].map((m) => `${m[1]}:${m[2]}`);
    let plain = stripPlaceLinks(sentence);
    const named = places.filter((p) => plain.includes(p.name)).map((p) => `${p.kind}:${p.id}`);
    const about = [...new Set([...linked, ...named])];
    for (const m of plain.match(SCALED) ?? []) bad.push(m);
    plain = plain.replace(SCALED, " ");
    for (const m of plain.match(MULTIPLIER) ?? []) bad.push(m.toLowerCase());
    const allowed =
      about.length === 0 ? everything : new Set([...general, ...about.flatMap((key) => [...(byPlace.get(key) ?? [])])]);
    for (const n of numbersIn(plain)) if (!allowed.has(n) && !fromUser.has(n)) bad.push(n);
    return bad;
  };

  return {
    badIn: (text: string): string[] => [...new Set(text.split("\n").flatMap((line) => splitSentences(line).flatMap(badInSentence)))],
    drop: (text: string): string =>
      text
        .split("\n")
        .map((line) => splitSentences(line).filter((s) => badInSentence(s).length === 0).join(" "))
        .filter((line) => line.trim() !== "")
        .join("\n")
        .trim(),
  };
}

/** Split an answer into text and place links. A link shows the place's real name; an unknown id becomes its label as text. */
export function parseAnswer(reply: string, places: Place[]): ChatPart[] {
  const byKey = new Map(places.map((p) => [`${p.kind}:${p.id}`, p]));
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
    const place = byKey.get(`${kind}:${id}`);
    if (place) parts.push({ type: "place", kind, id, label: place.name });
    else pushText(label);
    at = m.index! + m[0].length;
  }
  pushText(reply.slice(at));
  return parts.map((p) => (p.type === "text" ? { ...p, text: fixBrokenLinks(p.text) } : p));
}
