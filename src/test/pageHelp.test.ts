import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { guideSlug } from "@/lib/guideAnchors";
import { PAGE_HELP, WORKFLOW_STAGES, findPageHelp } from "@/lib/pageHelp";

const root = resolve(__dirname, "../..");
const guide = readFileSync(resolve(root, "docs/user-guide.md"), "utf8");
const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");

// Same anchors /help renders: ## and ### headings, without their {roles: …} tag.
const guideAnchors = new Set(
  guide
    .split("\n")
    .filter((line) => /^#{2,3} /.test(line))
    .map((line) => guideSlug(line.replace(/^#{2,3} /, "").replace(/\s*\{roles:[^}]*\}\s*$/i, ""))),
);
const appRoutes = new Set([...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]));

describe("page help", () => {
  it("links every role's help to a real section of the user guide", () => {
    for (const entry of PAGE_HELP) {
      for (const [role, help] of Object.entries(entry.roles)) {
        expect(guideAnchors, `${entry.key} (${role}) → "${help!.guideHeading}"`).toContain(guideSlug(help!.guideHeading));
      }
    }
  });

  it("only covers routes the app actually has", () => {
    for (const entry of PAGE_HELP) {
      for (const route of entry.routes) expect(appRoutes, `${entry.key}: ${route}`).toContain(route);
    }
  });

  it("uses unique keys that the usage log accepts", () => {
    const keys = PAGE_HELP.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z0-9-]{1,48}$/);
  });

  it("only highlights real project stages", () => {
    for (const entry of PAGE_HELP) {
      for (const help of Object.values(entry.roles)) {
        for (const stage of help!.stages) expect(WORKFLOW_STAGES).toContain(stage);
        expect(help!.actions.length).toBeGreaterThan(0);
      }
    }
  });

  it("finds the right help for a page and role", () => {
    expect(findPageHelp("/projects/7d33daea-1afc-4e9d-bb50-b2ab75c5e3e7", "staff")?.entry.key).toBe("project");
    expect(findPageHelp("/manager/dashboard", "manager")?.help.guideHeading).toBe("5.1 Today");
    expect(findPageHelp("/client/invoices", "client")?.entry.key).toBe("invoices");
    // Pages without help, and roles a page has no help for, get no button.
    expect(findPageHelp("/admin/settings", "admin")).toBeNull();
    expect(findPageHelp("/reception", "client")).toBeNull();
    expect(findPageHelp("/projects/abc", null)).toBeNull();
  });
});
