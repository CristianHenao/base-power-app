"use client";

import { ArrowUp, MessageCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MAX_QUESTION, MAX_TURNS, type ChatTurn } from "@/lib/utility-map/chat-answer";
import type { ChatPart, PlaceKind } from "@/lib/utility-map/chat-guard";

/** Plain-text answers: "- " list items become bullets, and markdown bold markers are dropped. */
const tidy = (text: string) => text.replace(/(^|\n)\s*[-*] /g, "$1• ").replace(/\*\*/g, "");

export type ChatEntry =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; parts: ChatPart[]; note: string | null };

/**
 * "Ask about this map": a bar under the right panel that opens its own chat window there;
 * the panel gets shorter instead of being covered. The conversation lives in the parent,
 * so it survives picking another place. Answers come from /api/utility-map/chat, which checks
 * every number against the release; places in an answer open their score card.
 */
export function MapChat({
  entries,
  onEntries,
  open,
  onOpenChange,
  viewQuery,
  suggestions,
  onPlace,
}: {
  entries: ChatEntry[];
  onEntries: (update: (prev: ChatEntry[]) => ChatEntry[]) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The view as a URL query, so the server knows what's on screen. */
  viewQuery: string;
  suggestions: string[];
  onPlace: (kind: PlaceKind, id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [entries, pending, open]);

  async function ask(question: string) {
    const q = question.trim().slice(0, MAX_QUESTION);
    if (!q || pending) return;
    setError(null);
    setDraft("");
    const history: ChatTurn[] = entries.map((e) => ({ role: e.role, content: e.text }));
    // Keep the most recent turns, starting on a question.
    let turns = [...history, { role: "user" as const, content: q }].slice(-MAX_TURNS);
    if (turns[0].role !== "user") turns = turns.slice(1);
    onEntries((prev) => [...prev, { role: "user", text: q }]);
    setPending(true);
    try {
      const response = await fetch("/api/utility-map/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view: viewQuery, turns }),
        signal: AbortSignal.timeout(45_000),
      });
      const body = (await response.json().catch(() => ({}))) as {
        text?: string;
        parts?: ChatPart[];
        note?: string | null;
        error?: string;
      };
      // A sign-in redirect lands on an HTML page with status 200: that's not an answer either.
      if (response.redirected && !body.error) body.error = "Your session has expired. Refresh the page and sign in again.";
      if (!response.ok || response.redirected || !body.text || !Array.isArray(body.parts)) {
        setError(
          body.error === "not_configured"
            ? "Chat isn't available right now: it hasn't been set up on this server."
            : (body.error ?? "The chat couldn't answer right now."),
        );
        // Take the unanswered question back out so the conversation stays question, answer.
        onEntries((prev) => prev.slice(0, -1));
        setDraft(q);
        return;
      }
      onEntries((prev) => [...prev, { role: "assistant", text: body.text ?? "", parts: body.parts ?? [], note: body.note ?? null }]);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "TimeoutError"
          ? "The chat took too long to answer. Try again."
          : "The chat couldn't answer right now. Check your connection and try again.",
      );
      onEntries((prev) => prev.slice(0, -1));
      setDraft(q);
    } finally {
      setPending(false);
    }
  }

  const empty = entries.length === 0;
  return (
    <div className="flex w-full shrink-0 flex-col">
      {open ? (
        <section
          aria-label="Ask about this map"
          className="flex h-[min(440px,52dvh)] w-full origin-bottom animate-in fade-in slide-in-from-bottom-2 flex-col overflow-hidden rounded-[20px] bg-white shadow-[var(--bp-shadow-floating)] duration-200"
        >
          <header className="flex items-start gap-3 bg-[var(--bp-green-90)] px-5 py-4 text-white">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--bp-green-20)] text-[var(--bp-green-100)]">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] leading-[24px] font-semibold">Ask about this map</h2>
              <p className="text-[12px] leading-[17px] text-white/75">
                Answers come only from this map&apos;s data. Numbers that can&apos;t be found for the place they describe are removed.
              </p>
            </div>
            {!empty ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  onEntries(() => []);
                  setError(null);
                }}
                className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40"
                aria-label="Start over"
                title="Start over"
              >
                <RotateCcw className="size-4" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="Close chat"
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[var(--bp-grey-5)] px-4 py-4" aria-live="polite">
            {empty ? (
              <div className="space-y-3">
                <p className="text-[14px] leading-[21px]">
                  Ask about the Grid Risk Index, weather hazards, past storms, the size of a grid, or what a Base fleet could add.
                  Try one of these:
                </p>
                <div className="flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-2xl border border-[var(--bp-grey-20)] bg-white px-4 py-2.5 text-left text-[14px] leading-[20px] shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors hover:border-[var(--bp-green-60)] hover:bg-[var(--bp-green-5)]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              entries.map((e, i) =>
                e.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <p className="max-w-[85%] rounded-[18px] rounded-br-md bg-[var(--bp-green-90)] px-4 py-2.5 text-[14px] leading-[21px] text-white">
                      {e.text}
                    </p>
                  </div>
                ) : (
                  <div key={i} className="flex gap-2">
                    <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--bp-green-20)] text-[var(--bp-green-100)]">
                      <Sparkles className="size-3.5" aria-hidden />
                    </span>
                    <div className="max-w-[88%] space-y-1.5 rounded-[18px] rounded-tl-md bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                      <p className="text-[14px] leading-[21px] whitespace-pre-line">
                        {e.parts.map((p, j) =>
                          p.type === "text" ? (
                            <span key={j}>{tidy(p.text)}</span>
                          ) : (
                            <button
                              key={j}
                              type="button"
                              onClick={() => onPlace(p.kind, p.id)}
                              className="font-semibold text-[var(--bp-green-90)] underline decoration-[var(--bp-green-20)] decoration-2 underline-offset-2 hover:decoration-current"
                            >
                              {p.label}
                            </button>
                          ),
                        )}
                      </p>
                      {e.note ? <p className="text-[12px] leading-[18px] text-muted-foreground">{e.note}</p> : null}
                    </div>
                  </div>
                ),
              )
            )}
            {pending ? (
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span className="flex gap-1" aria-hidden>
                  <span className="size-1.5 animate-bounce rounded-full bg-[var(--bp-green-60)] [animation-delay:-0.3s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-[var(--bp-green-60)] [animation-delay:-0.15s]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-[var(--bp-green-60)]" />
                </span>
                Checking the map&apos;s data…
              </div>
            ) : null}
            {error ? (
              <p className="rounded-2xl border border-[var(--bp-red-80)]/30 bg-white px-4 py-2.5 text-[13px] leading-[19px] text-destructive">
                {error}
              </p>
            ) : null}
            <div ref={endRef} />
          </div>

          <form
            className="flex items-end gap-2 border-t bg-white px-3 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(draft);
            }}
          >
            <label className="flex-1">
              <span className="sr-only">Your question</span>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_QUESTION))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(draft);
                  }
                }}
                rows={1}
                autoFocus
                placeholder="Ask about a utility, county, storm…"
                className="max-h-28 min-h-[44px] w-full resize-none rounded-[22px] border border-[var(--bp-grey-20)] bg-[var(--bp-grey-5)] px-4 py-2.5 text-[14px] leading-[21px] outline-none focus:border-[var(--bp-green-60)] focus:bg-white"
              />
            </label>
            <button
              type="submit"
              disabled={pending || draft.trim() === ""}
              aria-label="Send"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--bp-green-90)] text-white transition-opacity disabled:opacity-35"
            >
              <ArrowUp className="size-5" aria-hidden />
            </button>
          </form>
        </section>
      ) : null}

      {!open ? (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => onOpenChange(true)}
          className="flex w-full items-center gap-2.5 rounded-[20px] bg-[var(--bp-green-90)] py-3 pr-5 pl-3 text-left text-[15px] font-semibold text-white shadow-[var(--bp-shadow-media)] transition-colors hover:bg-[var(--bp-green-100)]"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-[var(--bp-green-20)] text-[var(--bp-green-100)]">
            <MessageCircle className="size-4" aria-hidden />
          </span>
          <span className="flex-1">
            Ask about this map
            <span className="block text-[12px] leading-[17px] font-normal text-white/75">
              Scores, hazards, storms, the grid or the data
            </span>
          </span>
          {entries.length > 0 ? (
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[12px] font-medium">{Math.ceil(entries.length / 2)}</span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
