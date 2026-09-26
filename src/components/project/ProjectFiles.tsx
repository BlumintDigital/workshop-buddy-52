import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Download, Eye, EyeOff, FileText, FileUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { cn } from "@/lib/utils";

export type AttachmentKind = "intake" | "work" | "shared" | "handoff" | "delivery" | "client";

type Attachment = {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  kind: AttachmentKind;
  uploaded_by: string;
  created_at: string;
};

interface Props {
  jobId: string;
  title: string;
  description?: string;
  /** Which kinds of file this panel lists. */
  kinds: AttachmentKind[];
  /** Kind given to new uploads; omit to hide the upload button. */
  uploadKind?: AttachmentKind;
  /** Photos only, with the phone camera offered first. */
  photos?: boolean;
  /** Team members can switch work files between internal and shared with the client. */
  canShare?: boolean;
  canDelete?: (a: Attachment) => boolean;
  emptyText: string;
  /** Called after uploads, so the page can refresh counts. */
  onChange?: () => void;
}

const BUCKET = "job-attachments";

export default function ProjectFiles({ jobId, title, description, kinds, uploadKind, photos, canShare, canDelete, emptyText, onChange }: Props) {
  const { user } = useAuth();
  const [files, setFiles] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const kindsKey = kinds.join(",");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("job_attachments")
      .select("id, file_name, file_path, file_type, file_size, kind, uploaded_by, created_at")
      .eq("job_id", jobId)
      .is("task_id", null)
      .in("kind", kindsKey.split(","))
      .order("created_at", { ascending: true });
    const list = (data ?? []) as Attachment[];
    setFiles(list);
    if (list.length) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(list.map((f) => f.file_path), 3600);
      const map: Record<string, string> = {};
      signed?.forEach((s) => {
        if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
      });
      setUrls(map);
    }
  }, [jobId, kindsKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (list: FileList | null) => {
    if (!list?.length || !uploadKind || !user) return;
    setUploading(true);
    let done = 0;
    for (const file of Array.from(list)) {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const path = `${jobId}/${uploadKind}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) {
        toast.error(`${file.name}: ${upErr.message}`);
        continue;
      }
      const { error } = await supabase.from("job_attachments").insert({
        job_id: jobId,
        task_id: null,
        uploaded_by: user.id,
        file_name: file.name,
        file_path: path,
        file_type: file.type || "application/octet-stream",
        file_size: file.size,
        kind: uploadKind,
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        toast.error(`${file.name}: ${error.message}`);
        continue;
      }
      done++;
    }
    setUploading(false);
    if (input.current) input.current.value = "";
    if (done) {
      toast.success(done === 1 ? "File added" : `${done} files added`);
      await load();
      onChange?.();
    }
  };

  const remove = async (a: Attachment) => {
    // Delete the record first: if the database refuses (e.g. a locked intake photo), the file stays.
    const { error } = await supabase.from("job_attachments").delete().eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.storage.from(BUCKET).remove([a.file_path]);
    setFiles((prev) => prev.filter((f) => f.id !== a.id));
    toast.success("File removed");
    onChange?.();
  };

  const toggleShare = async (a: Attachment) => {
    const next: AttachmentKind = a.kind === "shared" ? "work" : "shared";
    const { error } = await supabase.from("job_attachments").update({ kind: next }).eq("id", a.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFiles((prev) => prev.map((f) => (f.id === a.id ? { ...f, kind: next } : f)));
    toast.success(next === "shared" ? "Shared with the client" : "Now visible to your team only");
  };

  const isImage = (a: Attachment) => a.file_type?.startsWith("image/");

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-[12rem] flex-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {uploadKind && (
          <>
            <input
              ref={input}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              accept={photos ? "image/*" : undefined}
              onChange={(e) => void upload(e.target.files)}
            />
            <Button size="sm" variant="outline" className="shrink-0" disabled={uploading} onClick={() => input.current?.click()}>
              {photos ? <Camera className="mr-1.5 h-4 w-4" aria-hidden /> : <FileUp className="mr-1.5 h-4 w-4" aria-hidden />}
              {uploading ? "Uploading…" : photos ? "Add photos" : "Upload"}
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className={cn("grid gap-3", photos ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}>
            {files.map((a) => {
              const url = urls[a.file_path];
              const shareable = canShare && (a.kind === "work" || a.kind === "shared");
              return (
                <li key={a.id} className="overflow-hidden rounded-lg border bg-card">
                  <a href={url} target="_blank" rel="noreferrer" className="block" aria-label={`Open ${a.file_name}`}>
                    {isImage(a) && url ? (
                      <img src={url} alt={a.file_name} loading="lazy" className="h-28 w-full object-cover" />
                    ) : (
                      <span className="flex h-28 w-full items-center justify-center bg-muted">
                        <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
                      </span>
                    )}
                  </a>
                  <div className="space-y-1.5 p-2">
                    <p className="truncate text-xs" title={a.file_name}>
                      {a.file_name}
                    </p>
                    <div className="flex items-center justify-between gap-1">
                      {a.kind === "shared" ? (
                        <StatusPill tone="info">Shared</StatusPill>
                      ) : a.kind === "client" ? (
                        <StatusPill tone="neutral">From client</StatusPill>
                      ) : a.kind === "work" && canShare ? (
                        <StatusPill tone="neutral">Team only</StatusPill>
                      ) : (
                        <span />
                      )}
                      <div className="flex gap-0.5">
                        {shareable && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            aria-label={a.kind === "shared" ? `Stop sharing ${a.file_name} with the client` : `Share ${a.file_name} with the client`}
                            title={a.kind === "shared" ? "Stop sharing with client" : "Share with client"}
                            onClick={() => void toggleShare(a)}
                          >
                            {a.kind === "shared" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
                          <a href={url} target="_blank" rel="noreferrer" aria-label={`Download ${a.file_name}`}>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        {canDelete?.(a) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label={`Delete ${a.file_name}`}
                            onClick={() => void remove(a)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
