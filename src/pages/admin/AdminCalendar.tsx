import { useEffect, useState, useMemo, useCallback } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isSameDay, parseISO, isBefore, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Briefcase, CalendarDays, AlertTriangle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import CreateJobDialog from "@/components/calendar/CreateJobDialog";

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  type: "appointment" | "job";
  status: string;
  priority?: string;
  staffName?: string;
  clientName?: string;
  estimatedHours?: number | null;
};

const priorityColors: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  low: "border-l-emerald-500",
};

const priorityBadgeColors: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const statusBadgeColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
};

export default function AdminCalendar() {
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentWeekDate, setCurrentWeekDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showTypes, setShowTypes] = useState<string[]>(["appointment", "job"]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<Date | null>(null);
  const [createJobOpen, setCreateJobOpen] = useState(false);
  const [createJobDate, setCreateJobDate] = useState("");
  const [fetchKey, setFetchKey] = useState(0);

  const openCreateJob = (date: Date) => {
    setCreateJobDate(format(date, "yyyy-MM-dd"));
    setCreateJobOpen(true);
  };

  const handleDragStart = (e: React.DragEvent, eventId: string) => {
    e.dataTransfer.setData("text/plain", eventId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedEventId(eventId);
  };

  const handleDragOver = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDate(date);
  };

  const handleDragLeave = () => { setDragOverDate(null); };

  const handleDrop = async (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    setDragOverDate(null);
    const eventId = e.dataTransfer.getData("text/plain");
    setDraggedEventId(null);
    const event = events.find((ev) => ev.id === eventId);
    if (!event || event.type !== "job") return;
    const newDate = format(targetDate, "yyyy-MM-dd");
    if (event.date === newDate) return;
    setEvents((prev) => prev.map((ev) => (ev.id === eventId ? { ...ev, date: newDate } : ev)));
    const { error } = await supabase.from("jobs").update({ due_date: newDate }).eq("id", eventId);
    if (error) {
      setEvents((prev) => prev.map((ev) => (ev.id === eventId ? { ...ev, date: event.date } : ev)));
      toast.error("Failed to reschedule job");
    } else {
      toast.success(`"${event.title}" moved to ${format(targetDate, "MMM d")}`);
    }
  };

  // Compute date range based on view mode
  const dateRange = useMemo(() => {
    if (viewMode === "week") {
      const ws = startOfWeek(currentWeekDate);
      const we = endOfWeek(currentWeekDate);
      return { start: format(ws, "yyyy-MM-dd"), end: format(we, "yyyy-MM-dd") };
    }
    return { start: format(startOfMonth(currentMonth), "yyyy-MM-dd"), end: format(endOfMonth(currentMonth), "yyyy-MM-dd") };
  }, [viewMode, currentMonth, currentWeekDate]);

  useEffect(() => {
    const fetchEvents = async () => {
      const [apptRes, jobRes] = await Promise.all([
        supabase.from("appointments").select("id, title, appointment_date, appointment_time, status, type, client_id").gte("appointment_date", dateRange.start).lte("appointment_date", dateRange.end),
        supabase.from("jobs").select("id, title, due_date, status, priority, estimated_hours, assigned_staff_id, client_id").gte("due_date", dateRange.start).lte("due_date", dateRange.end),
      ]);
      const jobs = jobRes.data || [];
      const appts = apptRes.data || [];
      const profileIds = new Set<string>();
      jobs.forEach((j) => { if (j.assigned_staff_id) profileIds.add(j.assigned_staff_id); if (j.client_id) profileIds.add(j.client_id); });
      appts.forEach((a) => { if (a.client_id) profileIds.add(a.client_id); });
      let profileMap: Record<string, string> = {};
      if (profileIds.size > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name, company_name").in("id", Array.from(profileIds));
        (profiles || []).forEach((p) => { profileMap[p.id] = p.full_name || p.company_name || "Unknown"; });
      }
      const apptEvents: CalendarEvent[] = appts.map((a) => ({
        id: a.id, title: a.title, date: a.appointment_date, time: a.appointment_time, type: "appointment", status: a.status,
        clientName: profileMap[a.client_id] || undefined,
      }));
      const jobEvents: CalendarEvent[] = jobs.map((j) => ({
        id: j.id, title: j.title, date: j.due_date!, type: "job", status: j.status,
        priority: j.priority, estimatedHours: j.estimated_hours,
        staffName: j.assigned_staff_id ? profileMap[j.assigned_staff_id] : undefined,
        clientName: j.client_id ? profileMap[j.client_id] : undefined,
      }));
      setEvents([...apptEvents, ...jobEvents]);
    };
    fetchEvents();
  }, [dateRange, fetchKey]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (!showTypes.includes(e.type)) return false;
      if (e.type === "job") {
        if (statusFilter !== "all" && e.status !== statusFilter) return false;
        if (priorityFilter !== "all" && e.priority !== priorityFilter) return false;
      }
      return true;
    });
  }, [events, showTypes, statusFilter, priorityFilter]);

  const eventsForDate = useCallback((date: Date) => filteredEvents.filter((e) => isSameDay(parseISO(e.date), date)), [filteredEvents]);
  const selectedEvents = selectedDate ? eventsForDate(selectedDate) : [];

  // Stats
  const totalJobs = events.filter((e) => e.type === "job").length;
  const totalAppts = events.filter((e) => e.type === "appointment").length;
  const overdueJobs = events.filter((e) => e.type === "job" && e.status !== "completed" && isBefore(parseISO(e.date), new Date())).length;

  // Navigation
  const goBack = () => {
    if (viewMode === "week") setCurrentWeekDate((d) => subWeeks(d, 1));
    else setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1));
  };
  const goForward = () => {
    if (viewMode === "week") setCurrentWeekDate((d) => addWeeks(d, 1));
    else setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1));
  };

  const headerLabel = viewMode === "week"
    ? `${format(startOfWeek(currentWeekDate), "MMM d")} – ${format(endOfWeek(currentWeekDate), "MMM d, yyyy")}`
    : format(currentMonth, "MMMM yyyy");

  // Days to render
  const days = viewMode === "week"
    ? eachDayOfInterval({ start: startOfWeek(currentWeekDate), end: endOfWeek(currentWeekDate) })
    : eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });

  const firstDayOfWeek = viewMode === "month" ? startOfMonth(currentMonth).getDay() : 0;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const renderEventPill = (ev: CalendarEvent) => (
    <div
      key={ev.id}
      draggable={ev.type === "job"}
      onDragStart={ev.type === "job" ? (e) => { e.stopPropagation(); handleDragStart(e, ev.id); } : undefined}
      className={cn(
        "text-[10px] leading-tight px-1 py-0.5 rounded truncate border-l-2",
        ev.type === "appointment"
          ? "bg-primary/10 text-primary border-l-blue-500"
          : cn("bg-secondary text-secondary-foreground cursor-grab active:cursor-grabbing", priorityColors[ev.priority || "medium"]),
        draggedEventId === ev.id && "opacity-50"
      )}
    >
      {ev.title}
    </div>
  );

  const renderDayCell = (day: Date) => {
    const dayEvents = eventsForDate(day);
    const isSelected = selectedDate && isSameDay(day, selectedDate);
    const isToday = isSameDay(day, new Date());
    const jobCount = dayEvents.filter((e) => e.type === "job").length;
    const apptCount = dayEvents.filter((e) => e.type === "appointment").length;
    const isWeek = viewMode === "week";
    const maxShow = isWeek ? 999 : 3;

    return (
      <div
        key={day.toISOString()}
        onClick={() => setSelectedDate(day)}
        onDragOver={(e) => handleDragOver(e, day)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, day)}
        className={cn(
          "p-1 border rounded-md text-left transition-colors hover:bg-muted/50 cursor-pointer",
          isWeek ? "min-h-[200px]" : "min-h-[80px]",
          isSelected && "ring-2 ring-primary",
          isToday && "bg-accent/30",
          dragOverDate && isSameDay(day, dragOverDate) && "bg-primary/10 ring-2 ring-primary/30"
        )}
      >
        <div className="flex items-center justify-between">
          <span className={cn("text-xs font-medium", isToday && "text-primary font-bold")}>
            {isWeek ? format(day, "EEE, MMM d") : format(day, "d")}
          </span>
          <div className="flex items-center gap-1">
            {jobCount > 0 && <span className="text-[9px] bg-secondary text-secondary-foreground rounded-full px-1">{jobCount}J</span>}
            {apptCount > 0 && <span className="text-[9px] bg-primary/10 text-primary rounded-full px-1">{apptCount}A</span>}
            <button
              onClick={(e) => { e.stopPropagation(); openCreateJob(day); }}
              className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="mt-1 space-y-0.5">
          {dayEvents.slice(0, maxShow).map(renderEventPill)}
          {!isWeek && dayEvents.length > 3 && (
            <span className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Calendar</h2>
          <p className="text-muted-foreground">Plan projects and track appointments at a glance</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card className="p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-1 sm:gap-3">
            <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
            <div className="text-center sm:text-left min-w-0">
              <p className="text-xl sm:text-2xl font-bold">{totalJobs}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Jobs this month</p>
            </div>
          </Card>
          <Card className="p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-1 sm:gap-3">
            <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
            <div className="text-center sm:text-left min-w-0">
              <p className="text-xl sm:text-2xl font-bold">{totalAppts}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Appointments</p>
            </div>
          </Card>
          <Card className="p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-1 sm:gap-3">
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-destructive shrink-0" />
            <div className="text-center sm:text-left min-w-0">
              <p className="text-xl sm:text-2xl font-bold">{overdueJobs}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Overdue jobs</p>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">View:</span>
              <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as "month" | "week")} size="sm">
                <ToggleGroupItem value="month" className="text-xs">Month</ToggleGroupItem>
                <ToggleGroupItem value="week" className="text-xs">Week</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Show:</span>
              <ToggleGroup type="multiple" value={showTypes} onValueChange={(v) => v.length && setShowTypes(v)} size="sm">
                <ToggleGroupItem value="appointment" className="text-xs">Appointments</ToggleGroupItem>
                <ToggleGroupItem value="job" className="text-xs">Jobs</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Priority:</span>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Calendar grid */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={goBack}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => { const now = new Date(); setCurrentMonth(now); setCurrentWeekDate(now); setSelectedDate(now); }}>
                  Today
                </Button>
              </div>
              <CardTitle className="text-lg">{headerLabel}</CardTitle>
              <Button variant="ghost" size="icon" onClick={goForward}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px">
              {dayNames.map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
              ))}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`blank-${i}`} />)}
              {days.map(renderDayCell)}
            </div>
          </CardContent>
        </Card>

        {/* Selected day detail */}
        {selectedDate && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{format(selectedDate, "EEEE, MMMM d, yyyy")}</CardTitle>
                <Button size="sm" variant="outline" onClick={() => openCreateJob(selectedDate)}>
                  <Plus className="h-4 w-4 mr-1" /> Create Job
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events for this day</p>
              ) : (
                <div className="space-y-3">
                  {selectedEvents.map((ev) => (
                    <div key={ev.id} className={cn("border rounded-md p-3 border-l-4", ev.type === "job" ? priorityColors[ev.priority || "medium"] : "border-l-blue-500")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{ev.title}</p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                            {ev.time && <span>🕐 {ev.time}</span>}
                            {ev.clientName && <span>Client: {ev.clientName}</span>}
                            {ev.staffName && <span>Staff: {ev.staffName}</span>}
                            {ev.estimatedHours != null && <span>{ev.estimatedHours}h est.</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {ev.type === "job" && ev.priority && (
                            <Badge variant="secondary" className={cn("text-[10px] capitalize", priorityBadgeColors[ev.priority])}>
                              {ev.priority}
                            </Badge>
                          )}
                          <Badge variant={ev.type === "appointment" ? "default" : "secondary"} className={cn("text-[10px] capitalize", ev.type === "job" && statusBadgeColors[ev.status])}>
                            {ev.status.replace("_", " ")}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] capitalize">{ev.type}</Badge>
                        </div>
                      </div>
                      {ev.type === "job" && (
                        <Link to="/admin/jobs" className="text-xs text-primary hover:underline mt-2 inline-block">
                          View Details →
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Create Job Dialog */}
        <CreateJobDialog
          open={createJobOpen}
          onOpenChange={setCreateJobOpen}
          defaultDate={createJobDate}
          onCreated={() => setFetchKey((k) => k + 1)}
        />
      </div>
    </DashboardLayout>
  );
}
