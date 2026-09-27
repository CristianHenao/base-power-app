# Utility map chat: implementation plan

> For agentic workers: executed inline (superpowers:executing-plans). Checkbox steps; tests first.

**Goal:** "Ask about this map" at the bottom of the right panel, answering only from the release.
**Spec:** docs/superpowers/specs/2026-09-26-utility-map-chat-design.md
**Stack:** Next.js 16 route handler, @anthropic-ai/sdk (already installed), Node test runner.

## Global constraints
- Every number in an answer appears in the facts or the question, or it is dropped (CLAUDE.md).
- Facts are built on the server from the release; the browser sends only the view (URL query) and turns.
- Model: `process.env.ANTHROPIC_MODEL || "claude-sonnet-5"`; key `ANTHROPIC_API_KEY`; no key → 503, UI says so.
- Limits: 8 turns, 500 characters per question, 10 requests per minute per client.
- Risk language, no sales wording, no prices, "homes in the county" not "your home".

## Review focus
1. A number reformatted by the model ("1,660,703" vs "1660703", "91%" vs "91") must still verify.
2. Place links with unknown ids must render as text, never as a broken button.
3. A missing key or model error must not break the page.
4. Prompt injection in the question ("ignore the facts") must not unlock unverified numbers.
5. The chat keeps its conversation when the selected place changes.

## Tasks
### Task 1: chat-guard (numbers and place links)
Files: `src/lib/utility-map/chat-guard.ts`, `chat-guard.test.ts`.
Produces: `numbersIn(text): string[]`, `unverifiedNumbers(reply, allowed: Set<string>): string[]`,
`dropUnverified(reply, bad: string[]): string`, `stripPlaceLinks(text)`, `parseAnswer(reply, ids): ChatPart[]`
with `ChatPart = {type:"text",text} | {type:"place",kind:"county"|"utility",id,label}`.
- [ ] tests: commas/decimals/percent normalize; link ids ignored; unknown ids → text; sentence dropping.
- [ ] implement; `npm run test:web`.

### Task 2: chat-facts (facts text and suggestions)
Files: `src/lib/utility-map/chat-facts.ts`, `chat-facts.test.ts`.
Produces: `statewideFacts(data, storms): string` (release, method, layers, sources, Base facts, all utilities,
all counties, storms), `viewFacts(data, storms, view): string` (what's on screen, selected place, fleet
numbers), `chatSuggestions(data, view): string[]`.
- [ ] tests: every utility and county id present; selected place numbers present; suggestions per view.
- [ ] implement; tests.

### Task 3: chat-answer (model loop with the number check)
Files: `src/lib/utility-map/chat-answer.ts`, `chat-answer.test.ts`.
Produces: `answerQuestion({ facts, turns, call }): Promise<{ text, note }>`; `call(turns) → Promise<string>`.
- [ ] tests with a fake `call`: clean answer passes; bad number → one retry naming it; still bad → dropped + note.
- [ ] implement; tests.

### Task 4: server route
Files: `src/lib/utility-map/chat-server.ts` (release from `public/` via fs, cached; Claude call),
`src/app/api/utility-map/chat/route.ts`, `next.config.ts` (`outputFileTracingIncludes`).
Consumes Tasks 1–3. Validates body, rate-limits, returns `{ parts, note? }` or `{ error }`.
- [ ] `validateChatRequest` + `rateLimit` pure and tested in `chat-answer.test.ts`.
- [ ] route; tsc; build.

### Task 5: UI
Files: `src/components/utility-map/map-chat.tsx`; `detail-panel.tsx` (`footer` slot);
`utility-map-experience.tsx` (turns state lifted so it survives place changes; place buttons → openCounty/selectUtility).
- [ ] implement; lint; browser check without a key (graceful message) and with a key if available.

### Task 6: finish
- [ ] pytest, test:web, tsc, build; commit; PR.
