import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type AppRole = "admin" | "manager" | "staff" | "client";

export const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  profile: { full_name: string; avatar_url: string | null } | null;
  loading: boolean;
  needsMfaVerification: boolean;
  mfaEnabled: boolean;
  sessionTimeLeft: number;
  signIn: (email: string, password: string) => Promise<{ role: AppRole | null; needsMfa: boolean; factorId?: string }>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearMfaFlag: () => void;
  extendSession: () => void;
  refreshMfaStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsMfaVerification, setNeedsMfaVerification] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [sessionTimeLeft, setSessionTimeLeft] = useState(SESSION_TIMEOUT_MS);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionDeadline = useRef<number>(Date.now() + SESSION_TIMEOUT_MS);

  const performSignOut = useCallback(async (reason?: string) => {
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
      inactivityTimer.current = null;
    }
    await supabase.auth.signOut();
    setRole(null);
    setProfile(null);
    setNeedsMfaVerification(false);
    setMfaEnabled(false);
    if (reason) {
      toast.info(reason);
    }
  }, []);

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

  // Start 30-minute session timer on login. Only extendSession() (explicit user action) resets it.
  useEffect(() => {
    if (!user) return;
    resetInactivityTimer();
    return () => {
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

  const checkMfaStatus = async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data && data.currentLevel === "aal1" && data.nextLevel === "aal2") {
      setNeedsMfaVerification(true);
      return true;
    }
    setNeedsMfaVerification(false);
    return false;
  };

  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handleSession = (session: Session | null) => {
      if (session?.user) {
        // Check JWT expiry
        if (session.expires_at && session.expires_at * 1000 < Date.now()) {
          performSignOut("Session expired. Please sign in again.");
          return;
        }

        // Same user already loaded — skip entirely to avoid re-triggering useEffects (timer, etc.)
        if (currentUserIdRef.current === session.user.id) {
          return;
        }

        // New user login or initial load
        currentUserIdRef.current = session.user.id;
        setSession(session);
        setUser(session.user);
        setLoading(true);
        Promise.all([fetchUserData(session.user.id), checkMfaStatus()]).finally(() =>
          setLoading(false)
        );
      } else {
        currentUserIdRef.current = null;
        setSession(null);
        setUser(null);
        setRole(null);
        setProfile(null);
        setNeedsMfaVerification(false);
        setMfaEnabled(false);
        setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => handleSession(session));

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    setSession(data.session ?? null);
    setUser(data.user ?? null);

    if (!data.user) return { role: null, needsMfa: false };

    const nextRole = await fetchUserData(data.user.id);

    // Check if MFA is required
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData && aalData.currentLevel === "aal1" && aalData.nextLevel === "aal2") {
      setNeedsMfaVerification(true);
      // Get the TOTP factor ID
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const totpFactor = factorsData?.totp?.find((f) => f.status === "verified");
      return { role: nextRole, needsMfa: true, factorId: totpFactor?.id };
    }

    setNeedsMfaVerification(false);
    return { role: nextRole, needsMfa: false };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await performSignOut();
  };

  const clearMfaFlag = () => setNeedsMfaVerification(false);

  return (
    <AuthContext.Provider value={{ session, user, role, profile, loading, needsMfaVerification, mfaEnabled, sessionTimeLeft, signIn, signUp, signOut, clearMfaFlag, extendSession, refreshMfaStatus }}>
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
