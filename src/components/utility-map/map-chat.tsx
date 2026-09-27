"use client";

import { ArrowUp, ChevronDown, ChevronUp, MessageCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MAX_QUESTION, MAX_TURNS, type ChatTurn } from "@/lib/utility-map/chat-answer";
import type { ChatPart, PlaceKind } from "@/lib/utility-map/chat-guard";
import { cn } from "@/lib/utils";

export type ChatEntry =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; parts: ChatPart[]; note: string | null };

/**
 * "Ask about this map", at the bottom of the right panel. The conversation lives in the parent,
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

  return (
    <div className="border-t bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center gap-2 px-5 py-3 text-left hover:bg-[var(--bp-grey-5)]"
      >
        <MessageCircle className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">
          <span className="block text-[14px] leading-[21px] font-semibold">Ask about this map</span>
          {!open ? (
            <span className="block text-[12px] leading-[18px] text-muted-foreground">
              Questions about the scores, hazards, storms, grid or data
            </span>
          ) : null}
        </span>
        {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronUp className="size-4" aria-hidden />}
      </button>

      {open ? (
        <div className="flex max-h-[min(420px,50dvh)] flex-col gap-3 px-5 pb-4">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto" aria-live="polite">
            {entries.length === 0 ? (
              <div className="space-y-2">
                <p className="text-[12px] leading-[18px] text-muted-foreground">
                  Answers use only this map&apos;s data. A number that can&apos;t be found in the data for the place it describes is removed before you see it.
                </p>
                <div className="flex flex-col gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => ask(s)}
                      className="rounded-xl border px-3 py-2 text-left text-[13px] leading-[19px] hover:bg-[var(--bp-grey-5)]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              entries.map((e, i) =>
                e.role === "user" ? (
                  <p key={i} className="ml-8 rounded-2xl bg-[var(--bp-grey-5)] px-3 py-2 text-[14px] leading-[21px]">
                    {e.text}
                  </p>
                ) : (
                  <div key={i} className="space-y-1">
                    {e.text ? (
                      <p className="text-[14px] leading-[21px] whitespace-pre-line">
                        {e.parts.map((p, j) =>
                          p.type === "text" ? (
                            <span key={j}>{p.text}</span>
                          ) : (
                            <button
                              key={j}
                              type="button"
                              onClick={() => onPlace(p.kind, p.id)}
                              className="font-semibold underline decoration-[var(--bp-green-20)] decoration-2 underline-offset-2 hover:decoration-current"
                            >
                              {p.label}
                            </button>
                          ),
                        )}
                      </p>
                    ) : null}
                    {e.note ? <p className="text-[12px] leading-[18px] text-muted-foreground">{e.note}</p> : null}
                  </div>
                ),
              )
            )}
            {pending ? <p className="text-[13px] text-muted-foreground">Checking the map&apos;s data…</p> : null}
            {error ? <p className="text-[13px] leading-[19px] text-destructive">{error}</p> : null}
            <div ref={endRef} />
          </div>

          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void ask(draft);
            }}
          >
            {entries.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  onEntries(() => []);
                  setError(null);
                }}
                className="rounded-full p-2 text-muted-foreground hover:bg-[var(--bp-grey-5)]"
                aria-label="Start over"
                title="Start over"
              >
                <RotateCcw className="size-4" aria-hidden />
              </button>
            ) : null}
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
                placeholder="Ask a question"
                className="max-h-24 min-h-[40px] w-full resize-none rounded-2xl border px-3 py-2 text-[14px] leading-[21px] outline-none focus:border-[var(--bp-grey-100)]"
              />
            </label>
            <button
              type="submit"
              disabled={pending || draft.trim() === ""}
              aria-label="Send"
              className={cn(
                "rounded-full bg-[var(--bp-grey-100)] p-2.5 text-white",
                (pending || draft.trim() === "") && "opacity-40",
              )}
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
