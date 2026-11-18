import { supabase } from "@/integrations/supabase/client";
import type { AttachmentKind } from "@/components/project/ProjectFiles";

export const ATTACHMENTS_BUCKET = "job-attachments";

/** Stores one file on a project the way the Files panels list it. Returns an error message, or null. */
export async function uploadProjectFile(jobId: string, kind: AttachmentKind, file: File, userId: string): Promise<string | null> {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${jobId}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: upErr } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file);
  if (upErr) return upErr.message;
  const { error } = await supabase.from("job_attachments").insert({
    job_id: jobId,
    task_id: null,
    uploaded_by: userId,
    file_name: file.name,
    file_path: path,
    file_type: file.type || "application/octet-stream",
    file_size: file.size,
    kind,
  });
  if (error) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path]);
    return error.message;
  }
  return null;
}
