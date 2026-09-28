import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { checkTrustedDevice } from "@/lib/deviceTrust";

export type AppRole = "admin" | "manager" | "staff" | "client";

export const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Last activity in any tab of this browser. Tabs share one sign-in, so they
// share one idle clock: working in one tab keeps the others signed in too.
const ACTIVITY_KEY = "shoplane.last-activity";
const readActivity = (): number => {
  try {
    return Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
};
const writeActivity = (at: number) => {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch { /* storage unavailable: this tab keeps its own clock */ }
};

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  profile: { full_name: string | null; avatar_url: string | null; company_name: string | null; phone: string | null; address: string | null } | null;
  loading: boolean;
  /** True while we're still working out whether this session requires MFA — don't route yet. */
  mfaCheckPending: boolean;
  needsMfaVerification: boolean;
  pendingMfaFactorId: string | null;
  pendingMfaRole: AppRole | null;
  mfaEnabled: boolean;
  sessionTimeLeft: number;
  signIn: (email: string, password: string) => Promise<{ role: AppRole | null; needsMfa: boolean; factorId?: string }>;
  signUp: (email: string, password: string, fullName: string, role?: AppRole, companyName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearMfaFlag: () => void;
  extendSession: () => void;
  refreshMfaStatus: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null; company_name: string | null; phone: string | null; address: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaCheckPending, setMfaCheckPending] = useState(false);
  const [needsMfaVerification, setNeedsMfaVerification] = useState(false);
  const [pendingMfaFactorId, setPendingMfaFactorId] = useState<string | null>(null);
  const [pendingMfaRole, setPendingMfaRole] = useState<AppRole | null>(null);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [sessionTimeLeft, setSessionTimeLeft] = useState(SESSION_TIMEOUT_MS);
  const needsMfaVerificationRef = useRef(false);

  const clearPendingMfa = useCallback(() => {
    needsMfaVerificationRef.current = false;
    setNeedsMfaVerification(false);
    setPendingMfaFactorId(null);
    setPendingMfaRole(null);
  }, []);

  const markPendingMfa = useCallback((nextRole: AppRole | null, factorId?: string) => {
    needsMfaVerificationRef.current = true;
    setNeedsMfaVerification(true);
    setPendingMfaRole(nextRole);
    setPendingMfaFactorId(factorId ?? null);
  }, []);

  const performSignOut = useCallback(async (reason?: string) => {
    // Sign out this browser only. The default ends every session the user
    // has, so one idle tab or laptop used to sign them out everywhere.
    await supabase.auth.signOut({ scope: "local" });
    // Keep the trusted-device token: the whole point is to skip MFA next time on this device.
    setRole(null);
    setProfile(null);
    clearPendingMfa();
    setMfaEnabled(false);
    if (reason) {
      toast.info(reason);
    }
  }, [clearPendingMfa]);

  const lastActivity = useRef<number>(Date.now());
  const markActivity = useCallback((force = false) => {
    const now = Date.now();
    // Storage writes are throttled; the idle clock only needs seconds.
    if (force || now - lastActivity.current > 5000) writeActivity(now);
    lastActivity.current = now;
  }, []);

  const extendSession = useCallback(() => {
    markActivity(true);
    setSessionTimeLeft(SESSION_TIMEOUT_MS);
  }, [markActivity]);

  // Idle sign-out after 30 minutes without activity in any tab. Checked once a
  // second against the shared clock rather than with a long timer, so it also
  // holds after the computer sleeps.
  useEffect(() => {
    if (!user) return;
    const shared = readActivity();
    if (shared > lastActivity.current) lastActivity.current = shared;

    let signingOut = false;
    const tick = () => {
      const last = Math.max(lastActivity.current, readActivity());
      lastActivity.current = last;
      const left = Math.max(0, last + SESSION_TIMEOUT_MS - Date.now());
      setSessionTimeLeft(left);
      if (left === 0 && !signingOut) {
        signingOut = true;
        void performSignOut("Session expired due to inactivity");
      }
    };
    tick();
    const interval = setInterval(tick, 1000);

    const handleActivity = () => markActivity();
    const events = ["mousemove", "keydown", "pointerdown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));
    return () => {
      clearInterval(interval);
      events.forEach((e) => window.removeEventListener(e, handleActivity));
    };
  }, [user, markActivity, performSignOut]);

  const refreshMfaStatus = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setMfaEnabled(!!(data?.totp?.find((f) => f.status === "verified")));
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    // SECURITY DEFINER RPC so admin/manager users can read their own profile
    // even at AAL1 (pre-MFA), when the restrictive RLS policy on `profiles`
    // would otherwise hide the row.
    const { data } = await supabase.rpc("get_my_basic_profile");
    const row = Array.isArray(data) ? data[0] : data;
    setProfile(row ? { full_name: row.full_name ?? null, avatar_url: row.avatar_url ?? null, company_name: row.company_name ?? null, phone: row.phone ?? null, address: row.address ?? null } : null);
  }, [user]);

  const fetchUserData = async (userId: string): Promise<AppRole | null> => {
    const [roleRes, profileRes, mfaRes] = await Promise.all([
      // Use SECURITY DEFINER RPCs: the restrictive RLS policies on `user_roles`
      // and `profiles` hide admin/manager rows until the session reaches aal2,
      // which hasn't happened yet at this point in the login flow. The RPCs
      // bypass RLS safely and only return the caller's own data.
      supabase.rpc("get_user_role", { _user_id: userId }),
      supabase.rpc("get_my_basic_profile"),
      supabase.auth.mfa.listFactors(),
    ]);

    if (roleRes.error) throw new Error(`Role fetch failed: ${roleRes.error.message}`);
    const nextRole = (roleRes.data as AppRole | null | undefined) ?? null;
    setRole(nextRole);
    const profileRow = Array.isArray(profileRes.data) ? profileRes.data[0] : profileRes.data;
    setProfile(profileRow ? { full_name: profileRow.full_name ?? null, avatar_url: profileRow.avatar_url ?? null, company_name: profileRow.company_name ?? null, phone: profileRow.phone ?? null, address: profileRow.address ?? null } : null);
    setMfaEnabled(!!(mfaRes.data?.totp?.find((f) => f.status === "verified")));

    // Record the sign-in (last_sign_in_at + first-time invite_accepted_at).
    // Must go through the SECURITY DEFINER RPC: direct profile updates are
    // blocked at aal1 for admin/manager by the restrictive MFA write policy.
    void supabase.rpc("touch_profile_login" as any).then(() => {});

    return nextRole;
  };

  const checkMfaStatus = async (nextRole: AppRole | null, session: Session) => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data && data.currentLevel === "aal1" && data.nextLevel === "aal2") {
      // A trusted browser skips the code for every role: the server records
      // this session as vouched for, which the database rules accept.
      if (await checkTrustedDevice(session.access_token, session.user.id)) {
        clearPendingMfa();
        return false;
      }
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const totpFactor = factorsData?.totp?.find((f) => f.status === "verified");
      markPendingMfa(nextRole, totpFactor?.id);
      return true;
    }
    clearPendingMfa();
    return false;
  };

  const currentUserIdRef = useRef<string | null>(null);
  const currentAccessTokenRef = useRef<string | null>(null);
  const isSigningInRef = useRef(false);

  useEffect(() => {
    const handleSession = (session: Session | null) => {
      if (session?.user) {
        // An expired access token is not a reason to sign out: the client
        // refreshes it, and a failed refresh arrives as SIGNED_OUT.

        // signIn() fires onAuthStateChange synchronously before its Promise resolves.
        // Yield to signIn() so only one path runs fetchUserData and MFA checks.
        if (isSigningInRef.current) return;

        const sameUser = currentUserIdRef.current === session.user.id;
        const sameToken = currentAccessTokenRef.current === session.access_token;

        // Same fully-reconciled session — skip to avoid re-triggering timers and data fetches.
        if (sameUser && sameToken && !needsMfaVerificationRef.current) {
          return;
        }
        // Hourly token refresh for a user already signed in: take the new token
        // without re-running the sign-in checks (that blanked the app).
        if (sameUser && !needsMfaVerificationRef.current) {
          currentAccessTokenRef.current = session.access_token;
          setSession(session);
          return;
        }

        // New user login or initial load
        currentUserIdRef.current = session.user.id;
        currentAccessTokenRef.current = session.access_token;
        setSession(session);
        setUser(session.user);
        setLoading(true);
        setMfaCheckPending(true);
        fetchUserData(session.user.id)
          .then((nextRole) => checkMfaStatus(nextRole, session))
          .finally(() => { setMfaCheckPending(false); setLoading(false); });
      } else {
        currentUserIdRef.current = null;
        currentAccessTokenRef.current = null;
        setSession(null);
        setUser(null);
        setRole(null);
        setProfile(null);
        clearPendingMfa();
        setMfaEnabled(false);
        setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Signing in (password, email link or reset link) starts a fresh idle clock.
      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") markActivity(true);
      handleSession(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => handleSession(session));

    return () => subscription.unsubscribe();
  // Auth subscriptions should be registered once; mutable refs keep session reconciliation current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    isSigningInRef.current = true;
    // Role state lands before the MFA requirement is known (the trusted-device
    // check is a network call). Hold routing until the whole check resolves so
    // neither the login form nor the dashboard flashes before the 2FA screen.
    setMfaCheckPending(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // A fresh sign-in starts a fresh idle clock, whatever an old tab left behind.
      markActivity(true);
      setSession(data.session ?? null);
      setUser(data.user ?? null);
      currentUserIdRef.current = data.user?.id ?? null;
      currentAccessTokenRef.current = data.session?.access_token ?? null;

      if (!data.user) {
        clearPendingMfa();
        return { role: null, needsMfa: false };
      }

      // Sign-in time is recorded by touch_profile_login inside fetchUserData —
      // the direct profiles update this used to do was silently blocked at aal1
      // for admin/manager by the restrictive MFA write policy.

      const nextRole = await fetchUserData(data.user.id);

      // Check if MFA is required
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData && aalData.currentLevel === "aal1" && aalData.nextLevel === "aal2") {
        const trusted = data.session ? await checkTrustedDevice(data.session.access_token, data.user.id) : false;
        if (trusted) {
          clearPendingMfa();
          return { role: nextRole, needsMfa: false };
        }

        const { data: factorsData } = await supabase.auth.mfa.listFactors();
        const totpFactor = factorsData?.totp?.find((f) => f.status === "verified");
        markPendingMfa(nextRole, totpFactor?.id);
        return { role: nextRole, needsMfa: true, factorId: totpFactor?.id };
      }

      clearPendingMfa();
      return { role: nextRole, needsMfa: false };
    } finally {
      isSigningInRef.current = false;
      setMfaCheckPending(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string, role: AppRole = "client", companyName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          company_name: companyName ?? null,
          // For client accounts the person signing up is the company contact.
          contact_person: role === "client" ? fullName : null,
        },
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await performSignOut();
  };

  const clearMfaFlag = () => clearPendingMfa();

  return (
    <AuthContext.Provider value={{ session, user, role, profile, loading, mfaCheckPending, needsMfaVerification, pendingMfaFactorId, pendingMfaRole, mfaEnabled, sessionTimeLeft, signIn, signUp, signOut, clearMfaFlag, extendSession, refreshMfaStatus, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}


export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getRoleDashboardPath(role: AppRole | null): string {
  switch (role) {
    case "admin": return "/admin/dashboard";
    case "manager": return "/manager/dashboard";
    case "staff": return "/staff/dashboard";
    case "client": return "/client/dashboard";
    default: return "/auth";
  }
}
