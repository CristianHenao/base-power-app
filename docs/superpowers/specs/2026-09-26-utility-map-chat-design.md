# Utility map: "Ask about this map" chat

Status: design approved in chat 2026-09-26 (model: Claude; answers with clickable places).

## Goal
A place at the bottom of the right panel where a rep, or a utility we show the map to, can ask
follow-up questions about the tool, the grid, weather events and the data, and get answers that
come only from our release. It speaks in risk, never in sales.

## Rules it must keep (CLAUDE.md)
- The LLM never calculates. Every number in an answer must appear in the facts we sent or in the
  user's own question; otherwise it doesn't ship.
- Outage data is county-level: "homes in the county", never "your home".
- Label estimates as estimates. No prices. Base facts only as listed in CLAUDE.md.

## User experience
- A collapsed bar at the bottom of the right panel: "Ask about this map". Opening it shows the
  conversation, 3-4 suggested questions for the current view, and an input (max 500 characters).
- Suggestions follow the view, e.g. statewide risk: "Which utilities are most at risk, and why?";
  a utility: "Why is CenterPoint Energy 98 out of 100?"; a storm: "Which counties did Beryl hit
  hardest?"; fleet: "What does a 5% Base fleet mean for Oncor?"
- Answers arrive whole after a short "Thinking…" state (not streamed, so the number check runs
  first). Any county or utility named in an answer is a button that opens its score card.
- If the key is missing or the model fails: "Chat isn't available right now." The map keeps working.
- The conversation lives in the component only (not stored, not in the URL).

## Architecture
- `src/lib/utility-map/chat-facts.ts` (pure, tested): `buildChatFacts(input)` returns the facts
  text: release date and data mode; what the screen shows (question, place, storm, share); the
  selected place's score card numbers; a compact table of all counties and all utilities (id,
  name, index, band, rank, hazard, stress, nine factor percentiles); the labeled storms (name,
  dates, top counties by peak customers out); layer methods and sources; the Base facts from
  CLAUDE.md. Plus `chatSuggestions(view, place)`.
- `src/lib/utility-map/chat-guard.ts` (pure, tested):
  - `unverifiedNumbers(reply, facts, question)`: numbers in the reply (place links removed first)
    that appear in neither the facts nor the question.
  - `dropUnverified(reply, bad)`: removes sentences that contain them.
  - `parseAnswer(reply, ids)`: splits the reply into text and place links written as
    `[[county:48201|Harris County]]` / `[[utility:oncor|Oncor]]`; unknown ids become plain text.
- `src/lib/utility-map/chat-server.ts`: loads the current release (`current.json`, then its
  `utility-map.json` and `hazards/storms.json`) from `public/` with `fs`, cached per release;
  `next.config.ts` gets an `outputFileTracingIncludes` entry so Vercel ships those files with the
  function. The browser sends only the validated view state and the conversation, never facts.
- `src/app/api/utility-map/chat/route.ts` (POST `{ view, messages }`): validates input (view
  through `viewFromUrl`'s rules, at most 8 turns, 500 characters each), rate-limits per client
  (10 per minute, in memory), calls Claude (`ANTHROPIC_MODEL` or `claude-sonnet-5`) with the facts
  as a cached system block, checks numbers, retries once naming the unverified numbers, then drops
  what still fails and adds a note. Returns `{ parts, note? }`. The model call is injected so the
  route logic is tested without the API.
- Already behind sign-in: the Supabase proxy protects `/api/utility-map/*`.
- `src/components/utility-map/map-chat.tsx`: the bar, transcript, suggestions and input; place
  buttons call the same `openCounty` / `selectUtility` the table uses.

## Out of scope
Streaming, the model driving the map (switching questions, storms, layers), saved chats,
questions about places outside Texas.

## Tests
chat-facts (every county and utility present; selected place's numbers present; suggestions per
view), chat-guard (numbers with commas, decimals and percents; link ids ignored by the number
check; unknown ids become text; sentence dropping), the route's retry and fallback with a fake model,
and a browser check with and without a key.
