import { dropUnverified, numbersIn, unverifiedNumbers } from "./chat-guard.ts";

/** The chat's server-side logic, free of the network so it can be tested with a fake model. */

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ModelCall = (turns: ChatTurn[]) => Promise<string>;

export const MAX_TURNS = 8;
export const MAX_QUESTION = 500;
const MAX_TURN = 4000;

/**
 * Ask the model, then check every number against the facts and the user's own words (never the
 * earlier assistant turns: the browser sends those, so they can't vouch for anything). One retry
 * names the unverified numbers; what still fails is dropped, with a note for the reader.
 */
export async function answerQuestion(input: { facts: string; turns: ChatTurn[]; call: ModelCall }): Promise<{ text: string; note: string | null }> {
  const { facts, turns, call } = input;
  const allowed = new Set([...numbersIn(facts), ...turns.filter((t) => t.role === "user").flatMap((t) => numbersIn(t.content))]);
  const first = (await call(turns)).trim();
  const bad = unverifiedNumbers(first, allowed);
  if (bad.length === 0) return { text: first, note: null };

  const retry = (
    await call([
      ...turns,
      { role: "assistant", content: first },
      {
        role: "user",
        content: `These numbers aren't in the facts: ${bad.join(", ")}. Answer again using only numbers that appear in the facts, exactly as written there. If the facts don't have the number, say so.`,
      },
    ])
  ).trim();
  const stillBad = unverifiedNumbers(retry, allowed);
  if (stillBad.length === 0) return { text: retry, note: null };
  return { text: dropUnverified(retry, stillBad), note: "Part of this answer was removed because its numbers couldn't be checked against the map's data." };
}

export type ChatRequest = { view: string; turns: ChatTurn[] };

/** The body the browser may send: the view as a URL query, and alternating turns ending with a question. */
export function validateChatRequest(body: unknown): { ok: true; value: ChatRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send JSON with view and turns." };
  const { view, turns } = body as { view?: unknown; turns?: unknown };
  if (typeof view !== "string" || view.length > 2000) return { ok: false, error: "view must be a URL query string." };
  if (!Array.isArray(turns) || turns.length === 0 || turns.length > MAX_TURNS) return { ok: false, error: `Send 1 to ${MAX_TURNS} turns.` };
  for (const [i, t] of turns.entries()) {
    const role = i % 2 === 0 ? "user" : "assistant";
    if (!t || typeof t !== "object" || (t as ChatTurn).role !== role || typeof (t as ChatTurn).content !== "string") {
      return { ok: false, error: "Turns must alternate, starting with the user." };
    }
    if ((t as ChatTurn).content.length > MAX_TURN) return { ok: false, error: "A turn is too long." };
  }
  const last = turns[turns.length - 1] as ChatTurn;
  if (last.role !== "user") return { ok: false, error: "The last turn must be a question." };
  if (last.content.trim().length === 0 || last.content.length > MAX_QUESTION) return { ok: false, error: `Questions are 1 to ${MAX_QUESTION} characters.` };
  return { ok: true, value: { view, turns: turns as ChatTurn[] } };
}

/** At most `limit` requests per key in any `windowMs`; in memory, per server instance. */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    return true;
  };
}
