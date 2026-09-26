import { useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { notifyJobStatusChange } from "@/lib/jobNotifications";

type Task = { id: string; title: string; status: string };

interface Props {
  project: { id: string; ref: string; title: string; status: string; client_id: string | null; assigned_staff_id: string | null };
  tasks: Task[];
  can: { quote: boolean; plan: boolean; quality: boolean };
  onChanged: () => void;
}

/**
 * The one thing to do next at each stage, for whoever is allowed to do it:
 * approve or close an evaluation, and pass or send back at the quality check.
 */
export default function ProjectStageActions({ project, tasks, can, onChanged }: Props) {
  const [closing, setClosing] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [busy, setBusy] = useState(false);

  const setStatus = async (status: string, success: string) => {
    setBusy(true);
    const { error } = await supabase.from("jobs").update({ status }).eq("id", project.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(success);
    notifyJobStatusChange(project, status);
    onChanged();
  };

  const pass = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("quality_check", { _job_id: project.id, _pass: true });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Passed. Shipping has been told it's ready.");
    notifyJobStatusChange(project, "completed");
    onChanged();
  };

  const stage = project.status;
  const early = stage === "received" || stage === "evaluation" || stage === "quote";
  const open = tasks.filter((t) => t.status !== "completed");

  let content: React.ReactNode = null;
  if (early && (can.quote || can.plan)) {
    content = (
      <>
        <p className="text-sm">
          {stage === "quote" ? "Waiting for the client to decide on the quote." : "Assess the machine, then send a quote, or approve it straight away if the client has agreed."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void setStatus("pending", "Approved. It's ready to plan.")}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />
            Approve without a quote
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => setClosing(true)}>
            <XCircle className="mr-1.5 h-4 w-4" aria-hidden />
            Close project
          </Button>
        </div>
      </>
    );
  } else if (stage === "pending" && can.plan) {
    content = <p className="text-sm">Approved. Split the work into team tasks below. The project starts when someone starts a task.</p>;
  } else if (stage === "in_progress" && open.length === 0 && tasks.length > 0 && can.quality) {
    content = (
      <>
        <p className="text-sm">Every task is handed off.</p>
        <Button size="sm" disabled={busy} onClick={() => void setStatus("review", "Moved to the quality check")}>
          Start quality check
        </Button>
      </>
    );
  } else if (stage === "completed") {
    content = <p className="text-sm">Passed the quality check. The shipping team tells the client and arranges collection or delivery.</p>;
  } else if (stage === "review") {
    content = can.quality ? (
      <>
        <p className="text-sm">Check the finished work. Passing it tells shipping it's ready; sending it back creates rework tasks.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => void pass()}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />
            Pass quality check
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setSendingBack(true)}>
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
            Send back for rework
          </Button>
        </div>
      </>
    ) : (
      <p className="text-sm">Waiting for the quality check.</p>
    );
  }

  if (!content) return null;
  return (
    <section aria-label="Next step" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary-soft px-4 py-3">
      {content}
      {closing && (
        <CloseDialog
          onClose={() => setClosing(false)}
          onConfirm={async (reason) => {
            setClosing(false);
            if (reason) await supabase.from("job_comments").insert({ job_id: project.id, user_id: (await supabase.auth.getUser()).data.user!.id, body: `Closed: ${reason}`, is_internal: true });
            await setStatus("cancelled", "Project closed");
          }}
        />
      )}
      {sendingBack && (
        <SendBackDialog
          tasks={tasks}
          onClose={() => setSendingBack(false)}
          onConfirm={async (ids, note) => {
            const { error } = await supabase.rpc("quality_check", { _job_id: project.id, _pass: false, _note: note, _rework_task_ids: ids });
            if (error) return toast.error(error.message);
            setSendingBack(false);
            toast.success(`Sent back. ${ids.length === 1 ? "A rework task was" : `${ids.length} rework tasks were`} added.`);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function CloseDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Close this project?</DialogTitle>
          <DialogDescription>Use this when the client doesn't go ahead. The project keeps its ID and history.</DialogDescription>
        </DialogHeader>
        <div>
          <Label htmlFor="f-close-reason">Reason (kept as a team note)</Label>
          <Textarea id="f-close-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Client declined the quote and collected the machine" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep open
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(reason.trim())}>
            Close project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendBackDialog({ tasks, onClose, onConfirm }: { tasks: Task[]; onClose: () => void; onConfirm: (ids: string[], note: string) => void }) {
  const [ids, setIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const done = tasks.filter((t) => t.status === "completed");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send back for rework</DialogTitle>
          <DialogDescription>Each task you tick gets a rework task for the same team and person.</DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Tasks that need rework</legend>
          {done.map((t) => (
            <label key={t.id} htmlFor={`rw-${t.id}`} className="flex cursor-pointer items-center gap-3 rounded-md border p-3">
              <Checkbox id={`rw-${t.id}`} checked={ids.includes(t.id)} onCheckedChange={(c) => setIds((v) => (c ? [...v, t.id] : v.filter((x) => x !== t.id)))} />
              <span className="text-sm">{t.title}</span>
            </label>
          ))}
        </fieldset>
        <div>
          <Label htmlFor="f-rework-note">What needs fixing</Label>
          <Textarea id="f-rework-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="e.g. Runout 0.08 mm at the chuck, needs to be under 0.02" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(ids, note.trim())} disabled={ids.length === 0 || !note.trim()}>
            Send back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
