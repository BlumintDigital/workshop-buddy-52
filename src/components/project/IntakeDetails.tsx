import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/dashboard/StatusPill";
import { Link } from "react-router-dom";
import { formatDate } from "@/lib/format";
import { useIndustry } from "@/lib/industry";

export interface IntakeFields {
  intake_type: string;
  make_model: string | null;
  serial_number: string | null;
  accessories: string | null;
  condition_notes: string | null;
  received_at: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  client_id: string | null;
  asset_id?: string | null;
  registration?: string | null;
  meter_reading?: number | null;
}

const INTAKE_LABEL: Record<string, string> = { evaluation: "Came in for evaluation", quote: "Came in for a quote", approved: "Came in approved" };

/** What reception recorded when the machine arrived. */
export default function IntakeDetails({ project, receivedBy, forClient }: { project: IntakeFields; receivedBy?: string; forClient?: boolean }) {
  const industry = useIndustry();
  const rows: [string, string | null][] = [
    ["Registration", project.registration ?? null],
    ["Make and model", project.make_model],
    [industry.intake.serialLabel, project.serial_number],
    [industry.intake.meterLabel.replace(/ \(optional\)$/, ""), project.meter_reading != null ? Math.round(project.meter_reading).toLocaleString() : null],
    ["Received with it", project.accessories],
    ["Condition on arrival", project.condition_notes],
  ];
  if (!forClient && !project.client_id && (project.contact_name || project.contact_phone || project.contact_email)) {
    rows.unshift(["Customer (no portal account)", [project.contact_name, project.contact_phone, project.contact_email].filter(Boolean).join(" · ")]);
  }
  const shown = rows.filter(([, v]) => v);
  if (shown.length === 0 && forClient) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Intake</CardTitle>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {!forClient && <StatusPill tone="neutral">{INTAKE_LABEL[project.intake_type] ?? "Received"}</StatusPill>}
          {project.asset_id && (
            <Link to={`/assets/${project.asset_id}`} className="font-medium text-primary hover:underline">
              Service history
            </Link>
          )}
          {project.received_at && (
            <span>
              Received {formatDate(project.received_at)}
              {receivedBy && !forClient ? ` by ${receivedBy}` : ""}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No machine details were recorded at intake.</p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {shown.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="whitespace-pre-line text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
