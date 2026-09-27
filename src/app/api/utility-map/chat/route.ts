import { answerQuestion, createRateLimiter, validateChatRequest } from "@/lib/utility-map/chat-answer";
import { viewFacts } from "@/lib/utility-map/chat-facts";
import { parseAnswer, type Place } from "@/lib/utility-map/chat-guard";
import { claudeCall, loadChatRelease } from "@/lib/utility-map/chat-server";
import { viewFromUrl } from "@/lib/utility-map/view";

// "Ask about this map": answers from the published release only, every number checked
// (docs/superpowers/specs/2026-09-26-utility-map-chat-design.md). Behind sign-in via src/proxy.ts.

const limit = createRateLimiter(10, 60_000);
// Up to two model calls of at most 20 s each.
export const maxDuration = 60;

export async function POST(request: Request) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!limit(client)) {
    return Response.json({ error: "Too many questions. Try again in a minute." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const checked = validateChatRequest(body);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });

  try {
    const { data, storms, statewide } = await loadChatRelease();
    const view = viewFromUrl(new URLSearchParams(checked.value.view), {
      layers: data.layers,
      utilityIds: new Set(data.utilities.map((u) => u.id)),
      countyFips: new Set(data.counties.map((c) => c.fips)),
      utilityCounties: new Map(data.utilities.map((u) => [u.id, u.counties])),
      stormNames: new Set(storms.map((s) => s.name)),
    });
    const onScreen = viewFacts(data, storms, view);
    const call = claudeCall(statewide, onScreen);
    if (!call) return Response.json({ error: "not_configured" }, { status: 503 });

    const places: Place[] = [
      ...data.counties.map((c) => ({ kind: "county" as const, id: c.fips, name: `${c.name} County` })),
      ...data.utilities.map((u) => ({ kind: "utility" as const, id: u.id, name: u.name })),
    ];
    const { text, note } = await answerQuestion({ facts: `${statewide}\n${onScreen}`, places, turns: checked.value.turns, call });
    if (!text) {
      // Nothing survived the number check; an empty answer would also break the next request.
      return Response.json(
        { error: "The answer's numbers couldn't be checked against the map's data, so it was withheld. Try asking another way." },
        { status: 422 },
      );
    }
    return Response.json({ text, parts: parseAnswer(text, places), note });
  } catch (error) {
    console.error("[utility-map chat]", error);
    return Response.json({ error: "The chat couldn't answer right now." }, { status: 502 });
  }
}
