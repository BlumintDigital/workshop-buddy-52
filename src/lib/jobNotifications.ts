// Tells the client (and the assigned technician, if someone else made the
// change) when a job's status changes. Used by the job page, staff "My day"
// and the Kanban board so every way of moving a job notifies the same people.

import { supabase } from "@/integrations/supabase/client";
import { sendNotifications } from "@/lib/notifications";
import { sendEmail, jobStatusEmailHtml, quoteReadyEmailHtml } from "@/lib/email";

export type NotifiableJob = {
  id: string;
  title: string;
  client_id?: string | null;
  assigned_staff_id?: string | null;
};

/** In-app notifications for the job's client and assignee (never the person who made the change). */
export function notifyJobParticipants(job: NotifiableJob, message: string, actorId?: string | null) {
  const notifs: { user_id: string; title: string; message: string; link: string }[] = [];
  if (job.client_id) notifs.push({ user_id: job.client_id, title: "Job updated", message, link: `/jobs/${job.id}` });
  if (job.assigned_staff_id && job.assigned_staff_id !== actorId) {
    notifs.push({ user_id: job.assigned_staff_id, title: "Job updated", message, link: `/jobs/${job.id}` });
  }
  if (notifs.length > 0) sendNotifications(notifs);
}

/**
 * Notifies the client (in-app and by email) and the assignee about a status change.
 * Fetches the job's client and assignee when the caller doesn't have them.
 * Failures are swallowed: a missed notification must never undo the status change.
 */
export async function notifyJobStatusChange(job: NotifiableJob, status: string, actorId?: string | null) {
  let target = job;
  if (job.client_id === undefined || job.assigned_staff_id === undefined) {
    const { data } = await supabase
      .from("jobs")
      .select("client_id, assigned_staff_id")
      .eq("id", job.id)
      .maybeSingle();
    target = { ...job, client_id: data?.client_id ?? null, assigned_staff_id: data?.assigned_staff_id ?? null };
  }

  notifyJobParticipants(target, `${target.title} is now ${status.replace(/_/g, " ")}`, actorId);

  if (target.client_id) {
    const link = `${window.location.origin}/jobs/${target.id}`;
    sendEmail({
      to_user_id: target.client_id,
      subject: status === "quote" ? `Quote ready: ${target.title}` : `Job update: ${target.title}`,
      html: status === "quote" ? quoteReadyEmailHtml(target.title, link) : jobStatusEmailHtml(target.title, status, link),
    }).catch(() => {});
  }
}
