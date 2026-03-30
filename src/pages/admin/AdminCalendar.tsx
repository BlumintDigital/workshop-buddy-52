import { useEffect, useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  type: "appointment" | "job";
  status: string;
};

export default function AdminCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  useEffect(() => {
    const start = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const end = format(endOfMonth(currentMonth), "yyyy-MM-dd");

    Promise.all([
      supabase.from("appointments").select("id, title, appointment_date, appointment_time, status, type").gte("appointment_date", start).lte("appointment_date", end),
      supabase.from("jobs").select("id, title, due_date, status").gte("due_date", start).lte("due_date", end),
    ]).then(([apptRes, jobRes]) => {
      const apptEvents: CalendarEvent[] = (apptRes.data || []).map((a) => ({
        id: a.id, title: a.title, date: a.appointment_date, time: a.appointment_time, type: "appointment", status: a.status,
      }));
      const jobEvents: CalendarEvent[] = (jobRes.data || []).map((j) => ({
        id: j.id, title: j.title, date: j.due_date!, type: "job", status: j.status,
      }));
      setEvents([...apptEvents, ...jobEvents]);
    });
  }, [currentMonth]);

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const firstDayOfWeek = startOfMonth(currentMonth).getDay();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const eventsForDate = (date: Date) => events.filter((e) => isSameDay(parseISO(e.date), date));
  const selectedEvents = selectedDate ? eventsForDate(selectedDate) : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Calendar</h2>
          <p className="text-muted-foreground">Overview of booked appointments and project deadlines</p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-lg">{format(currentMonth, "MMMM yyyy")}</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1))}>
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
              {days.map((day) => {
                const dayEvents = eventsForDate(day);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "min-h-[80px] p-1 border rounded-md text-left transition-colors hover:bg-muted/50",
                      isSelected && "ring-2 ring-primary",
                      isToday && "bg-accent/30"
                    )}
                  >
                    <span className={cn("text-xs font-medium", isToday && "text-primary font-bold")}>{format(day, "d")}</span>
                    <div className="mt-1 space-y-0.5">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <div
                          key={ev.id}
                          className={cn(
                            "text-[10px] leading-tight px-1 py-0.5 rounded truncate",
                            ev.type === "appointment" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"
                          )}
                        >
                          {ev.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {selectedDate && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{format(selectedDate, "EEEE, MMMM d, yyyy")}</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events for this day</p>
              ) : (
                <div className="space-y-3">
                  {selectedEvents.map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between border rounded-md p-3">
                      <div>
                        <p className="font-medium text-sm">{ev.title}</p>
                        {ev.time && <p className="text-xs text-muted-foreground">{ev.time}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={ev.type === "appointment" ? "default" : "secondary"} className="text-xs capitalize">{ev.type}</Badge>
                        <Badge variant="outline" className="text-xs">{ev.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
