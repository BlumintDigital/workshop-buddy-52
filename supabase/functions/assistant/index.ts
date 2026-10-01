// Ask Shoplane: answers a signed-in person's question about their workshop's data or about using
// Shoplane. An add-on Shoplane Control switches on (feature flag "assistant").
//
// POST { messages: [{ role: "user" | "assistant", content }], page?: "/current/path" }
//   → { answer, draft? }   draft: a message to the workshop for a client to send themselves
//
// Every lookup runs as the person asking, so the database's rules decide what the AI can see.
// Conversations are not stored; only a count of questions and tokens per person per day.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";
import { captureEdgeError } from "../_shared/sentry.ts";
import { MFA_REQUIRED, sessionVerified } from "../_shared/session.ts";
import {
  buildRequest, cleanHistory, DEFAULT_MODELS, guideFor, parseReply, type Provider, type Role,
  safeLinks, systemPrompt, toolsFor, type Turn,
} from "./core.ts";
import { GUIDE_MARKDOWN } from "./guide.ts";
import { runTool, type ToolOutcome } from "./tools.ts";

const MAX_ROUNDS = 6;
const KEY_ENV: Record<Provider, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY" };

Deno.serve(async (req) => {
  const cors = { ...buildCorsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Sign in again." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    // Signed in as the person: every read below goes through the database's rules.
    const db = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    const { data: claims, error: claimsErr } = await db.auth.getClaims(authHeader.slice(7));
    const userId = claims?.claims?.sub as string | undefined;
    if (claimsErr || !userId) return json({ error: "Sign in again." }, 401);
    if (!(await sessionVerified(authHeader))) return json({ error: MFA_REQUIRED }, 403);

    const [{ data: flags }, { data: roleRow }, { data: settings }, { data: profile }, { data: workshop }] = await Promise.all([
      admin.from("feature_flags").select("key, enabled"),
      db.rpc("get_user_role", { _user_id: userId }),
      admin.from("assistant_settings").select("*").eq("id", 1).maybeSingle(),
      admin.from("profiles").select("full_name, is_active").eq("id", userId).maybeSingle(),
      admin.from("workshop_settings").select("workshop_name").eq("id", 1).maybeSingle(),
    ]);
    const features = Object.fromEntries((flags ?? []).map((f: any) => [f.key, f.enabled]));
    if (features.assistant !== true) return json({ error: "The assistant isn't switched on for this workshop." }, 403);
    const role = roleRow as Role | null;
    if (!role || !["admin", "manager", "staff", "client"].includes(role) || profile?.is_active === false) {
      return json({ error: "Your account can't use the assistant." }, 403);
    }
    if (role === "client" && features.client_portal === false) return json({ error: "The client portal is switched off." }, 403);

    const provider: Provider = settings?.provider === "openai" ? "openai" : "anthropic";
    const apiKey = Deno.env.get(KEY_ENV[provider]);
    if (!apiKey) return json({ error: "The assistant isn't set up yet. Ask Shoplane support." }, 503);
    const model = settings?.model || DEFAULT_MODELS[provider];

    const input = await req.json().catch(() => ({}));
    const turns = cleanHistory(input?.messages);
    if (!turns.length) return json({ error: "Type a question first." }, 400);

    // Limits: a burst guard, a daily allowance per person and the workshop's monthly allowance.
    const burst = await checkRateLimit(userId, "assistant", { limit: 10, windowSec: 60, lockoutSec: 60 });
    if (!burst.allowed) return json({ error: `That's a lot of questions at once. Try again in ${burst.retryAfterSec} seconds.` }, 429);
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 8)}01`;
    const { data: usage } = await admin.from("assistant_usage").select("user_id, used_on, questions").gte("used_on", monthStart);
    const mine = (usage ?? []).find((u: any) => u.user_id === userId && u.used_on === today)?.questions ?? 0;
    const month = (usage ?? []).reduce((n: number, u: any) => n + u.questions, 0);
    if (mine >= (settings?.daily_question_limit_per_person ?? 40)) {
      return json({ error: "You've reached today's limit for questions. It resets tomorrow." }, 429);
    }
    if (month >= (settings?.monthly_question_limit ?? 1000)) {
      return json({ error: "The workshop has used this month's questions. Ask your admin to contact Shoplane." }, 429);
    }

    const page = /^\/[\w\-/#]{0,120}$/.test(String(input?.page ?? "")) ? String(input.page) : null;
    const system = systemPrompt({
      role,
      name: profile?.full_name ?? null,
      workshop: workshop?.workshop_name ?? null,
      page,
      today,
      guide: guideFor(GUIDE_MARKDOWN, role),
    });
    const tools = toolsFor(role, features);

    let inputTokens = 0;
    let outputTokens = 0;
    let answer = "";
    let draft: ToolOutcome["draft"];
    const convo: Turn[] = [...turns];

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const last = round === MAX_ROUNDS - 1;
      const request = buildRequest(provider, apiKey, model, system, convo, last ? [] : tools);
      const res = await fetch(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(request.body) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = body?.error?.message ?? `status ${res.status}`;
        await captureEdgeError(new Error(`assistant ${provider} ${model}: ${detail}`), "assistant");
        return json({ error: res.status === 429 ? "The assistant is busy. Try again in a minute." : "The assistant couldn't answer just now. Try again shortly." }, 502);
      }
      const reply = parseReply(provider, body);
      inputTokens += reply.inputTokens;
      outputTokens += reply.outputTokens;
      if (!reply.toolCalls.length) {
        answer = reply.text;
        break;
      }
      convo.push({ role: "assistant", text: reply.text, toolCalls: reply.toolCalls });
      const allowed = new Set(tools.map((t) => t.name));
      const results = await Promise.all(reply.toolCalls.map(async (call) => {
        if (!allowed.has(call.name)) return { id: call.id, content: JSON.stringify({ error: "Not available." }) };
        try {
          const out = await runTool(call.name, call.input, { db, role, userId });
          if (out.draft) draft = out.draft;
          return { id: call.id, content: JSON.stringify(out.content).slice(0, 12000) };
        } catch (e) {
          return { id: call.id, content: JSON.stringify({ error: (e as Error).message }) };
        }
      }));
      convo.push({ role: "tool", results });
    }

    await admin.rpc("assistant_record_usage", {
      p_user: userId, p_role: role, p_input: inputTokens, p_output: outputTokens, p_handed_over: !!draft,
    });
    return json({
      answer: safeLinks(answer || "Sorry, I couldn't work that out. Try asking another way."),
      ...(draft ? { draft } : {}),
    });
  } catch (e) {
    await captureEdgeError(e, "assistant");
    return json({ error: "The assistant couldn't answer just now. Try again shortly." }, 500);
  }
});
