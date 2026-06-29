import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { FileText, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}

type RequestType = "quote" | "job";

export default function NewRequestDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const [type, setType] = useState<RequestType>("quote");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [preferredDate, setPreferredDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setType("quote");
    setTitle("");
    setDescription("");
    setPriority("medium");
    setPreferredDate("");
  };

  const submit = async () => {
    if (!user) return;
    if (!title.trim()) {
      toast.error("Please provide a short title");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("client_requests").insert({
      client_id: user.id,
      request_type: type,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      preferred_date: preferredDate || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(type === "quote" ? "Quote request submitted" : "Job request submitted");
    reset();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New request</DialogTitle>
          <DialogDescription>
            Ask the workshop for a quote or to start work on a job.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setType("quote")}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                type === "quote" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40",
              )}
            >
              <FileText className="h-5 w-5 text-primary" />
              <p className="mt-2 font-medium">Request a quote</p>
              <p className="text-xs text-muted-foreground">Get a price estimate before work begins.</p>
            </button>
            <button
              type="button"
              onClick={() => setType("job")}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                type === "job" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40",
              )}
            >
              <Wrench className="h-5 w-5 text-primary" />
              <p className="mt-2 font-medium">Request a job</p>
              <p className="text-xs text-muted-foreground">Ask the workshop to take on the work.</p>
            </button>
          </div>

          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Brake pad replacement" />
          </div>

          <div>
            <Label>Details</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you need…"
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Preferred date</Label>
              <DatePickerInput value={preferredDate} onChange={setPreferredDate} className="mt-1" />
            </div>
          </div>

          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting ? "Submitting…" : type === "quote" ? "Submit quote request" : "Submit job request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
