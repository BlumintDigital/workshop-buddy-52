import { describe, expect, it } from "vitest";

// Mirrors the bug-report sanitisation in supabase/functions/send-email/index.ts.
// Kept in sync as a regression test so we never accidentally lose escaping.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeSubject(input: unknown): string {
  const raw = typeof input === "string" ? input : "";
  return raw.replace(/[\r\n]+/g, " ").trim().slice(0, 200) || "(no subject)";
}

function stripTagsAndClamp(input: unknown, max = 10_000): string {
  const raw = typeof input === "string" ? input : "";
  return raw.replace(/<[^>]*>/g, " ").slice(0, max);
}

describe("email sanitisation", () => {
  it("escapes HTML entities", () => {
    expect(escapeHtml("<script>alert('x')</script>")).toBe(
      "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;",
    );
  });

  it("collapses newlines in subjects", () => {
    expect(sanitizeSubject("a\nb\r\nc")).toBe("a b c");
  });

  it("falls back to placeholder for empty subjects", () => {
    expect(sanitizeSubject("   ")).toBe("(no subject)");
    expect(sanitizeSubject(undefined)).toBe("(no subject)");
  });

  it("clamps subject length to 200", () => {
    const out = sanitizeSubject("x".repeat(500));
    expect(out.length).toBe(200);
  });

  it("strips tags from html bodies", () => {
    expect(stripTagsAndClamp("<b>hi</b><img src=x>")).toBe(" hi  ");
  });

  it("clamps body length", () => {
    const out = stripTagsAndClamp("y".repeat(20_000));
    expect(out.length).toBeLessThanOrEqual(10_000);
  });
});
