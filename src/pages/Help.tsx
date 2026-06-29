import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import pdfAsset from "../../public/docs/user-guide.pdf.asset.json";
import guideMarkdown from "../../docs/user-guide.md?raw";

const PDF_URL = pdfAsset.url;

// Which roles can see each top-level ## section (keyed by leading digit(s) before the dot).
const SECTION_ACCESS: Record<string, AppRole[]> = {
  "1": ["admin", "manager", "staff", "client"],
  "2": ["admin", "manager", "staff", "client"],
  "3": ["admin", "manager", "staff", "client"],
  "4": ["admin"],
  "5": ["admin", "manager"],
  "6": ["admin", "staff"],
  "7": ["admin", "client"],
  "8": ["admin", "manager", "staff", "client"],
  "9": ["admin", "manager", "staff", "client"],
  "10": ["admin", "manager", "staff", "client"],
  "11": ["admin", "manager", "staff", "client"],
  "12": ["admin", "manager", "staff", "client"],
};

// Inline role tag at end of a heading/paragraph/list-item, e.g. "Foo {roles: admin,manager}"
const ROLE_TAG_RE = /\s*\{roles:\s*([a-z, ]+)\}\s*$/i;

function parseRoleTag(text: string): { text: string; roles: AppRole[] | null } {
  const m = text.match(ROLE_TAG_RE);
  if (!m) return { text, roles: null };
  const roles = m[1]
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as AppRole[];
  return { text: text.replace(ROLE_TAG_RE, "").trim(), roles };
}

function visibleTo(roles: AppRole[] | null, role: AppRole): boolean {
  if (!roles) return true;
  if (role === "admin") return true; // admins see everything
  return roles.includes(role);
}

type Block =
  | { type: "h1" | "h2" | "h3"; text: string; id: string }
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "code"; text: string }
  | { type: "hr" };

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function inline(text: string) {
  // Escape HTML, then re-apply minimal markdown inline as HTML.
  let t = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  t = t.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono">$1</code>');
  return t;
}

