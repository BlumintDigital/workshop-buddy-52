// Calls to the assistant edge function (supabase/functions/assistant).

import { supabase } from "@/integrations/supabase/client";

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
  /** A message to the workshop the assistant prepared for a client to check and send. */
  draft?: AssistantDraft;
  error?: boolean;
}

export interface AssistantDraft {
  project_id: string;
  project_ref: string | null;
  project_title: string;
  message: string;
}

export async function askAssistant(messages: AssistantMessage[], page: string): Promise<{ answer: string; draft?: AssistantDraft }> {
  const history = messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
  const { data, error } = await supabase.functions.invoke("assistant", { body: { messages: history, page } });
  if (error) {
    // Non-2xx: the function's own message is in the response body.
    let message = "The assistant couldn't answer just now. Try again shortly.";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        message = (await ctx.json())?.error ?? message;
      } catch {
        /* keep the generic message */
      }
    }
    throw new Error(message);
  }
  return data as { answer: string; draft?: AssistantDraft };
}

export type InlinePart = { kind: "text" | "bold"; text: string } | { kind: "link"; text: string; href: string };

/** Splits one line of the assistant's answer into text, **bold** and [internal](/links). */
export function inlineParts(line: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((\/[^)\s]*)\)/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) parts.push({ kind: "text", text: line.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ kind: "bold", text: m[1] });
    else if (m[3].startsWith("//")) parts.push({ kind: "text", text: m[2] });
    else parts.push({ kind: "link", text: m[2], href: m[3] });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ kind: "text", text: line.slice(last) });
  return parts;
}
