import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { User, ShieldCheck, ShieldOff, Copy, Loader2, KeyRound, RefreshCw, Upload, BadgeCheck, CalendarDays, Mail, Smartphone, Lightbulb, Lock, Eye, EyeOff } from "lucide-react";
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
  const { user, profile, role, refreshMfaStatus, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [address, setAddress] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  // Password change
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

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
      setAvatarUrl(profile.avatar_url ?? null);
    }
    if (user) {
      supabase
        .from("profiles")
        .select("phone, company_name, contact_person, address")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setPhone((data as any).phone || "");
            setCompanyName((data as any).company_name || "");
            setContactPerson((data as any).contact_person || "");
            setAddress((data as any).address || "");
          }
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const { validateAvatarFile, processAvatarFile, AVATAR_OUTPUT_TYPE, AVATAR_OUTPUT_EXT } =
      await import("@/lib/avatar");

    const validation = validateAvatarFile(file);
    if (validation) {
      toast.error(validation.message);
      e.target.value = "";
      return;
    }

    setUploadingAvatar(true);
    try {
      const blob = await processAvatarFile(file);
      const path = `${user.id}/avatar.${AVATAR_OUTPUT_EXT}`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: AVATAR_OUTPUT_TYPE, cacheControl: "3600" });
      if (uploadErr) {
        toast.error(uploadErr.message);
        return;
      }
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust so the new image renders immediately.
      const newUrl = `${urlData.publicUrl}?v=${Date.now()}`;
      await supabase.from("profiles").update({ avatar_url: newUrl } as any).eq("id", user.id);
      setAvatarUrl(newUrl);
      await refreshProfile();
      toast.success("Avatar updated");
    } catch (err: any) {
      toast.error(err?.message || "Could not process image");
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: fullName || null,
      phone: phone || null,
      company_name: companyName || null,
      contact_person: contactPerson || null,
      address: address || null,
      avatar_url: avatarUrl,
    } as any).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await refreshProfile();
    toast.success("Profile updated");
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    if (!user?.email) return;
    if (newPwd.length < 8) {
      setPwdError("New password must be at least 8 characters.");
      return;
    }
    if (!/[A-Z]/.test(newPwd) || !/[a-z]/.test(newPwd) || !/[0-9]/.test(newPwd)) {
      setPwdError("Use a mix of uppercase, lowercase, and numbers.");
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError("New password and confirmation do not match.");
      return;
    }
    if (newPwd === currentPwd) {
      setPwdError("New password must be different from the current one.");
      return;
    }
    setPwdSaving(true);
    try {
      // Verify current password by re-authenticating.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPwd,
      });
      if (signInErr) {
        setPwdError("Current password is incorrect.");
        return;
      }
      const { error: updErr } = await supabase.auth.updateUser({ password: newPwd });
      if (updErr) {
        setPwdError(updErr.message);
        return;
      }
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      toast.success("Password updated");
    } catch (err: any) {
      setPwdError(err?.message || "Could not change password");
    } finally {
      setPwdSaving(false);
    }
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

  const joinedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;
  const lastSignIn = (user as any)?.last_sign_in_at
    ? new Date((user as any).last_sign_in_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <DashboardLayout>
      <div className="max-w-6xl space-y-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Profile</h2>
          <p className="text-muted-foreground">Manage your account information</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="space-y-6 lg:col-span-2 min-w-0">

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div
                className="relative group cursor-pointer shrink-0"
                onClick={() => avatarInputRef.current?.click()}
                title="Click to change avatar"
              >
                <Avatar className="h-16 w-16">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
                  <AvatarFallback className="text-lg bg-primary text-primary-foreground">{initials}</AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploadingAvatar
                    ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                    : <Upload className="h-5 w-5 text-white" />}
                </div>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <div>
                <CardTitle>{fullName || "User"}</CardTitle>
                <CardDescription className="capitalize">{role} · {user?.email}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div>
                <Label htmlFor="profile-contact">Contact Person</Label>
                <Input id="profile-contact" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Primary contact name" className="mt-1" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="profile-company">Company / Organization</Label>
                <Input id="profile-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Optional" className="mt-1" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="profile-address">Address</Label>
                <Input id="profile-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, City, Country" className="mt-1" />
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Security — Change Password */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Security</CardTitle>
            </div>
            <CardDescription>Change your password. Use at least 8 characters with upper, lower, and a number.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label htmlFor="pwd-current">Current Password</Label>
                  <div className="relative mt-1">
                    <Input
                      id="pwd-current"
                      type={showPwd ? "text" : "password"}
                      value={currentPwd}
                      onChange={(e) => setCurrentPwd(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPwd ? "Hide passwords" : "Show passwords"}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="pwd-new">New Password</Label>
                  <Input
                    id="pwd-new"
                    type={showPwd ? "text" : "password"}
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    autoComplete="new-password"
                    className="mt-1"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="pwd-confirm">Confirm New Password</Label>
                  <Input
                    id="pwd-confirm"
                    type={showPwd ? "text" : "password"}
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    autoComplete="new-password"
                    className={`mt-1 ${confirmPwd && confirmPwd !== newPwd ? "border-destructive" : ""}`}
                    required
                  />
                </div>
              </div>
              {pwdError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <ShieldOff className="h-3.5 w-3.5" /> {pwdError}
                </p>
              )}
              <Button type="submit" disabled={pwdSaving || !currentPwd || !newPwd || !confirmPwd}>
                {pwdSaving ? "Updating..." : "Update Password"}
              </Button>
            </form>
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

          {/* Sidebar */}
          <aside className="space-y-6 lg:sticky lg:top-6">
            <Card tone="mist">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Account</CardTitle>
                </div>
                <CardDescription>At a glance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <User className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Role</p>
                    <p className="capitalize font-medium">{role || "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Mail className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium break-all">{user?.email}</p>
                  </div>
                </div>
                {joinedDate && (
                  <div className="flex items-start gap-2">
                    <CalendarDays className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Member since</p>
                      <p className="font-medium">{joinedDate}</p>
                    </div>
                  </div>
                )}
                {lastSignIn && (
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Last sign-in</p>
                      <p className="font-medium">{lastSignIn}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card tone="sky">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Security status</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Two-factor auth</span>
                  <span className={`font-medium ${mfaEnabled ? "text-primary" : "text-destructive"}`}>
                    {mfaLoading ? "—" : mfaEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Backup codes</span>
                  <span className="font-medium">{backupTotal > 0 ? `${backupCodesRemaining ?? 0} / ${backupTotal}` : "None"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" /> Trusted devices</span>
                  <span className="font-medium">{trustedDeviceCount}</span>
                </div>
              </CardContent>
            </Card>

            <Card tone="butter">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Tips</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>• Use a square JPG or PNG under 5 MB for the cleanest avatar.</p>
                <p>• Save your backup codes in a password manager.</p>
                <p>• Revoke trusted devices when you lose access to one.</p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>



      <BackupCodesDialog
        open={!!shownCodes}
        codes={shownCodes ?? []}
        onClose={() => setShownCodes(null)}
      />
    </DashboardLayout>
  );
}
