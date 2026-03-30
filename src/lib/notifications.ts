import { supabase } from "@/integrations/supabase/client";

interface NotificationPayload {
  user_id: string;
  title: string;
  message: string;
  link?: string;
}

/**
 * Insert a single in-app notification. Fails silently — notifications are
 * non-critical and should never block the caller.
 */
export async function sendNotification(payload: NotificationPayload): Promise<void> {
  await supabase.from("notifications").insert({ ...payload, read: false }).then(() => {});
}

/**
 * Insert multiple notifications in one round-trip.
 */
export async function sendNotifications(payloads: NotificationPayload[]): Promise<void> {
  if (payloads.length === 0) return;
  await supabase
    .from("notifications")
    .insert(payloads.map((p) => ({ ...p, read: false })))
    .then(() => {});
}

/**
 * Notify all users who hold a given role.
 */
export async function notifyRole(
  role: "admin" | "manager" | "staff" | "client",
  title: string,
  message: string,
  link?: string,
): Promise<void> {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", role);
  if (!roles || roles.length === 0) return;
  await sendNotifications(roles.map((r) => ({ user_id: r.user_id, title, message, link })));
}
