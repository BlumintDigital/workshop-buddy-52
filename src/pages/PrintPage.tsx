import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useWorkshopSettings } from "@/hooks/useWorkshopSettings";
import { useIndustry } from "@/lib/industry";
import { projectStatusLabel } from "@/lib/projects";

type Kind = "job-card" | "project-label" | "asset-label";
type LabelSize = "62x40" | "62x29";

const SIZES: Record<LabelSize, { w: number; h: number; label: string }> = {
  "62x40": { w: 62, h: 40, label: "62 × 40 mm (continuous 62 mm roll)" },
  "62x29": { w: 62, h: 29, label: "62 × 29 mm (Brother DK-11209 / small address)" },
};

const day = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

interface JobData {
  job: Record<string, any>;
  customer: { name: string | null; phone: string | null; email: string | null };
  tasks: { title: string; team: string | null; person: string | null; estimated_hours: number | null }[];
  asset: { id: string; name: string; registration: string | null; serial_number: string | null; fleet_number: string | null } | null;
}

async function loadJob(id: string): Promise<JobData | null> {
  const { data: job } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
  if (!job) return null;
  const [{ data: client }, { data: tasks }, { data: asset }] = await Promise.all([
    job.client_id ? supabase.from("profiles").select("full_name, company_name, phone").eq("id", job.client_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("job_tasks").select("title, department_id, assigned_to, estimated_hours, order_index").eq("job_id", id).order("order_index"),
    job.asset_id ? supabase.from("assets").select("id, name, registration, serial_number, fleet_number").eq("id", job.asset_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const deptIds = [...new Set((tasks ?? []).map((t) => t.department_id).filter(Boolean))] as string[];
  const peopleIds = [...new Set((tasks ?? []).map((t) => t.assigned_to).filter(Boolean))] as string[];
  const [{ data: depts }, { data: people }] = await Promise.all([
    deptIds.length ? supabase.from("departments").select("id, name").in("id", deptIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    peopleIds.length ? supabase.from("profiles").select("id, full_name").in("id", peopleIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);
  const dept = new Map((depts ?? []).map((d) => [d.id, d.name]));
  const person = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  return {
    job,
    customer: {
      name: client ? client.company_name || client.full_name : job.contact_name,
      phone: client?.phone ?? job.contact_phone,
      email: job.contact_email,
    },
    tasks: (tasks ?? []).map((t) => ({ title: t.title, team: t.department_id ? dept.get(t.department_id) ?? null : null, person: t.assigned_to ? person.get(t.assigned_to) ?? null : null, estimated_hours: t.estimated_hours })),
    asset: (asset as JobData["asset"]) ?? null,
  };
}

/**
 * Printable job card (A4) and QR labels (62 mm label printers). Scanning a project label opens the
 * project; scanning an asset label opens the machine or vehicle's service history.
 */
export default function PrintPage() {
  const { kind, id = "" } = useParams<{ kind: Kind; id: string }>();
  const [params, setParams] = useSearchParams();
  const size = (params.get("size") as LabelSize) in SIZES ? (params.get("size") as LabelSize) : "62x40";
  const profile = useIndustry();
  const { data: ws } = useWorkshopSettings();
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [asset, setAsset] = useState<Record<string, any> | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  const target = kind === "asset-label" ? `/assets/${id}` : `/projects/${id}`;

  useEffect(() => {
    void QRCode.toDataURL(`${window.location.origin}${target}`, { margin: 0, width: 600, errorCorrectionLevel: "M" }).then(setQr);
    if (kind === "asset-label") {
      void supabase.from("assets").select("*").eq("id", id).maybeSingle().then(async ({ data }) => {
        if (!data) return setMissing(true);
        setAsset(data);
        if (data.client_id) {
          const { data: p } = await supabase.from("profiles").select("full_name, company_name").eq("id", data.client_id).maybeSingle();
          setOwner(p ? p.company_name || p.full_name : null);
        } else setOwner(data.owner_name);
      });
    } else {
      void loadJob(id).then((d) => (d ? setJobData(d) : setMissing(true)));
    }
  }, [kind, id, target]);

  const ready = !!qr && (kind === "asset-label" ? !!asset : !!jobData);
  // Open the print dialog once everything (including the QR image) has rendered.
  useEffect(() => {
    if (!ready || params.get("auto") === "0") return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [ready, params]);

  const isLabel = kind !== "job-card";
  const sz = SIZES[size];
  const pageCss = isLabel
    ? `@page { size: ${sz.w}mm ${sz.h}mm; margin: 0; } @media print { html, body { width: ${sz.w}mm; height: ${sz.h}mm; } }`
    : `@page { size: A4; margin: 12mm; }`;

  if (missing) {
    return <div className="p-8 text-center text-sm text-muted-foreground">This isn't available, or you don't have access to it. <Link to="/" className="text-primary underline">Back</Link></div>;
  }

  return (
    <div className="min-h-screen bg-secondary/40 print:bg-white">
      <style>{pageCss + " @media print { .no-print { display: none !important; } }"}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-card px-4 py-3">
        <Button variant="ghost" size="sm" asChild><Link to={target}><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Link></Button>
        <span className="text-sm font-medium">{kind === "job-card" ? "Job card (A4)" : kind === "asset-label" ? `${profile.asset.singular[0].toUpperCase()}${profile.asset.singular.slice(1)} label` : "Project label"}</span>
        {isLabel && (
          <select
            aria-label="Label size"
            value={size}
            onChange={(e) => setParams({ size: e.target.value, auto: "0" }, { replace: true })}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {(Object.keys(SIZES) as LabelSize[]).map((k) => <option key={k} value={k}>{SIZES[k].label}</option>)}
          </select>
        )}
        <Button size="sm" onClick={() => window.print()} disabled={!ready} className="ml-auto"><Printer className="mr-1.5 h-4 w-4" />Print</Button>
        {isLabel && <p className="basis-full text-xs text-muted-foreground">In the print dialog choose your label printer, set the paper to the same size and margins to none.</p>}
      </div>

      <div className="flex justify-center p-6 print:p-0">
        {!ready ? (
          <p className="text-sm text-muted-foreground">Preparing…</p>
        ) : isLabel ? (
          <Label
            sizeMm={sz}
            qr={qr!}
            workshop={ws?.workshop_name ?? null}
            big={kind === "asset-label" ? (asset!.registration || asset!.fleet_number || asset!.serial_number || asset!.name) : jobData!.job.ref}
            line1={kind === "asset-label" ? asset!.name : jobData!.job.title}
            line2={kind === "asset-label" ? owner : jobData!.customer.name}
            line3={kind === "asset-label" ? "Scan for service history" : `In ${day(jobData!.job.received_at ?? jobData!.job.created_at)}${jobData!.job.due_date ? ` · due ${day(jobData!.job.due_date)}` : ""}`}
          />
        ) : (
          <JobCard data={jobData!} qr={qr!} workshop={ws ?? null} assetLabel={profile.intake.serialLabel} meterLabel={profile.intake.meterLabel.replace(/ \(optional\)$/, "")} />
        )}
      </div>
    </div>
  );
}

function Label({ sizeMm, qr, workshop, big, line1, line2, line3 }: { sizeMm: { w: number; h: number }; qr: string; workshop: string | null; big: string; line1: string; line2: string | null; line3: string }) {
  // Keep the QR scannable but leave about 26 mm for text so a ref like EDL-202610-001 fits on one line.
  const qrMm = Math.min(sizeMm.h - 4, 30);
  return (
    <div
      className="flex items-center gap-[2mm] overflow-hidden bg-white text-black shadow print:shadow-none"
      style={{ width: `${sizeMm.w}mm`, height: `${sizeMm.h}mm`, padding: "2mm", fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <img src={qr} alt="QR code" style={{ width: `${qrMm}mm`, height: `${qrMm}mm` }} />
      <div className="min-w-0 flex-1 leading-tight">
        <div style={{ fontSize: "3.2mm", fontWeight: 700, letterSpacing: "-0.05mm", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{big}</div>
        <div style={{ fontSize: "2.6mm", marginTop: "0.6mm", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{line1}</div>
        {line2 && <div style={{ fontSize: "2.4mm", marginTop: "0.4mm", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line2}</div>}
        {sizeMm.h > 30 && <div style={{ fontSize: "2.2mm", marginTop: "0.6mm", color: "#444" }}>{line3}</div>}
        {sizeMm.h > 30 && workshop && <div style={{ fontSize: "2mm", marginTop: "0.4mm", color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{workshop}</div>}
      </div>
    </div>
  );
}

function JobCard({ data, qr, workshop, assetLabel, meterLabel }: { data: JobData; qr: string; workshop: { workshop_name: string | null; logo_url: string | null; phone: string | null; address: string | null } | null; assetLabel: string; meterLabel: string }) {
  const j = data.job;
  const rows: [string, string | null][] = [
    ["Customer", data.customer.name],
    ["Phone", data.customer.phone],
    ["Registration", j.registration],
    ["Make and model", j.make_model],
    [assetLabel, j.serial_number],
    [meterLabel, j.meter_reading != null ? Math.round(j.meter_reading).toLocaleString() : null],
    ["Received", day(j.received_at ?? j.created_at)],
    ["Wanted by", j.due_date ? day(j.due_date) : null],
    ["Priority", j.priority],
    ["Stage", projectStatusLabel(j.status)],
  ];
  return (
    <article className="w-[186mm] bg-white p-[8mm] text-[11px] leading-snug text-black shadow print:w-auto print:p-0 print:shadow-none" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
        <div className="flex items-center gap-3">
          {workshop?.logo_url && <img src={workshop.logo_url} alt="" className="h-12 w-12 object-contain" />}
          <div>
            <div className="text-[15px] font-bold">{workshop?.workshop_name ?? "Job card"}</div>
            <div className="text-[10px] text-neutral-600">{[workshop?.phone, workshop?.address].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-600">Job card</div>
            <div className="font-mono text-[18px] font-bold">{j.ref}</div>
          </div>
          <img src={qr} alt="QR code for this project" className="h-[24mm] w-[24mm]" />
        </div>
      </header>

      <h1 className="mt-3 text-[16px] font-bold">{j.title}</h1>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex gap-2 border-b border-dotted border-neutral-300 py-0.5">
            <dt className="w-28 shrink-0 text-neutral-600">{k}</dt>
            <dd className="font-medium first-letter:uppercase">{v}</dd>
          </div>
        ))}
      </dl>

      <Section title="Reported problem">{j.description || "—"}</Section>
      <div className="grid grid-cols-2 gap-4">
        <Section title="Received with it">{j.accessories || "—"}</Section>
        <Section title="Condition on arrival">{j.condition_notes || "—"}</Section>
      </div>

      <h2 className="mt-4 border-b border-black pb-1 text-[12px] font-bold uppercase tracking-wider">Work</h2>
      <table className="mt-1 w-full border-collapse">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-600">
            <th className="w-6 py-1" />
            <th className="py-1">Task</th>
            <th className="py-1">Team / person</th>
            <th className="w-16 py-1 text-right">Est. h</th>
            <th className="w-20 py-1 text-right">Actual h</th>
            <th className="w-24 py-1 pl-4">Initials</th>
          </tr>
        </thead>
        <tbody>
          {[...data.tasks, ...Array.from({ length: Math.max(0, 6 - data.tasks.length) }, () => null)].map((t, i) => (
            <tr key={i} className="h-7 border-b border-neutral-300 align-middle">
              <td><span className="inline-block h-3.5 w-3.5 border border-black" /></td>
              <td>{t?.title ?? ""}</td>
              <td className="text-neutral-700">{t ? [t.team, t.person].filter(Boolean).join(" · ") : ""}</td>
              <td className="text-right">{t?.estimated_hours ?? ""}</td>
              <td />
              <td />
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-4 border-b border-black pb-1 text-[12px] font-bold uppercase tracking-wider">Parts used</h2>
      <table className="mt-1 w-full border-collapse">
        <thead><tr className="text-left text-[10px] uppercase tracking-wider text-neutral-600"><th className="py-1">Part</th><th className="w-20 py-1 text-right">Qty</th><th className="w-40 py-1 pl-4">From stock / ordered</th></tr></thead>
        <tbody>{Array.from({ length: 5 }, (_, i) => <tr key={i} className="h-7 border-b border-neutral-300"><td /><td /><td /></tr>)}</tbody>
      </table>

      <Section title="Technician notes"><div className="h-[26mm]" /></Section>

      <div className="mt-4 grid grid-cols-3 gap-4 text-[10px]">
        {["Quality check passed by", "Date", "Customer collected / signature"].map((s) => (
          <div key={s}><div className="h-8 border-b border-black" /><div className="mt-1 text-neutral-600">{s}</div></div>
        ))}
      </div>
      <p className="mt-4 text-[9px] text-neutral-500">Scan the code to open this project in Shoplane. Record time, parts and notes there too so the office sees them.</p>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <h2 className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">{title}</h2>
      <div className="mt-0.5 whitespace-pre-line">{children}</div>
    </section>
  );
}

