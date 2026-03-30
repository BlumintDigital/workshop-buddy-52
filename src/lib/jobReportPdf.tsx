import { pdf, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { supabase } from "@/integrations/supabase/client";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  header: { marginBottom: 16 },
  workshopName: { fontSize: 18, fontWeight: "bold", marginBottom: 2 },
  reportLabel: { fontSize: 10, color: "#666" },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginVertical: 10 },
  sectionTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 6, color: "#222" },
  row: { flexDirection: "row", marginBottom: 3 },
  rowLabel: { width: 100, fontSize: 9, color: "#666" },
  rowValue: { flex: 1, fontSize: 9 },
  taskBox: { marginBottom: 8, padding: 8, backgroundColor: "#f8fafc", borderRadius: 3 },
  taskTitle: { fontSize: 10, fontWeight: "bold", marginBottom: 2 },
  taskMeta: { fontSize: 8, color: "#666", marginBottom: 4 },
  noteEntry: { marginBottom: 4, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: "#d1d5db" },
  noteText: { fontSize: 9 },
  noteMeta: { fontSize: 8, color: "#999", marginTop: 1 },
  attachmentEntry: { fontSize: 9, color: "#444", marginBottom: 2 },
  footer: { marginTop: 20, fontSize: 8, color: "#aaa" },
});

interface ReportData {
  job: any;
  workshopName: string;
  clientName: string;
  staffName: string;
  tasks: any[];
  notesByTask: Record<string, any[]>;
  attachmentsByTask: Record<string, any[]>;
  jobAttachments: any[];
}

