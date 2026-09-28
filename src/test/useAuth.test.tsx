import React, { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

const mockSession = {
  access_token: "access-token",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "user-1" },
};

type MockSession = typeof mockSession;

let currentSession: MockSession | null = null;
let trustedDevice = false;
let mockRole = "admin";
let authCallback: ((event: string, session: MockSession | null) => void) | null = null;

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  const maybeSingleFor = (table: string) => {
    if (table === "user_roles") return Promise.resolve({ data: { role: mockRole }, error: null });
    if (table === "profiles") return Promise.resolve({ data: { full_name: "Test User", avatar_url: null }, error: null });
    return Promise.resolve({ data: null, error: null });
  };

  const basicProfile = {
    full_name: "Test User",
    avatar_url: null,
    company_name: null,
    phone: null,
    address: null,
    invite_accepted_at: new Date().toISOString(),
  };

  return {
    supabase: {
      rpc: vi.fn(async (fn: string) => {
        if (fn === "get_user_role") return { data: mockRole, error: null };
        if (fn === "get_my_basic_profile") return { data: basicProfile, error: null };
        return { data: null, error: null };
      }),
      auth: {
        signInWithPassword: vi.fn(async () => {
          currentSession = mockSession;
          return { data: { session: mockSession, user: mockSession.user }, error: null };
        }),
        signUp: vi.fn(),
        signOut: vi.fn(async () => {
          currentSession = null;
          return { error: null };
        }),
        getSession: vi.fn(async () => ({ data: { session: currentSession } })),
        onAuthStateChange: vi.fn((cb: typeof authCallback) => {
          authCallback = cb;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn(async () => ({
            data: { currentLevel: "aal1", nextLevel: "aal2" },
          })),
          listFactors: vi.fn(async () => ({
            data: { totp: [{ id: "factor-1", status: "verified" }] },
          })),
        },
      },
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => maybeSingleFor(table)),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    },
  };
});

function Probe({ onValue }: { onValue: (value: ReturnType<typeof useAuth>) => void }) {
  const value = useAuth();
  useEffect(() => onValue(value), [onValue, value]);
  return null;
}

function renderAuth() {
  let latest: ReturnType<typeof useAuth> | null = null;
  render(
    <AuthProvider>
      <Probe onValue={(value) => { latest = value; }} />
    </AuthProvider>
  );
  return {
    get auth() {
      if (!latest) throw new Error("Auth context not ready");
      return latest;
    },
  };
}

describe("AuthProvider MFA state", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    currentSession = null;
    trustedDevice = false;
    mockRole = "admin";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ trusted: trustedDevice }),
    })));
  });

  it("skips MFA on a trusted browser, for admins too, and presents the stored token", async () => {
    trustedDevice = true;
    localStorage.setItem("shoplane.device-trust.user-1", "device-token-1");
    const view = renderAuth();
    await waitFor(() => expect(view.auth.loading).toBe(false));

    let result: Awaited<ReturnType<typeof view.auth.signIn>>;
    await act(async () => {
      result = await view.auth.signIn("admin@example.com", "password");
    });

    expect(result!).toEqual({ role: "admin", needsMfa: false });
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Device-Token"]).toBe("device-token-1");
    await waitFor(() => expect(view.auth.needsMfaVerification).toBe(false));
    expect(view.auth.pendingMfaFactorId).toBeNull();
    expect(view.auth.pendingMfaRole).toBeNull();
  });

  it("stores pending MFA state when the device is not trusted", async () => {
    trustedDevice = false;
    const view = renderAuth();
    await waitFor(() => expect(view.auth.loading).toBe(false));

    let result: Awaited<ReturnType<typeof view.auth.signIn>>;
    await act(async () => {
      result = await view.auth.signIn("admin@example.com", "password");
    });

    expect(result!).toEqual({ role: "admin", needsMfa: true, factorId: "factor-1" });
    await waitFor(() => expect(view.auth.needsMfaVerification).toBe(true));
    expect(view.auth.pendingMfaFactorId).toBe("factor-1");
    expect(view.auth.pendingMfaRole).toBe("admin");
  });

  it("clears pending MFA state after verification succeeds", async () => {
    trustedDevice = false;
    const view = renderAuth();
    await waitFor(() => expect(view.auth.loading).toBe(false));

    await act(async () => {
      await view.auth.signIn("admin@example.com", "password");
    });
    await waitFor(() => expect(view.auth.needsMfaVerification).toBe(true));

    act(() => {
      view.auth.clearMfaFlag();
    });

    expect(view.auth.needsMfaVerification).toBe(false);
    expect(view.auth.pendingMfaFactorId).toBeNull();
    expect(view.auth.pendingMfaRole).toBeNull();
  });
});

describe("AuthProvider sessions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    currentSession = null;
    trustedDevice = true;
    mockRole = "staff";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ trusted: trustedDevice }) })));
  });

  async function signedIn() {
    const view = renderAuth();
    await waitFor(() => expect(view.auth.loading).toBe(false));
    await act(async () => {
      await view.auth.signIn("staff@example.com", "password");
    });
    return view;
  }

  it("signs out only this browser, not every device", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const view = await signedIn();
    await act(async () => {
      await view.auth.signOut();
    });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("signs out after 30 minutes with no activity in any tab", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    await signedIn();
    const later = Date.now() + 31 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" }), { timeout: 3000 });
  });

  it("stays signed in while another tab is in use", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase.auth.signOut).mockClear();
    await signedIn();
    const later = Date.now() + 31 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    localStorage.setItem("shoplane.last-activity", String(later - 60_000));
    await new Promise((r) => setTimeout(r, 1500));
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("takes a refreshed token without re-running the sign-in checks", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const view = await signedIn();
    const calls = vi.mocked(supabase.rpc).mock.calls.length;
    await act(async () => {
      authCallback?.("TOKEN_REFRESHED", { ...mockSession, access_token: "refreshed-token" });
    });
    expect(view.auth.loading).toBe(false);
    expect(view.auth.session?.access_token).toBe("refreshed-token");
    expect(vi.mocked(supabase.rpc).mock.calls.length).toBe(calls);
  });
});
