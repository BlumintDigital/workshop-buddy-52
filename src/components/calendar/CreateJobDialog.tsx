import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { FileText } from "lucide-react";
import { toast } from "sonner";

interface UserOption {
  id: string;
  full_name: string;
}

interface CreateJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  onCreated: () => void;
}

export default function CreateJobDialog({ open, onOpenChange, defaultDate, onCreated }: CreateJobDialogProps) {
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", assigned_staff_id: "", client_id: "", isQuote: false, due_date: defaultDate });
  const [staffUsers, setStaffUsers] = useState<UserOption[]>([]);
  const [clientUsers, setClientUsers] = useState<UserOption[]>([]);

  useEffect(() => {
    setForm((f) => ({ ...f, due_date: defaultDate }));
  }, [defaultDate]);

  useEffect(() => {
    if (!open) return;
    const fetchUsers = async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      if (!roles) return;
      const staffRoles = roles.filter((r) => r.role === "staff");
      const clientRoles = roles.filter((r) => r.role === "client");
      const allIds = [...staffRoles, ...clientRoles].map((r) => r.user_id);
      if (allIds.length === 0) return;
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", allIds);
      if (!profiles) return;
      const profileMap = new Map(profiles.map((p) => [p.id, p.full_name || "Unknown"]));
      setStaffUsers(staffRoles.map((r) => ({ id: r.user_id, full_name: profileMap.get(r.user_id) || "Unknown" })));
      setClientUsers(clientRoles.map((r) => ({ id: r.user_id, full_name: profileMap.get(r.user_id) || "Unknown" })));
    };
    fetchUsers();
  }, [open]);

  const handleCreate = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    const payload: any = { title: form.title, description: form.description, priority: form.priority, status: form.isQuote ? "quote" : "pending" };
    if (form.assigned_staff_id) payload.assigned_staff_id = form.assigned_staff_id;
    if (form.client_id) payload.client_id = form.client_id;
    if (form.due_date) payload.due_date = form.due_date;
    const { error } = await supabase.from("jobs").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Job created");
    setForm({ title: "", description: "", priority: "medium", assigned_staff_id: "", client_id: "", isQuote: false, due_date: defaultDate });
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create New Job</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Assign Staff</Label>
            <Select value={form.assigned_staff_id} onValueChange={(v) => setForm({ ...form, assigned_staff_id: v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {staffUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Assign Client</Label>
            <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
              <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                {clientUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Due Date</Label>
            <InputGroup className="mt-1">
              <InputGroupInput
                value={form.due_date ? format(parseISO(form.due_date), "MMMM dd, yyyy") : ""}
                placeholder="Pick a date"
                onChange={(e) => {
                  const parsed = new Date(e.target.value);
                  if (!isNaN(parsed.getTime())) {
                    setForm({ ...form, due_date: format(parsed, "yyyy-MM-dd") });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setDatePickerOpen(true);
                  }
                }}
              />
              <InputGroupAddon align="inline-end">
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <InputGroupButton variant="ghost" size="icon" aria-label="Select date">
                      <CalendarIcon className="h-4 w-4" />
                    </InputGroupButton>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto overflow-hidden p-0" align="end" alignOffset={-8} sideOffset={10}>
                    <Calendar
                      mode="single"
                      selected={form.due_date ? parseISO(form.due_date) : undefined}
                      month={datePickerMonth}
                      onMonthChange={setDatePickerMonth}
                      onSelect={(date) => {
                        setForm({ ...form, due_date: date ? format(date, "yyyy-MM-dd") : "" });
                        setDatePickerOpen(false);
                      }}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </InputGroupAddon>
            </InputGroup>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Checkbox id="calIsQuote" checked={form.isQuote} onCheckedChange={(v) => setForm({ ...form, isQuote: !!v })} />
            <label htmlFor="calIsQuote" className="text-sm cursor-pointer select-none">
              <span className="font-medium">Save as quote</span>
              <span className="text-muted-foreground ml-1">— client must approve before work begins</span>
            </label>
          </div>
          <Button onClick={handleCreate} className="w-full">
            {form.isQuote ? <><FileText className="mr-2 h-4 w-4" />Create Quote</> : "Create Job"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
