import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendNotifications } from "@/lib/notifications";

interface Comment {
  id: number;
  job_id: string;
  user_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  profiles: { full_name: string | null } | null;
}

function initials(name: string | null | undefined) {
  return (name || "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

interface Props {
  jobId: string;
  jobTitle?: string;
}

export default function JobComments({ jobId, jobTitle }: Props) {
  const { user, role } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canPostInternal = role === "admin" || role === "manager" || role === "staff";

  useEffect(() => {
    void load();

    const channel = supabase
      .channel(`job-comments-${jobId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "job_comments", filter: `job_id=eq.${jobId}` },
        () => void load(),
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [jobId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  async function load() {
    const { data } = await supabase
      .from("job_comments" as any)
      .select("*, profiles:user_id(full_name)")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    setComments(((data as unknown) as Comment[]) || []);
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text || !user) return;

    setSubmitting(true);
    const { error } = await supabase.from("job_comments" as any).insert({
      job_id: jobId,
      user_id: user.id,
      body: text,
      is_internal: isInternal,
    });

    if (!error) {
      setBody("");
      // Notify other parties in-app (fire-and-forget)
      if (!isInternal) {
        const { data: job } = await supabase
          .from("jobs")
          .select("assigned_to, client_id")
          .eq("id", jobId)
          .maybeSingle();
        const recipients = new Set<string>();
        if (job?.assigned_to) recipients.add(job.assigned_to as string);
        if (job?.client_id) recipients.add(job.client_id as string);
        recipients.delete(user.id);
        const title = "New comment";
        const message = `${user.email?.split("@")[0] ?? "Someone"} commented on "${jobTitle ?? "a job"}"`;
        const link = `/jobs/${jobId}`;
        void sendNotifications(
          Array.from(recipients).map((uid) => ({ user_id: uid, title, message, link })),
        );
      }
    }
    setSubmitting(false);
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Comments
          {comments.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({comments.length})</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Thread */}
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No comments yet. Start the conversation.
            </p>
          ) : (
            comments.map((c) => {
              const isOwn = c.user_id === user?.id;
              return (
                <div key={c.id} className={cn("flex items-end gap-2", isOwn && "flex-row-reverse")}>
                  <Avatar className="h-7 w-7 shrink-0 mb-0.5">
                    <AvatarFallback className="text-xs bg-muted">
                      {initials(c.profiles?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn("max-w-[75%] space-y-0.5", isOwn && "items-end flex flex-col")}>
                    <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", isOwn && "flex-row-reverse")}>
                      <span className="font-medium">{c.profiles?.full_name ?? "Unknown"}</span>
                      {c.is_internal && (
                        <Badge variant="outline" className="py-0 px-1.5 text-[10px] border-amber-400 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                          Internal
                        </Badge>
                      )}
                      <span>{relativeTime(c.created_at)}</span>
                    </div>
                    <div
                      className={cn(
                        "rounded-2xl px-3 py-2 text-sm leading-relaxed break-words",
                        isOwn
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : c.is_internal
                            ? "bg-amber-50 border border-amber-200 rounded-bl-sm dark:bg-amber-950/30 dark:border-amber-800"
                            : "bg-muted rounded-bl-sm",
                      )}
                    >
                      {c.body}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Compose */}
        <form onSubmit={handleSubmit} className="space-y-2 border-t pt-3">
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isInternal
                ? "Internal note — not visible to the client..."
                : "Write a message… (Enter to send, Shift+Enter for new line)"
            }
            rows={2}
            className={cn(
              "resize-none text-sm",
              isInternal && "border-amber-300 focus-visible:ring-amber-400 dark:border-amber-700",
            )}
            maxLength={2000}
          />
          <div className="flex items-center justify-between gap-3">
            {canPostInternal ? (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <Switch
                  checked={isInternal}
                  onCheckedChange={setIsInternal}
                  className="data-[state=checked]:bg-amber-500"
                />
                <span className="text-muted-foreground">Internal note</span>
              </label>
            ) : (
              <span />
            )}
            <Button type="submit" size="sm" disabled={submitting || !body.trim()}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {submitting ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
