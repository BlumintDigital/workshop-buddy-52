import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AppRole = "admin" | "manager" | "staff" | "client";

export const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  profile: { full_name: string; avatar_url: string | null } | null;
  loading: boolean;
  needsMfaVerification: boolean;
  pendingMfaFactorId: string | null;
  pendingMfaRole: AppRole | null;
  mfaEnabled: boolean;
  sessionTimeLeft: number;
  signIn: (email: string, password: string) => Promise<{ role: AppRole | null; needsMfa: boolean; factorId?: string }>;
  signUp: (email: string, password: string, fullName: string, role?: AppRole) => Promise<void>;
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
  const [profile, setProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsMfaVerification, setNeedsMfaVerification] = useState(false);
  const [pendingMfaFactorId, setPendingMfaFactorId] = useState<string | null>(null);
  const [pendingMfaRole, setPendingMfaRole] = useState<AppRole | null>(null);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [sessionTimeLeft, setSessionTimeLeft] = useState(SESSION_TIMEOUT_MS);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionDeadline = useRef<number>(Date.now() + SESSION_TIMEOUT_MS);
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
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
      inactivityTimer.current = null;
    }
    await supabase.auth.signOut();
    // Keep the trusted-device token: the whole point is to skip MFA next time on this device.
    setRole(null);
    setProfile(null);
    clearPendingMfa();
    setMfaEnabled(false);
    if (reason) {
      toast.info(reason);
    }
  }, [clearPendingMfa]);

  // Inactivity timer
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
    }
    sessionDeadline.current = Date.now() + SESSION_TIMEOUT_MS;
    setSessionTimeLeft(SESSION_TIMEOUT_MS);
    inactivityTimer.current = setTimeout(() => {
      performSignOut("Session expired due to inactivity");
    }, SESSION_TIMEOUT_MS);
  }, [performSignOut]);

  const extendSession = useCallback(() => {
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  // Countdown interval
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      setSessionTimeLeft(Math.max(0, sessionDeadline.current - Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [user]);

  // Reset inactivity timer on user activity (debounced to avoid excessive calls)
  useEffect(() => {
    if (!user) return;
    resetInactivityTimer();

    let debounceHandle: ReturnType<typeof setTimeout> | null = null;
    const handleActivity = () => {
      if (debounceHandle) clearTimeout(debounceHandle);
      debounceHandle = setTimeout(() => resetInactivityTimer(), 500);
    };

    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity, { passive: true });
    window.addEventListener("pointerdown", handleActivity, { passive: true });
    window.addEventListener("scroll", handleActivity, { passive: true });

    return () => {
      if (debounceHandle) clearTimeout(debounceHandle);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
        inactivityTimer.current = null;
      }
    };
  }, [user, resetInactivityTimer]);

  const refreshMfaStatus = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setMfaEnabled(!!(data?.totp?.find((f) => f.status === "verified")));
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    setProfile(data ?? null);
  }, [user]);

  const fetchUserData = async (userId: string): Promise<AppRole | null> => {
    const [roleRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("full_name, avatar_url").eq("id", userId).maybeSingle(),
    ]);

    const nextRole = (roleRes.data?.role as AppRole | undefined) ?? null;
    setRole(nextRole);
    setProfile(profileRes.data ?? null);

    // Check if user has 2FA enrolled
    const { data: mfaData } = await supabase.auth.mfa.listFactors();
    setMfaEnabled(!!(mfaData?.totp?.find((f) => f.status === "verified")));

    return nextRole;
  };

  const checkMfaStatus = async (nextRole: AppRole | null) => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data && data.currentLevel === "aal1" && data.nextLevel === "aal2") {
      // Device trust bypass only applies to staff/client roles. Admin and manager must
      // complete TOTP every session so the JWT reaches aal2 — required by the server-side
      // RLS restrictive policies on user_roles and profiles.
      const isElevatedRole = nextRole === "admin" || nextRole === "manager";
      try {
        const trusted = await checkTrustedDevice();
        if (trusted && !isElevatedRole) {
          clearPendingMfa();
          return false;
        }
      } catch { /* ignore */ }
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

  useEffect(() => {
    const handleSession = (session: Session | null) => {
      if (session?.user) {
        // Check JWT expiry
        if (session.expires_at && session.expires_at * 1000 < Date.now()) {
          performSignOut("Session expired. Please sign in again.");
          return;
        }

        const sameUser = currentUserIdRef.current === session.user.id;
        const sameToken = currentAccessTokenRef.current === session.access_token;

        // Same fully-reconciled session — skip to avoid re-triggering timers and data fetches.
        if (sameUser && sameToken && !needsMfaVerificationRef.current) {
          return;
        }

        // New user login or initial load
        currentUserIdRef.current = session.user.id;
        currentAccessTokenRef.current = session.access_token;
        setSession(session);
        setUser(session.user);
        setLoading(true);
        fetchUserData(session.user.id)
          .then((nextRole) => checkMfaStatus(nextRole))
          .finally(() => setLoading(false));
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => handleSession(session));

    return () => subscription.unsubscribe();
  // Auth subscriptions should be registered once; mutable refs keep session reconciliation current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkTrustedDevice = async (): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return false;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mfa-check-device`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Authorization": `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );
      if (!res.ok) return false;
      const data = await res.json();
      return !!data?.trusted;
    } catch {
      return false;
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    setSession(data.session ?? null);
    setUser(data.user ?? null);
    currentUserIdRef.current = data.user?.id ?? null;
    currentAccessTokenRef.current = data.session?.access_token ?? null;

    if (!data.user) {
      clearPendingMfa();
      return { role: null, needsMfa: false };
    }

    const nextRole = await fetchUserData(data.user.id);

    // Check if MFA is required
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData && aalData.currentLevel === "aal1" && aalData.nextLevel === "aal2") {
      // Device trust bypass only applies to staff/client roles (same gate as checkMfaStatus).
      const isElevatedRole = nextRole === "admin" || nextRole === "manager";
      const trusted = await checkTrustedDevice();
      if (trusted && !isElevatedRole) {
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
  };

  const signUp = async (email: string, password: string, fullName: string, role: AppRole = "client", companyName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role, company_name: companyName ?? null }, emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await performSignOut();
  };

  const clearMfaFlag = () => clearPendingMfa();

  return (
    <AuthContext.Provider value={{ session, user, role, profile, loading, needsMfaVerification, pendingMfaFactorId, pendingMfaRole, mfaEnabled, sessionTimeLeft, signIn, signUp, signOut, clearMfaFlag, extendSession, refreshMfaStatus, refreshProfile }}>
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
