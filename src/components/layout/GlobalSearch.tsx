import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, FileText, Inbox, Search, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { projectPath, projectSearchFilter, projectStatusLabel } from "@/lib/projects";
import { NAV_GROUPS, isItemEnabled } from "@/lib/navigation";

type Result = { id: string; label: string; detail?: string; to: string };
type Results = { jobs: Result[]; invoices: Result[]; requests: Result[]; clients: Result[] };

const EMPTY: Results = { jobs: [], invoices: [], requests: [], clients: [] };

/** PostgREST `ilike` pattern with the user's wildcards and filter syntax neutralised. */
function likePattern(q: string) {
  return `%${q.replace(/[%_,()*]/g, " ").trim()}%`;
}

async function search(q: string, role: AppRole): Promise<Results> {
  const pattern = likePattern(q);
  const privileged = role === "admin" || role === "manager";
  const requestsUrl = role === "client" ? "/client/requests" : `/${role}/requests`;

  const [jobs, invoices, requests, clients] = await Promise.all([
    projectSearchFilter(q)
      ? supabase.from("jobs").select("id, ref, title, status").or(projectSearchFilter(q)!).order("created_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] as any[] }),
    role === "staff"
      ? Promise.resolve({ data: [] as any[] })
      : supabase.from("invoices").select("id, invoice_number, status").ilike("invoice_number", pattern).limit(5),
    role === "staff"
      ? Promise.resolve({ data: [] as any[] })
      : supabase.from("client_requests").select("id, title, status").ilike("title", pattern).limit(5),
    role === "admin"
      ? supabase
          .from("profiles")
          .select("id, full_name, company_name")
          .or(`full_name.ilike.${pattern},company_name.ilike.${pattern}`)
          .limit(5)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const status = (s: string) => s.replace(/_/g, " ");
  return {
    jobs: ((jobs.data || []) as any[]).map((j) => ({ id: j.id, label: `${j.ref} · ${j.title}`, detail: projectStatusLabel(j.status), to: projectPath(j.id) })),
    invoices: ((invoices.data || []) as any[]).map((i) => ({
      id: i.id,
      label: i.invoice_number || "Invoice",
      detail: status(i.status),
      to: `/invoices/${i.id}`,
    })),
    requests: ((requests.data || []) as any[]).map((r) => ({ id: r.id, label: r.title, detail: status(r.status), to: requestsUrl })),
    clients: privileged
      ? ((clients.data || []) as any[]).map((p) => ({
          id: p.id,
          label: p.company_name || p.full_name || "Unnamed",
          detail: p.company_name && p.full_name ? p.full_name : undefined,
          to: `/admin/users/${p.id}`,
        }))
      : [],
  };
}

/** Header search: jump to any page, or find a job, invoice, request or person by name. Opens with Ctrl K / ⌘K. */
export function GlobalSearch() {
  const { role } = useAuth();
  const { flags } = useFeatureFlags();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(EMPTY);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!role || q.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      search(q, role)
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults(EMPTY))
        .finally(() => !cancelled && setLoading(false));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, role]);

  const pages = useMemo(() => {
    if (!role) return [];
    const q = query.trim().toLowerCase();
    return NAV_GROUPS[role]
      .flatMap((g) => g.items)
      .filter((item) => isItemEnabled(item, flags))
      .filter((item) => !q || item.title.toLowerCase().includes(q));
  }, [role, flags, query]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  const groups: { heading: string; icon: typeof Briefcase; items: Result[] }[] = [
    { heading: "Projects", icon: Briefcase, items: results.jobs },
    { heading: "Invoices", icon: FileText, items: results.invoices },
    { heading: "Requests", icon: Inbox, items: results.requests },
    { heading: "People", icon: UserCheck, items: results.clients },
  ];
  const hasResults = pages.length > 0 || groups.some((g) => g.items.length > 0);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-10 w-10 justify-start gap-2 px-0 text-muted-foreground sm:w-56 sm:px-3"
        aria-label="Search"
      >
        <Search className="mx-auto sm:mx-0" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="ml-auto hidden rounded border bg-secondary px-1.5 font-sans text-xs sm:inline">Ctrl K</kbd>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-[15%] translate-y-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:min-h-[44px]">
            <CommandInput value={query} onValueChange={setQuery} placeholder="Search projects by ID or title, invoices, requests or pages…" />
            <CommandList className="max-h-[60vh]">
              {!hasResults && (
                <CommandEmpty>{loading ? "Searching…" : query.trim().length < 2 ? "Type at least 2 letters." : `No matches for "${query.trim()}".`}</CommandEmpty>
              )}
              {groups.map(
                (group) =>
                  group.items.length > 0 && (
                    <CommandGroup key={group.heading} heading={group.heading}>
                      {group.items.map((r) => (
                        <CommandItem key={`${group.heading}-${r.id}`} value={`${group.heading}-${r.id}`} onSelect={() => go(r.to)}>
                          <group.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                          <span className="truncate">{r.label}</span>
                          {r.detail && <span className="ml-auto pl-3 text-xs capitalize text-muted-foreground">{r.detail}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ),
              )}
              {pages.length > 0 && (
                <CommandGroup heading="Go to">
                  {pages.map((item) => (
                    <CommandItem key={item.url} value={`page-${item.url}`} onSelect={() => go(item.url)}>
                      <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                      {item.title}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
