import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { PageBar } from "@/components/dashboard/PageBar";
import { StatusPill, type StatusTone } from "@/components/dashboard/StatusPill";
import { ListControls } from "@/components/list/ListControls";
import { DataList, type Column } from "@/components/list/DataList";
import { EmptyState } from "@/components/list/EmptyState";
import { todayIso } from "@/lib/dashboardQueries";

type Appointment = {
  id: string;
  title: string | null;
  appointment_date: string;
  appointment_time: string | null;
  type: string | null;
  status: string;
};

const TONE: Record<string, StatusTone> = {
  pending: "neutral",
  confirmed: "info",
  in_progress: "info",
  completed: "success",
  cancelled: "neutral",
};

function when(a: Appointment) {
  const date = new Date(a.appointment_date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return `${date} · ${(a.appointment_time || "").slice(0, 5)}`;
}

/** Upcoming bookings for the technician, soonest first. */
export default function StaffSchedule() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("upcoming");

  useEffect(() => {
    if (!user?.id) return;
    setIsLoading(true);
    let query = supabase.from("appointments").select("id, title, appointment_date, appointment_time, type, status");
    query =
      filter === "upcoming"
        ? query.gte("appointment_date", todayIso()).not("status", "in", "(completed,cancelled)").order("appointment_date").order("appointment_time")
        : query.lt("appointment_date", todayIso()).order("appointment_date", { ascending: false });
    query.then(({ data }) => {
      setAppointments((data || []) as Appointment[]);
      setIsLoading(false);
    });
  }, [user?.id, filter]);

  const statusPill = (a: Appointment) => (
    <StatusPill tone={TONE[a.status] ?? "neutral"}>
      <span className="capitalize">{a.status.replace(/_/g, " ")}</span>
    </StatusPill>
  );

  const columns: Column<Appointment>[] = [
    { key: "title", header: "Appointment", cell: (a) => a.title || "Appointment" },
    { key: "when", header: "When", cell: when },
    { key: "type", header: "Type", cell: (a) => <span className="capitalize">{a.type ?? "—"}</span>, hideBelow: "lg" },
    { key: "status", header: "Status", cell: statusPill },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto min-w-0 max-w-4xl space-y-4">
        <PageBar title="My schedule" subtitle={isLoading ? "Loading…" : `${appointments.length} ${filter === "upcoming" ? "upcoming" : "past"} bookings`} />
        <ListControls
          filters={[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past" },
          ]}
          filter={filter}
          onFilterChange={setFilter}
        />
        <DataList
          rows={appointments}
          columns={columns}
          isLoading={isLoading}
          getRowKey={(a) => a.id}
          getRowHref={(a) => `/appointments/${a.id}`}
          mobile={{ title: (a) => a.title || "Appointment", trailing: statusPill, meta: when }}
          empty={
            <EmptyState
              title={filter === "upcoming" ? "Nothing booked" : "No past bookings"}
              description={filter === "upcoming" ? "Consultations, collections and deliveries you're part of will show here." : undefined}
            />
          }
        />
      </div>
    </DashboardLayout>
  );
}
