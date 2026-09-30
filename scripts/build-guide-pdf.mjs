#!/usr/bin/env node
// Builds a PDF in public/docs/ from a guide in docs/, so a download always
// matches the guide itself:
//
//   npm run docs:guide-pdf      docs/user-guide.md -> public/docs/user-guide.pdf
//
// Anything in public/ can be downloaded without signing in: internal guides
// belong in Shoplane Control instead.
//
// Uses the Chrome that Playwright already drives for the E2E tests.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "..");
const NAME = process.argv[2] ?? "user-guide";
const SOURCE = join(ROOT, "docs", `${NAME}.md`);
const OUT = join(ROOT, "public", "docs", `${NAME}.pdf`);
const FONT = join(ROOT, "node_modules", "@fontsource-variable", "archivo", "files", "archivo-latin-wght-normal.woff2");

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
// The on-screen guide hides some lines by role; the PDF is for everyone.
const stripRoles = (s) => s.replace(/\s*\{roles:\s*[a-z, ]+\}\s*$/i, "");

function inline(text) {
  return escape(stripRoles(text))
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/** Just enough Markdown for the guide: headings, paragraphs, lists, code, rules. */
function render(md) {
  const lines = md.split(/\r?\n/);
  const html = [];
  const toc = [];
  let i = 0;
  let title = "User Guide";
  let intro = "";
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      html.push(`<pre>${escape(code.join("\n"))}</pre>`);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = stripRoles(h[2]);
      if (level === 1) {
        title = text;
      } else {
        const id = slug(text);
        if (level === 2) toc.push({ id, text });
        const major = level === 2 && /guide|workflows/i.test(text);
        html.push(`<h${level} id="${id}"${major ? ' class="major"' : ""}>${inline(text)}</h${level}>`);
      }
      i++;
      continue;
    }
    if (/^---\s*$/.test(line)) {
      i++;
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
      const [head, , ...rest] = rows;
      html.push(`<table><thead><tr>${cells(head).map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rest.map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const start = ordered ? Number(line.match(/\d+/)[0]) : 1;
      const items = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i])) {
        let text = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
        i++;
        // A wrapped item continues on indented lines.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+|^\s*\|/.test(lines[i])) text += " " + lines[i++].trim();
        items.push(`<li>${inline(text)}</li>`);
      }
      html.push(ordered ? `<ol${start > 1 ? ` start="${start}"` : ""}>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|---\s*$|\s*[-*]\s+|\s*\d+\.\s+|\s*\|)/.test(lines[i])) para.push(lines[i++]);
    const text = para.join(" ");
    // A closing line in italics is the "last updated" note.
    if (/^\*[^*].*\*$/.test(text.trim())) html.push(`<p class="updated">${inline(text.trim().slice(1, -1))}</p>`);
    else if (!toc.length && !intro) intro = inline(text); // the line under the title goes on the cover
    else html.push(`<p>${inline(text)}</p>`);
  }
  return { title, intro, toc, body: html.join("\n") };
}

const { title, intro, toc, body } = render(readFileSync(SOURCE, "utf8"));
const font = readFileSync(FONT).toString("base64");
const updated = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
  @font-face { font-family: "Archivo"; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 100 900; }
  :root { --ink: #1a1f1c; --muted: #56615a; --line: #dde3df; --brand: #2e6a4c; --soft: #eef3f0; }
  * { box-sizing: border-box; }
  body { font-family: "Archivo", system-ui, sans-serif; color: var(--ink); font-size: 10.5pt; line-height: 1.55; margin: 0; }
  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: flex-end; padding-bottom: 30mm; page-break-after: always; }
  .cover .eyebrow { color: var(--brand); font-weight: 600; letter-spacing: .08em; text-transform: uppercase; font-size: 9pt; }
  .cover h1 { font-size: 34pt; line-height: 1.1; margin: 6mm 0 4mm; letter-spacing: -.01em; }
  .cover p { color: var(--muted); font-size: 12pt; margin: 0; max-width: 120mm; }
  .cover .date { margin-top: 10mm; font-size: 9.5pt; }
  .toc { page-break-after: always; }
  .toc h2 { border: 0; margin-top: 0; }
  .toc ol { list-style: none; padding: 0; margin: 0; }
  .toc li { padding: 2.2mm 0; border-bottom: 1px solid var(--line); }
  .toc a { color: var(--ink); text-decoration: none; }
  h2 { font-size: 17pt; margin: 0 0 4mm; padding-top: 2mm; padding-bottom: 2mm; border-bottom: 2px solid var(--brand); margin-top: 10mm; page-break-after: avoid; }
  .toc h2 { margin-top: 0; }
  /* The role guides and workflows start on a fresh page; the rest flow. */
  h2.major { page-break-before: always; margin-top: 0; }
  h3 { font-size: 12pt; margin: 7mm 0 2mm; page-break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  p { margin: 0 0 3mm; max-width: 165mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
  li { margin: 0 0 1.2mm; }
  strong { font-weight: 600; }
  code { font-family: ui-monospace, Consolas, monospace; font-size: 9pt; background: var(--soft); padding: .3mm 1.2mm; border-radius: 1mm; }
  pre { font-family: ui-monospace, Consolas, monospace; font-size: 9pt; line-height: 1.5; background: var(--soft); border-radius: 2mm; padding: 4mm 5mm; white-space: pre-wrap; page-break-inside: avoid; }
  a { color: var(--brand); }
  .updated { color: var(--muted); font-size: 9pt; margin-top: 8mm; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9.5pt; page-break-inside: avoid; }
  th, td { text-align: left; vertical-align: top; padding: 1.6mm 2.4mm; border-bottom: 1px solid var(--line); }
  th { font-weight: 600; background: var(--soft); }
</style></head>
<body>
  <section class="cover">
    <div class="eyebrow">Shoplane</div>
    <h1>${escape(title.replace(/\s+—\s+/, " "))}</h1>
    <p>${intro || "How projects move from reception to shipping, and how each role uses the platform."}</p>
    <p class="date">Updated ${updated}</p>
  </section>
  <nav class="toc"><h2>Contents</h2><ol>${toc.map((t) => `<li><a href="#${t.id}">${inline(t.text)}</a></li>`).join("")}</ol></nav>
  ${body}
</body></html>`;

const browser = await chromium.launch({ channel: "chrome" });
const tab = await browser.newPage();
await tab.setContent(page, { waitUntil: "load" });
await tab.evaluate(() => document.fonts.ready);
mkdirSync(join(ROOT, "public", "docs"), { recursive: true });
const pdf = await tab.pdf({
  format: "A4",
  margin: { top: "18mm", bottom: "20mm", left: "20mm", right: "20mm" },
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<span></span>",
  footerTemplate: `<div style="width:100%;font-family:system-ui,sans-serif;font-size:8pt;color:#56615a;padding:0 20mm;display:flex;justify-content:space-between"><span>${escape(title)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
});
await browser.close();
writeFileSync(OUT, pdf);
console.log(`Wrote ${OUT.slice(ROOT.length + 1)} (${Math.round(pdf.length / 1024)} KB, ${toc.length} sections).`);
