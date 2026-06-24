import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { User, ShieldCheck, ShieldOff, Copy, Loader2, KeyRound, RefreshCw } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import BackupCodesDialog from "@/components/mfa/BackupCodesDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCountdown } from "@/hooks/useCountdown";
import PushNotificationsCard from "@/components/profile/PushNotificationsCard";

export default function UserProfile() {
  const { user, profile, role, refreshMfaStatus } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // MFA state
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);

  // Backup codes
  const [backupCodesRemaining, setBackupCodesRemaining] = useState<number | null>(null);
  const [backupTotal, setBackupTotal] = useState<number>(0);
  const [generatingBackup, setGeneratingBackup] = useState(false);
  const [shownCodes, setShownCodes] = useState<string[] | null>(null);
  const [trustedDeviceCount, setTrustedDeviceCount] = useState(0);
  const [revoking, setRevoking] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const [regenerateCooldownSec, setRegenerateCooldownSec] = useState<number | null>(null);
  const regenerateCooldown = useCountdown(regenerateCooldownSec);

  const loadBackupAndDeviceCounts = async () => {
    if (!user) return;
    const [{ data: codes }, { data: devs }] = await Promise.all([
      supabase.from("mfa_backup_codes").select("id, used_at").eq("user_id", user.id),
      supabase.from("mfa_trusted_devices").select("id, expires_at").eq("user_id", user.id),
    ]);
    if (codes) {
      setBackupTotal(codes.length);
      setBackupCodesRemaining(codes.filter((c: any) => !c.used_at).length);
    }
    if (devs) {
      const active = devs.filter((d: any) => new Date(d.expires_at).getTime() > Date.now());
      setTrustedDeviceCount(active.length);
    }
  };

  useEffect(() => { void loadBackupAndDeviceCounts(); }, [user, mfaEnabled]);

  const handleGenerateBackupCodes = async () => {
    setGeneratingBackup(true);
    try {
      const { data, error } = await supabase.functions.invoke("mfa-backup-generate");
      const payload = (data ?? (error as any)?.context?.body) || {};
      let parsed: any = payload;
      if (typeof payload === "string") {
        try { parsed = JSON.parse(payload); } catch { parsed = { error: payload }; }
      }

      if (typeof parsed?.retry_after_sec === "number" && parsed.retry_after_sec > 0) {
        setRegenerateCooldownSec(parsed.retry_after_sec);
        toast.error(parsed.error || "Please wait before regenerating again.");
        return;
      }
      if (error || parsed?.error) {
        toast.error(parsed?.error || error?.message || "Failed to generate backup codes");
        return;
      }
      if (!parsed?.codes) throw new Error("No codes returned");
      setShownCodes(parsed.codes);
      await loadBackupAndDeviceCounts();
      toast.success("Backup codes generated");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate backup codes");
    } finally {
      setGeneratingBackup(false);
    }
  };

  const handleRevokeDevices = async () => {
    if (!user) return;
    setRevoking(true);
    try {
      const { error } = await supabase.from("mfa_trusted_devices").delete().eq("user_id", user.id);
      if (error) {
        toast.error(error.message || "Failed to revoke trusted devices");
        return;
      }
      localStorage.removeItem("mfa_device_token");
      setTrustedDeviceCount(0);
      toast.success("All trusted devices have been revoked");
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke trusted devices");
    } finally {
      setRevoking(false);
    }
  };

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
    }
    if (user) {
      supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle().then(({ data }) => {
        if (data) setPhone((data as any).phone || "");
      });
    }
  }, [profile, user]);

  // Load MFA status
  useEffect(() => {
    const loadMfaStatus = async () => {
      setMfaLoading(true);
      const { data } = await supabase.auth.mfa.listFactors();
      const verifiedTotp = data?.totp?.find((f) => f.status === "verified");
      if (verifiedTotp) {
        setMfaEnabled(true);
        setFactorId(verifiedTotp.id);
      } else {
        setMfaEnabled(false);
        setFactorId(null);
      }
      setMfaLoading(false);
    };
    loadMfaStatus();
  }, []);

  const initials = (fullName || "U").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: fullName || null,
      phone: phone || null,
    } as any).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated");
  };

  const handleEnroll2FA = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to start 2FA enrollment");
    } finally {
      setEnrolling(false);
    }
  };

  const handleVerifyEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || verifyCode.length !== 6) return;
    setVerifying(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verifyCode,
      });
      if (verifyError) throw verifyError;

      setMfaEnabled(true);
      setQrCode(null);
      setSecret(null);
      setVerifyCode("");
      await refreshMfaStatus();
      toast.success("Two-factor authentication enabled");
    } catch (err: any) {
      toast.error(err.message || "Invalid verification code");
      setVerifyCode("");
    } finally {
      setVerifying(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!factorId) return;
    setUnenrolling(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      // Clean up backup codes and trusted devices when MFA is removed
      if (user) {
        await Promise.all([
          supabase.from("mfa_backup_codes").delete().eq("user_id", user.id),
          supabase.from("mfa_trusted_devices").delete().eq("user_id", user.id),
        ]);
      }
      localStorage.removeItem("mfa_device_token");
      setMfaEnabled(false);
      setFactorId(null);
      setBackupTotal(0);
      setBackupCodesRemaining(0);
      setTrustedDeviceCount(0);
      await refreshMfaStatus();
      toast.success("Two-factor authentication disabled");
    } catch (err: any) {
      toast.error(err.message || "Failed to disable 2FA");
    } finally {
      setUnenrolling(false);
    }
  };

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      toast.success("Secret copied to clipboard");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-lg">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Profile</h2>
          <p className="text-muted-foreground">Manage your account information</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg bg-primary text-primary-foreground">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <CardTitle>{fullName || "User"}</CardTitle>
                <CardDescription className="capitalize">{role} · {user?.email}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="profile-name">Full Name</Label>
              <Input id="profile-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="profile-email">Email</Label>
              <Input id="profile-email" value={user?.email || ""} disabled className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Email cannot be changed here</p>
            </div>
            <div>
              <Label htmlFor="profile-phone">Phone</Label>
              <Input id="profile-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 0123" className="mt-1" />
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Two-Factor Authentication Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Two-Factor Authentication</CardTitle>
            </div>
            <CardDescription>
              Add an extra layer of security to your account using an authenticator app
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mfaLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading 2FA status...
              </div>
            ) : mfaEnabled ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-primary">
                  <ShieldCheck className="h-4 w-4" />
                  Two-factor authentication is enabled
                </div>

                {/* Backup codes */}
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Backup codes</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use these one-time codes to sign in if you lose your authenticator.
                  </p>
                  {backupTotal > 0 ? (
                    <p className="text-xs">
                      <span className="font-medium">{backupCodesRemaining ?? 0}</span> of {backupTotal} codes remaining
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No backup codes generated yet.</p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (regenerateCooldown.remaining > 0) {
                        toast.error(`You can regenerate codes again in ${regenerateCooldown.formatted}.`);
                        return;
                      }
                      if (backupTotal > 0) {
                        setConfirmRegenerate(true);
                      } else {
                        void handleGenerateBackupCodes();
                      }
                    }}
                    disabled={generatingBackup || regenerateCooldown.remaining > 0}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    {generatingBackup
                      ? "Generating..."
                      : regenerateCooldown.remaining > 0
                        ? `Try again in ${regenerateCooldown.formatted}`
                        : backupTotal > 0 ? "Regenerate codes" : "Generate backup codes"}
                  </Button>
                </div>

                {/* Trusted devices */}
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Trusted devices</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {trustedDeviceCount > 0
                      ? `${trustedDeviceCount} device${trustedDeviceCount === 1 ? "" : "s"} can skip the 2FA prompt for 30 days.`
                      : "No trusted devices."}
                  </p>
                  {trustedDeviceCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmRevokeAll(true)}
                      disabled={revoking}
                    >
                      {revoking ? "Revoking..." : "Revoke all trusted devices"}
                    </Button>
                  )}
                </div>

                <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Regenerate backup codes?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This invalidates your existing {backupTotal} backup code{backupTotal === 1 ? "" : "s"}.
                        Make sure to save the new codes — you won't be able to see them again.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          setConfirmRegenerate(false);
                          void handleGenerateBackupCodes();
                        }}
                      >
                        Regenerate
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog open={confirmRevokeAll} onOpenChange={setConfirmRevokeAll}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revoke all trusted devices?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You'll need to enter a 2FA code on each device next time you sign in.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          setConfirmRevokeAll(false);
                          void handleRevokeDevices();
                        }}
                      >
                        Revoke all
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>


                <Button variant="destructive" size="sm" onClick={handleDisable2FA} disabled={unenrolling}>
                  <ShieldOff className="h-4 w-4 mr-1" />
                  {unenrolling ? "Disabling..." : "Disable 2FA"}
                </Button>
              </div>
            ) : qrCode ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </p>
                <div className="flex justify-center">
                  <img src={qrCode} alt="2FA QR Code" className="rounded-lg border p-2" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Or enter this secret manually:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-2 py-1 text-xs font-mono break-all">{secret}</code>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={copySecret}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <form onSubmit={handleVerifyEnrollment} className="space-y-3">
                  <Label>Enter the 6-digit code from your app</Label>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={verifyCode} onChange={setVerifyCode}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={verifying || verifyCode.length !== 6}>
                      {verifying ? "Verifying..." : "Verify & Enable"}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => { setQrCode(null); setSecret(null); setVerifyCode(""); }}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            ) : (
              <Button onClick={handleEnroll2FA} disabled={enrolling}>
                <ShieldCheck className="h-4 w-4 mr-1" />
                {enrolling ? "Setting up..." : "Enable 2FA"}
              </Button>
            )}
          </CardContent>
        </Card>

        <PushNotificationsCard />
      </div>


      <BackupCodesDialog
        open={!!shownCodes}
        codes={shownCodes ?? []}
        onClose={() => setShownCodes(null)}
      />
    </DashboardLayout>
  );
}
