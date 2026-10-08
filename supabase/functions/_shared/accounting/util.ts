import { ProviderError } from "./types.ts";
export { ProviderError };

const enc = new TextEncoder();

/** HMAC-SHA256 of the body with the secret. */
export async function hmacSha256(secret: string, body: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
}

export const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
export const toHex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Constant-time comparison, so signatures can't be guessed byte by byte. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomSecret(bytes = 32): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Reads a JSON response, turning the other system's error into a readable one. */
export async function readJson(res: Response, what: string): Promise<any> {
  const text = await res.text();
  let body: any;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const detail =
      body?.Fault?.Error?.[0]?.Detail ?? body?.Fault?.Error?.[0]?.Message ?? // QuickBooks
      body?.Elements?.[0]?.ValidationErrors?.[0]?.Message ?? body?.Detail ?? body?.Message ?? // Xero
      body?.error_description ?? body?.error ?? text.slice(0, 300);
    // Rate limits and server trouble are worth retrying; the rest need a person.
    throw new ProviderError(`${what} failed (${res.status}): ${detail}`, res.status === 429 || res.status >= 500);
  }
  return body;
}

/** "Jo Bloggs Ltd" → a display name the other system will accept and we can find again. */
export function displayName(c: { name: string; company: string | null; id: string }): string {
  return (c.company?.trim() || c.name?.trim() || `Customer ${c.id.slice(0, 8)}`).slice(0, 100);
}
