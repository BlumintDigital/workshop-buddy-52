import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Design-system guardrails: keep hard-coded colours, sub-12px text and coloured
// side stripes from creeping back in. Colour must come from the semantic tokens
// (primary, success, warning, destructive, info, muted...).

const SRC = join(__dirname, "..");

/** Folders and files allowed to break the rules, with the reason. */
const EXEMPT = [
  `components${sep}ui${sep}`, // shadcn base kit, themed through tokens
  `pages${sep}goals${sep}GoalsPage.tsx`, // dark "live" display panel with its own palette
  `test${sep}`,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "graphify-out" ? [] : sourceFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

const files = sourceFiles(SRC)
  .map((f) => ({ path: relative(SRC, f), text: readFileSync(f, "utf8") }))
  .filter((f) => !EXEMPT.some((e) => f.path.includes(e)));

function offenders(pattern: RegExp) {
  return files.flatMap(({ path, text }) =>
    text.split("\n").flatMap((line, i) => {
      const matches = line.match(pattern);
      return matches ? [`${path}:${i + 1} ${matches.join(", ")}`] : [];
    }),
  );
}

describe("design guardrails", () => {
  it("uses semantic colour tokens instead of raw Tailwind palette classes", () => {
    const palette =
      /\b(?:text|bg|border|ring|fill|stroke|from|to|via)-(?:red|rose|pink|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|slate|gray|zinc|neutral|stone)-\d{2,3}\b/g;
    expect(offenders(palette)).toEqual([]);
  });

  it("never sets text below 12px", () => {
    expect(offenders(/\btext-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/g)).toEqual([]);
  });

  it("does not use coloured side-stripe borders", () => {
    // A thick one-sided border is fine as a neutral divider (e.g. a timeline rail), not as a colour accent.
    const stripes = files.flatMap(({ path, text }) =>
      text.split("\n").flatMap((line, i) =>
        /\bborder-[lr]-[2-9]\b/.test(line) && !/\bborder-border\b/.test(line) ? [`${path}:${i + 1}`] : [],
      ),
    );
    expect(stripes).toEqual([]);
  });
});
