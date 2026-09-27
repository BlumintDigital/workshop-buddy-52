import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every edge function checks its caller itself and several are called before
// sign-in, so each must be deployed with the platform JWT check off, in both
// the production config and the local test database's config.
const ROOT = join(__dirname, "..", "..");
const functions = readdirSync(join(ROOT, "supabase", "functions")).filter(
  (name) => !name.startsWith("_") && statSync(join(ROOT, "supabase", "functions", name)).isDirectory(),
);

function jwtOff(configPath: string): string[] {
  const text = readFileSync(join(ROOT, configPath), "utf8");
  return [...text.matchAll(/\[functions\.([\w-]+)\]\s*\n\s*verify_jwt\s*=\s*false/g)].map((m) => m[1]);
}

describe("edge function config", () => {
  it.each(["supabase/config.toml", "supabase-test/supabase/config.toml"])("%s turns the JWT check off for every function", (config) => {
    expect(functions.filter((f) => !jwtOff(config).includes(f))).toEqual([]);
  });
});