function parse(md: string): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]); i++;
      }
      blocks.push({ type: "code", text: buf.join("\n") });
      i++; continue;
    }
    if (!line.trim()) { i++; continue; }
    if (line.startsWith("### ")) {
      const text = line.slice(4); blocks.push({ type: "h3", text, id: slug(parseRoleTag(text).text) }); i++; continue;
    }
    if (line.startsWith("## ")) {
      const text = line.slice(3); blocks.push({ type: "h2", text, id: slug(text) }); i++; continue;
    }
    if (line.startsWith("# ")) {
      const text = line.slice(2); blocks.push({ type: "h1", text, id: slug(text) }); i++; continue;
    }
    if (line.trim() === "---") { blocks.push({ type: "hr" }); i++; continue; }
    if (/^\s*[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*] /, "")); i++;
      }
      blocks.push({ type: "ul", items }); continue;
    }
    if (/^\s*\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\. /, "")); i++;
      }
      blocks.push({ type: "ol", items }); continue;
    }
    // paragraph
    const buf = [line]; i++;
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{1,3} |```|---|\s*[-*] |\s*\d+\. )/.test(lines[i])
    ) { buf.push(lines[i]); i++; }
    blocks.push({ type: "p", text: buf.join(" ") });
  }
  return blocks;
}

/** Returns the section number string from a ## heading text, e.g. "4. Admin Guide" -> "4". */
function extractSectionNumber(headingText: string): string | null {
  const m = headingText.match(/^(\d+)\./);
  return m ? m[1] : null;
}

/** Filter blocks by role: section (h2), subsection (h3), and per-paragraph/list-item role tags. */
function filterBlocksByRole(blocks: Block[], role: AppRole | null): Block[] {
  if (role === null) return blocks; // loading

  const result: Block[] = [];
  let sectionVisible = true; // h2 gate
  let subsectionVisible = true; // h3 gate within visible section

  for (const block of blocks) {
    if (block.type === "h2") {
      const num = extractSectionNumber(block.text);
      const allowed = num ? SECTION_ACCESS[num] : null;
      sectionVisible = allowed ? allowed.includes(role) : true;
      subsectionVisible = true;
      if (sectionVisible) result.push(block);
      continue;
    }
    if (!sectionVisible) continue;

    if (block.type === "h3") {
      const { text, roles } = parseRoleTag(block.text);
      subsectionVisible = visibleTo(roles, role);
      if (subsectionVisible) result.push({ ...block, text });
      continue;
    }
    if (!subsectionVisible) continue;

    if (block.type === "p") {
      const { text, roles } = parseRoleTag(block.text);
      if (visibleTo(roles, role)) result.push({ ...block, text });
      continue;
    }
    if (block.type === "ul" || block.type === "ol") {
      const items = block.items
        .map((it) => parseRoleTag(it))
        .filter(({ roles }) => visibleTo(roles, role))
        .map(({ text }) => text);
      if (items.length) result.push({ ...block, items });
      continue;
    }
    result.push(block);
  }

  return result;
}

export default function Help() {
  const { role } = useAuth();
  const allBlocks = useMemo(() => parse(guideMarkdown), []);

  const blocks = useMemo(() => filterBlocksByRole(allBlocks, role), [allBlocks, role]);

  const toc = useMemo(
    () => blocks.flatMap((b) => (b.type === "h2" ? [{ id: b.id, text: b.text }] : [])),
    [blocks]
  );
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setActive(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 }
    );
    toc.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [toc]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Help &amp; User Guide</h1>
            <p className="text-muted-foreground">
              Everything you need to use Workshop Buddy — for every role.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <a href={PDF_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open PDF
              </a>
            </Button>
            <Button asChild>
              <a href={PDF_URL} download="Workshop_Buddy_User_Guide.pdf">
                <FileText className="mr-2 h-4 w-4" />
                Download PDF
              </a>
            </Button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="hidden lg:block">
            <Card className="sticky top-20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Contents</CardTitle>
                <CardDescription className="text-xs">Jump to a section</CardDescription>
              </CardHeader>
              <CardContent>
                <nav className="space-y-1">
                  {toc.map((h) => (
                    <a
                      key={h.id}
                      href={`#${h.id}`}
                      className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                        active === h.id
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {h.text}
                    </a>
                  ))}
                </nav>
              </CardContent>
            </Card>
          </aside>

          <Card>
            <CardContent className="prose-like px-6 py-8">
              {blocks.map((b, idx) => {
                if (b.type === "h1")
                  return (
                    <h1 key={idx} id={b.id} className="mb-4 mt-2 text-3xl font-bold tracking-tight">
                      {b.text}
                    </h1>
                  );
                if (b.type === "h2")
                  return (
                    <h2
                      key={idx}
                      id={b.id}
                      className="mb-3 mt-10 scroll-mt-24 border-b border-border pb-2 text-2xl font-semibold text-primary"
                    >
                      {b.text}
                    </h2>
                  );
                if (b.type === "h3")
                  return (
                    <h3 key={idx} id={b.id} className="mb-2 mt-6 text-lg font-semibold">
                      {b.text}
                    </h3>
                  );
                if (b.type === "p")
                  return (
                    <p
                      key={idx}
                      className="mb-3 leading-relaxed text-foreground/90"
                      dangerouslySetInnerHTML={{ __html: inline(b.text) }}
                    />
                  );
                if (b.type === "ul")
                  return (
                    <ul key={idx} className="mb-4 list-disc space-y-1.5 pl-6 text-foreground/90">
                      {b.items.map((it, j) => (
                        <li key={j} dangerouslySetInnerHTML={{ __html: inline(it) }} />
                      ))}
                    </ul>
                  );
                if (b.type === "ol")
                  return (
                    <ol key={idx} className="mb-4 list-decimal space-y-1.5 pl-6 text-foreground/90">
                      {b.items.map((it, j) => (
                        <li key={j} dangerouslySetInnerHTML={{ __html: inline(it) }} />
                      ))}
                    </ol>
                  );
                if (b.type === "code")
                  return (
                    <pre
                      key={idx}
                      className="mb-4 overflow-x-auto rounded-md border border-border bg-muted/50 p-4 font-mono text-xs leading-relaxed"
                    >
                      {b.text}
                    </pre>
                  );
                if (b.type === "hr")
                  return <hr key={idx} className="my-8 border-border" />;
                return null;
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