function JobReportDocument({ job, workshopName, clientName, staffName, tasks, notesByTask, attachmentsByTask, jobAttachments }: ReportData) {
  const completedTasks = tasks.filter(t => t.status === "completed").length;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.workshopName}>{workshopName}</Text>
          <Text style={styles.reportLabel}>Job Report</Text>
        </View>
        <View style={styles.divider} />

        {/* Job details */}
        <Text style={styles.sectionTitle}>Job Details</Text>
        <View style={styles.row}><Text style={styles.rowLabel}>Title</Text><Text style={styles.rowValue}>{job.title}</Text></View>
        {job.description && <View style={styles.row}><Text style={styles.rowLabel}>Description</Text><Text style={styles.rowValue}>{job.description}</Text></View>}
        <View style={styles.row}><Text style={styles.rowLabel}>Status</Text><Text style={styles.rowValue}>{job.status?.replace(/_/g, " ")}</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Priority</Text><Text style={styles.rowValue}>{job.priority}</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Client</Text><Text style={styles.rowValue}>{clientName}</Text></View>
        <View style={styles.row}><Text style={styles.rowLabel}>Assigned Staff</Text><Text style={styles.rowValue}>{staffName}</Text></View>
        {job.due_date && <View style={styles.row}><Text style={styles.rowLabel}>Due Date</Text><Text style={styles.rowValue}>{job.due_date}</Text></View>}
        {job.estimated_hours != null && <View style={styles.row}><Text style={styles.rowLabel}>Estimated Hours</Text><Text style={styles.rowValue}>{job.estimated_hours}h</Text></View>}
        {job.actual_hours != null && <View style={styles.row}><Text style={styles.rowLabel}>Actual Hours</Text><Text style={styles.rowValue}>{job.actual_hours}h</Text></View>}
        <View style={styles.row}><Text style={styles.rowLabel}>Created</Text><Text style={styles.rowValue}>{new Date(job.created_at).toLocaleDateString()}</Text></View>

        {/* Tasks */}
        {tasks.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>Tasks — {completedTasks}/{tasks.length} completed</Text>
            {tasks.map(task => (
              <View key={task.id} style={styles.taskBox}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                <Text style={styles.taskMeta}>
                  Status: {task.status?.replace(/_/g, " ")}  ·  Assigned to: {task.assignee_name || "Unassigned"}
                </Text>
                {task.description && <Text style={{ fontSize: 9, color: "#555", marginBottom: 4 }}>{task.description}</Text>}

                {/* Task notes */}
                {(notesByTask[task.id] || []).length > 0 && (
                  <View style={{ marginTop: 4 }}>
                    {notesByTask[task.id].map(note => (
                      <View key={note.id} style={styles.noteEntry}>
                        <Text style={styles.noteText}>{note.note}</Text>
                        <Text style={styles.noteMeta}>{note.author_name}  ·  {new Date(note.created_at).toLocaleString()}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Task attachments list */}
                {(attachmentsByTask[task.id] || []).length > 0 && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: 8, color: "#666", marginBottom: 2 }}>Attachments:</Text>
                    {attachmentsByTask[task.id].map(a => (
                      <Text key={a.id} style={styles.attachmentEntry}>• {a.file_name}</Text>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Job-level attachments */}
        {jobAttachments.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>Job Attachments</Text>
            {jobAttachments.map(a => (
              <Text key={a.id} style={styles.attachmentEntry}>• {a.file_name}</Text>
            ))}
          </View>
        )}

        <Text style={styles.footer}>Generated {new Date().toLocaleString()}</Text>
      </Page>
    </Document>
  );
}

export async function generateJobReport(jobId: string): Promise<void> {
  const [{ data: job }, { data: tasks }, { data: allNotes }, { data: allAttachments }, { data: settings }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).single(),
    supabase.from("job_tasks").select("*").eq("job_id", jobId).order("created_at"),
    supabase.from("job_task_notes").select("*").order("created_at"),
    supabase.from("job_attachments").select("*").eq("job_id", jobId).order("created_at"),
    supabase.from("workshop_settings").select("workshop_name").eq("id", 1).maybeSingle(),
  ]);

  if (!job) return;

  const workshopName = settings?.workshop_name || "Workshop";
  const taskList = tasks || [];
  const noteList = allNotes || [];
  const attachmentList = allAttachments || [];

  // Collect all profile IDs to resolve names
  const profileIds = new Set<string>();
  if (job.assigned_staff_id) profileIds.add(job.assigned_staff_id);
  if (job.client_id) profileIds.add(job.client_id);
  taskList.forEach(t => { if (t.assigned_to) profileIds.add(t.assigned_to); });
  noteList.forEach(n => profileIds.add(n.user_id));

  const { data: profiles } = profileIds.size > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", [...profileIds])
    : { data: [] };
  const nameMap = new Map((profiles || []).map(p => [p.id, p.full_name || "Unknown"]));

  const staffName = job.assigned_staff_id ? nameMap.get(job.assigned_staff_id) || "—" : "—";
  const clientName = job.client_id ? nameMap.get(job.client_id) || "—" : "—";
  const enrichedTasks = taskList.map(t => ({ ...t, assignee_name: t.assigned_to ? nameMap.get(t.assigned_to) || "Unknown" : null }));

  const taskIds = new Set(taskList.map(t => t.id));
  const enrichedNotes = noteList.filter(n => taskIds.has(n.task_id)).map(n => ({ ...n, author_name: nameMap.get(n.user_id) || "Unknown" }));

  const notesByTask: Record<string, any[]> = {};
  enrichedNotes.forEach(n => { notesByTask[n.task_id] = [...(notesByTask[n.task_id] || []), n]; });

  const attachmentsByTask: Record<string, any[]> = {};
  const jobAttachments: any[] = [];
  attachmentList.forEach(a => {
    if (a.task_id) {
      attachmentsByTask[a.task_id] = [...(attachmentsByTask[a.task_id] || []), a];
    } else {
      jobAttachments.push(a);
    }
  });

  const blob = await pdf(
    <JobReportDocument
      job={job}
      workshopName={workshopName}
      clientName={clientName}
      staffName={staffName}
      tasks={enrichedTasks}
      notesByTask={notesByTask}
      attachmentsByTask={attachmentsByTask}
      jobAttachments={jobAttachments}
    />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `job-report-${job.title.toLowerCase().replace(/\s+/g, "-")}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
