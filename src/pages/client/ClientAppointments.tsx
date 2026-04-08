import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, CalendarIcon, Clock, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { generateICS, downloadICS } from "@/lib/ical";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TIME_SLOTS = Array.from({ length: 17 }, (_, i) => {
  const hour = Math.floor(i / 2) + 9;
  const min = i % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${min}`;
});

export default function ClientAppointments() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState("");
  const [type, setType] = useState("consultation");
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const fetchAppts = async () => {
    if (!user) return;
    const { data } = await supabase.from("appointments").select("*").eq("client_id", user.id).order("appointment_date", { ascending: true });
    setAppointments(data || []);
  };

  useEffect(() => { fetchAppts(); }, [user]);

  // Check availability when date changes
  useEffect(() => {
    if (!selectedDate) { setBookedSlots([]); return; }
    setLoadingSlots(true);
    setSelectedTime("");
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    supabase
      .from("appointments")
      .select("appointment_time, duration_minutes")
      .eq("appointment_date", dateStr)
      .neq("status", "cancelled")
      .then(({ data }) => {
        const taken = (data || []).map((a) => a.appointment_time?.slice(0, 5));
        setBookedSlots(taken);
        setLoadingSlots(false);
      });
  }, [selectedDate]);

  const handleCreate = async () => {
    if (!user || !selectedDate || !selectedTime) return;
    const { error } = await supabase.from("appointments").insert({
      client_id: user.id,
      title,
      appointment_date: format(selectedDate, "yyyy-MM-dd"),
      appointment_time: selectedTime,
      type,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Appointment booked");
    setOpen(false);
    setTitle(""); setSelectedDate(undefined); setSelectedTime(""); setType("consultation");
    fetchAppts();
  };

  const handleExportCalendar = () => {
    const events = appointments.map(a => ({
      title: a.title,
      date: a.appointment_date,
      time: a.appointment_time?.slice(0, 5),
      durationMinutes: 60,
      description: a.type || undefined,
    }));
    downloadICS("my-appointments", generateICS(events, "My Workshop Appointments"));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Appointments</h2>
            <p className="text-muted-foreground">Book and manage your appointments</p>
          </div>
          <div className="flex gap-2">
            {appointments.length > 0 && (
              <Button variant="outline" onClick={handleExportCalendar}>
                <Download className="mr-2 h-4 w-4" />Export
              </Button>
            )}
            <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Book Appointment</Button></DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Book Appointment</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Oil Change" /></div>
                <div><Label>Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="consultation">Consultation</SelectItem>
                      <SelectItem value="repair">Repair</SelectItem>
                      <SelectItem value="inspection">Inspection</SelectItem>
                      <SelectItem value="pickup">Pickup</SelectItem>
                      <SelectItem value="delivery">Delivery</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        disabled={(date) => date < new Date(new Date().toDateString())}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                {selectedDate && (
                  <div>
                    <Label className="flex items-center gap-1 mb-2"><Clock className="h-4 w-4" />Available Time Slots</Label>
                    {loadingSlots ? (
                      <p className="text-sm text-muted-foreground">Checking availability…</p>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {TIME_SLOTS.map((slot) => {
                          const isBooked = bookedSlots.includes(slot);
                          const isSelected = selectedTime === slot;
                          return (
                            <Button
                              key={slot}
                              type="button"
                              size="sm"
                              variant={isSelected ? "default" : "outline"}
                              disabled={isBooked}
                              onClick={() => setSelectedTime(slot)}
                              className={cn("text-xs", isBooked && "opacity-40 line-through")}
                            >
                              {slot}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                <Button onClick={handleCreate} className="w-full" disabled={!title || !selectedDate || !selectedTime}>Book</Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No appointments</TableCell></TableRow>
                ) : appointments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      <Link to={`/appointments/${a.id}`} className="text-primary hover:underline">{a.title}</Link>
                    </TableCell>
                    <TableCell>{a.appointment_date}</TableCell>
                    <TableCell>{a.appointment_time}</TableCell>
                    <TableCell className="capitalize">{a.type}</TableCell>
                    <TableCell><Badge variant="outline">{a.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
