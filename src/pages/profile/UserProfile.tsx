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
import { User } from "lucide-react";

export default function UserProfile() {
  const { user, profile, role } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

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
      </div>
    </DashboardLayout>
  );
}
