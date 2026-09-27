import { useEffect, useRef, useState } from "react";
import { Eye, Lock, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatureFlags";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { sendNotifications } from "@/lib/notifications";
import { fetchProfileNames, initials, relativeTime } from "@/lib/profileNames";
import { projectLabel, projectPath } from "@/lib/projects";
import { cn } from "@/lib/utils";

type Channel = "team" | "client";

interface Note {
  id: number;
  user_id: string;
  body: string;
  is_internal: boolean;
  source: string;
  created_at: string;
  author: string;
}

export interface ConversationProject {
  id: string;
  ref: string;
  title: string;
  client_id: string | null;
  assigned_staff_id: string | null;
}

interface Props {
  project: ConversationProject;
  /** Client's display name, shown on the client-message composer so nobody is unsure who reads it. */
  clientName?: string;
  /** Extra team members to notify about team notes (e.g. task assignees). */
  teamIds?: string[];
}

/**
 * The project's two conversations, kept apart so an internal note can never be
 * sent to the client by mistake. Team notes are the default. Clients only ever
 * see the client thread; the database enforces the same rule.
 */
export default function ProjectConversation({ project, clientName, teamIds = [] }: Props) {
  const { user, role } = useAuth();
  const chatEnabled = useFeature("job_chat");
  const isClient = role === "client";
  const [notes, setNotes] = useState<Note[]>([]);
  // Bumped after posting, so your own message shows even if the live feed is down.
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<Channel>(isClient ? "client" : "team");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("job_comments")
        .select("id, user_id, body, is_internal, source, created_at")
        .eq("job_id", project.id)
        .order("created_at", { ascending: true });
      const rows = data ?? [];
      // Clients can't read staff profiles, so their view names the workshop instead.
      const fallback = isClient ? "Workshop team" : "Team member";
      const names = await fetchProfileNames(rows.map((r) => r.user_id), fallback);
      if (!cancelled) setNotes(rows.map((r) => ({ ...r, author: names[r.user_id] ?? fallback })));
    };
    void load();
    const channel = supabase
      .channel(`project-conversation-${project.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_comments", filter: `job_id=eq.${project.id}` }, () => void load())
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [project.id, isClient, version]);

  const team = notes.filter((n) => n.is_internal);
  const client = notes.filter((n) => !n.is_internal);

  const post = async (channel: Channel, body: string) => {
    if (!user) return false;
    const internal = channel === "team";
    const { error } = await supabase.from("job_comments").insert({ job_id: project.id, user_id: user.id, body, is_internal: internal });
    if (error) return error.message;
    setVersion((v) => v + 1);

    const recipients = new Set<string>(internal ? [project.assigned_staff_id, ...teamIds].filter((v): v is string => !!v) : []);
    if (!internal) {
      if (isClient) {
        if (project.assigned_staff_id) recipients.add(project.assigned_staff_id);
      } else if (project.client_id) {
        recipients.add(project.client_id);
      }
    }
    recipients.delete(user.id);
    const name = (user.email ?? "").split("@")[0] || "Someone";
    void sendNotifications(
      [...recipients].map((uid) => ({
        user_id: uid,
        title: internal ? "New team note" : "New message",
        message: `${name} on ${projectLabel(project)}: ${body.slice(0, 80)}${body.length > 80 ? "…" : ""}`,
        link: projectPath(project.id),
      })),
    );
    return true;
  };

  if (isClient) {
    if (!chatEnabled) return null;
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Messages</CardTitle>
          <p className="text-sm text-muted-foreground">Questions about this project go straight to the workshop team.</p>
        </CardHeader>
        <CardContent>
          <Thread notes={client} ownId={user?.id} empty="No messages yet." />
          <Composer label="Message to the workshop" placeholder="Write a message…" onSend={(b) => post("client", b)} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Conversation</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Channel)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="team" className="gap-1.5">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Team notes
              <Count n={team.length} />
            </TabsTrigger>
            {chatEnabled && (
              <TabsTrigger value="client" className="gap-1.5">
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Client messages
                <Count n={client.length} />
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="team" className="mt-4">
            <p className="mb-3 text-xs text-muted-foreground">Only your team sees these. The client never does.</p>
            <Thread notes={team} ownId={user?.id} empty="No team notes yet. Record findings, decisions and progress here." />
            <Composer label="Team note" placeholder="Add a team note…" onSend={(b) => post("team", b)} />
          </TabsContent>

          {chatEnabled && (
            <TabsContent value="client" className="mt-4">
              <div className="mb-3 flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info">
                <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Messages here are sent to <b>{clientName || "the client"}</b>.
                </span>
              </div>
              <Thread notes={client} ownId={user?.id} empty="No messages with the client yet." />
              <Composer
                label={`Message to ${clientName || "the client"}`}
                placeholder={`Message ${clientName || "the client"}…`}
                sendLabel="Send to client"
                disabled={!project.client_id}
                disabledHint="Link a client to this project to message them."
                onSend={(b) => post("client", b)}
              />
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Count({ n }: { n: number }) {
  if (n === 0) return null;
  return <span className="tabular-nums text-muted-foreground">{n}</span>;
}

function Thread({ notes, ownId, empty }: { notes: Note[]; ownId?: string; empty: string }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [notes.length]);

  if (notes.length === 0) return <p className="py-2 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="max-h-96 overflow-y-auto pr-1">
    <ol className="space-y-3" aria-live="polite">
      {notes.map((n) => {
        const own = n.user_id === ownId;
        return (
          <li key={n.id} className={cn("flex items-end gap-2", own && "flex-row-reverse")}>
            <Avatar className="mb-0.5 h-7 w-7 shrink-0">
              <AvatarFallback className="bg-muted text-xs">{initials(n.author)}</AvatarFallback>
            </Avatar>
            <div className={cn("flex max-w-[80%] flex-col gap-0.5", own && "items-end")}>
              <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", own && "flex-row-reverse")}>
                <span className="font-medium text-foreground">{own ? "You" : n.author}</span>
                <time dateTime={n.created_at} title={new Date(n.created_at).toLocaleString()}>
                  {relativeTime(n.created_at)}
                </time>
                {n.source === "update" && <span>· from Updates</span>}
              </div>
              <div
                className={cn(
                  "whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  own ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-secondary",
                )}
              >
                {n.body}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
    <div ref={bottom} />
    </div>
  );
}

function Composer({
  label,
  placeholder,
  sendLabel = "Send",
  disabled,
  disabledHint,
  onSend,
}: {
  label: string;
  placeholder: string;
  sendLabel?: string;
  disabled?: boolean;
  disabledHint?: string;
  onSend: (body: string) => Promise<boolean | string>;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = body.trim();
    if (!text || sending || disabled) return;
    setSending(true);
    const result = await onSend(text);
    setSending(false);
    if (result === true) {
      setBody("");
      setError(null);
    } else {
      setError(typeof result === "string" ? result : "Couldn't send. Try again.");
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-2 border-t pt-3">
      <Textarea
        aria-label={label}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        placeholder={placeholder}
        rows={2}
        maxLength={2000}
        disabled={disabled}
        className="resize-none text-sm"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{disabled ? disabledHint : error ? <span className="text-destructive">{error}</span> : "Ctrl + Enter to send"}</span>
        <Button type="submit" size="sm" disabled={sending || !body.trim() || disabled}>
          <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {sending ? "Sending…" : sendLabel}
        </Button>
      </div>
    </form>
  );
}
