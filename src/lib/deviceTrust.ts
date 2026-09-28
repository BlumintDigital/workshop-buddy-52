// "Trust this browser" for 2FA. The server issues a random token once the user
// has entered a code; this browser keeps it (one per user) and presents it on
// later sign-ins so the code isn't asked for again for 30 days. Revoking the
// browser in Profile → Security deletes the server copy, so a kept token then
// simply stops working.

const key = (userId: string) => `shoplane.device-trust.${userId}`;
const fnUrl = (name: string) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;

export function getDeviceToken(userId: string): string | null {
  try {
    return localStorage.getItem(key(userId));
  } catch {
    return null;
  }
}

export function forgetDevice(userId: string) {
  try {
    localStorage.removeItem(key(userId));
  } catch { /* storage unavailable */ }
}

/** A readable name for the Security list, e.g. "Chrome on Windows". */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/**
 * Is this browser trusted for the signed-in user? When it is, the server
 * also records the current session as vouched for, so the database treats it
 * like one that entered a code.
 */
export async function checkTrustedDevice(accessToken: string, userId: string): Promise<boolean> {
  const token = getDeviceToken(userId);
  try {
    const res = await fetch(fnUrl("mfa-check-device"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(token ? { "X-Device-Token": token } : {}),
      },
      body: "{}",
    });
    if (!res.ok) return false;
    const trusted = !!(await res.json())?.trusted;
    if (!trusted && token) forgetDevice(userId);
    return trusted;
  } catch {
    return false;
  }
}

/** Trusts this browser. Call right after a 2FA code has been accepted. */
export async function trustThisDevice(accessToken: string, userId: string): Promise<boolean> {
  try {
    const res = await fetch(fnUrl("mfa-trust-device"), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ device_label: deviceLabel() }),
    });
    if (!res.ok) return false;
    const body = await res.json();
    if (!body?.device_token) return false;
    localStorage.setItem(key(userId), body.device_token);
    return true;
  } catch {
    return false;
  }
}
