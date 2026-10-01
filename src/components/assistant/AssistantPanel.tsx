import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowUp, Loader2, MessageSquareText, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatureFlags";
import { useWorkshopSettings } from "@/hooks/useWorkshopSettings";
import { askAssistant, inlineParts, type AssistantMessage } from "@/lib/assistant";
import { cn } from "@/lib/utils";

const STORE_PREFIX = "shoplane-assistant:";

const STARTERS: Record<AppRole, string[]> = {
  client: ["Where is my project up to?", "Do I have any unpaid invoices?", "When is my next appointment?"],
  staff: ["What am I working on this week?", "How do I hand a task over?", "Which stock is running low?"],
  manager: ["Which projects are overdue?", "What's waiting for quality check?", "How do I send a change request?"],
  admin: ["Which invoices are overdue?", "How many projects are in progress?", "How do I invite a new client?"],
};

function load(userId: string | undefined): AssistantMessage[] {
  if (!userId) return [];
  try {
    const raw = sessionStorage.getItem(STORE_PREFIX + userId);
    return raw ? (JSON.parse(raw) as AssistantMessage[]) : [];
  } catch {
    return [];
  }
}

function save(userId: string | undefined, messages: AssistantMessage[]) {
  if (!userId) return;
  try {
    sessionStorage.setItem(STORE_PREFIX + userId, JSON.stringify(messages.slice(-20)));
  } catch {
    /* storage unavailable: the conversation just won't survive a reload */
  }
}

/**
 * "Ask" in the header: a chat that answers from the workshop's own records (only what this person
 * can see) and from the user guide. Shown when Shoplane Control has switched the add-on on.
 */
export function AssistantPanel() {
  const enabled = useFeature("assistant");
  const { user, role } = useAuth();
  const { data: workshop } = useWorkshopSettings();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>(() => load(user?.id));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setMessages(load(user?.id)), [user?.id]);
  useEffect(() => save(user?.id, messages), [user?.id, messages]);
  useEffect(() => {
    if (open) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, busy, open]);

  if (!enabled || !user || !role) return null;

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const next: AssistantMessage[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setText("");
    setBusy(true);
    try {
      const reply = await askAssistant(next, pathname);
      setMessages((m) => [...m, { role: "assistant", content: reply.answer, draft: reply.draft }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: (e as Error).message, error: true }]);
    }
    setBusy(false);
    input.current?.focus();
  };

  const go = (href: string, state?: unknown) => {
    setOpen(false);
    navigate(href, state ? { state } : undefined);
  };

  const name = workshop?.workshop_name || "the workshop";

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" className="min-h-[44px] gap-1.5 px-2.5" onClick={() => setOpen(true)} aria-label="Ask the assistant">
            <Sparkles className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Ask</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ask about your projects, invoices or how to do something</TooltipContent>
      </Tooltip>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="space-y-1 border-b px-5 py-4 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden /> Assistant
            </SheetTitle>
            <SheetDescription className="text-xs">
              Answers from {name}'s records and the user guide. It sees only what you can see, and can't change anything.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Ask a question, or try one of these:</p>
                <div className="flex flex-col items-start gap-2">
                  {STARTERS[role].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void ask(s)}
                      className="rounded-full border px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="space-y-2">
                  <Answer text={m.content} error={m.error} onLink={go} />
                  {m.draft && (
                    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                        Message to {name} about {m.draft.project_ref ?? m.draft.project_title}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{m.draft.message}</p>
                      <Button
                        size="sm"
                        className="mt-3"
                        onClick={() => go(`/projects/${m.draft!.project_id}`, { assistantDraft: { project_id: m.draft!.project_id, message: m.draft!.message } })}
                      >
                        Open in project chat
                      </Button>
                      <p className="mt-1.5 text-xs text-muted-foreground">Nothing is sent until you press Send there.</p>
                    </div>
                  )}
                </div>
              ),
            )}

            {busy && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Looking that up…
              </p>
            )}
            <div ref={bottom} />
          </div>

          <form
            className="space-y-2 border-t px-5 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
          >
            <div className="flex items-end gap-2">
              <Textarea
                ref={input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(text);
                  }
                }}
                placeholder="Ask a question…"
                aria-label="Your question"
                rows={1}
                maxLength={2000}
                className="max-h-32 min-h-[40px] resize-none text-sm"
              />
              <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Send question">
                <ArrowUp className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>AI answers can be wrong. Check anything important on the page.</span>
              {messages.length > 0 && (
                <button type="button" className="inline-flex shrink-0 items-center gap-1 hover:text-foreground" onClick={() => setMessages([])}>
                  <RotateCcw className="h-3 w-3" aria-hidden /> New chat
                </button>
              )}
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** The assistant's reply: paragraphs and bullet lists, with **bold** and links to pages in the app. */
function Answer({ text, error, onLink }: { text: string; error?: boolean; onLink: (href: string) => void }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      blocks.push({ list: false, lines: [] });
      continue;
    }
    const item = /^\s*(?:[-*•]|\d+\.)\s+/.test(line);
    const prev = blocks[blocks.length - 1];
    const content = item ? line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, "") : line.replace(/^#+\s*/, "");
    if (prev && prev.list === item && prev.lines.length) prev.lines.push(content);
    else blocks.push({ list: item, lines: [content] });
  }

  const inline = (line: string) =>
    inlineParts(line).map((p, i) =>
      p.kind === "bold" ? (
        <strong key={i}>{p.text}</strong>
      ) : p.kind === "link" ? (
        <Link
          key={i}
          to={p.href}
          className="font-medium text-primary underline-offset-2 hover:underline"
          onClick={(e) => {
            e.preventDefault();
            onLink(p.href);
          }}
        >
          {p.text}
        </Link>
      ) : (
        <Fragment key={i}>{p.text}</Fragment>
      ),
    );

  return (
    <div className={cn("space-y-2 text-sm leading-relaxed", error && "text-destructive")}>
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.list ? (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {b.lines.map((l, j) => <li key={j}>{inline(l)}</li>)}
            </ul>
          ) : (
            <p key={i} className="break-words">
              {b.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  {inline(l)}
                </Fragment>
              ))}
            </p>
          ),
        )}
    </div>
  );
}
