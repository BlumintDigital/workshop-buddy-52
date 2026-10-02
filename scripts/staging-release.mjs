// Used by .github/workflows/staging.yml. Asks Shoplane Control to release one version to
// staging (database changes, server functions, website, health check), waits for it, and
// later reports whether the smoke checks passed, so Control knows the version is safe to release.
//
//   node scripts/staging-release.mjs release <sha> "<commit message>"
//   node scripts/staging-release.mjs result <sha> passed|failed "<detail>"
//
// Needs CONTROL_CI_TOKEN. CONTROL_OPERATIONS_URL defaults to Control's operations function.

const URL_ = process.env.CONTROL_OPERATIONS_URL || "https://libdxorzygsjswxriwgr.supabase.co/functions/v1/operations";
const TOKEN = process.env.CONTROL_CI_TOKEN;
if (!TOKEN) {
  console.error("CONTROL_CI_TOKEN is not set.");
  process.exit(1);
}

async function call(action, body = {}) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-ci-token": TOKEN },
    body: JSON.stringify({ action, ...body }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(out.error || `${action} failed (${res.status})`);
    e.status = res.status;
    e.body = out;
    throw e;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [, , cmd, sha, ...rest] = process.argv;

if (cmd === "release") {
  let runId;
  // Another release (a customer's) may be running; wait for it rather than fail.
  for (let i = 0; ; i++) {
    try {
      runId = (await call("ci.staging_release", { sha, message: rest.join(" ").slice(0, 300) })).run_id;
      break;
    } catch (e) {
      if (e.status !== 409 || i > 40) throw e;
      console.log("Another release is running; waiting…");
      await sleep(30_000);
    }
  }
  console.log(`Release run ${runId}`);
  const started = Date.now();
  let last = "";
  while (Date.now() - started < 35 * 60_000) {
    const { run } = await call("ci.advance", { run_id: runId });
    const now = run.steps.filter((s) => s.status !== "pending").map((s) => `${s.status === "done" ? "✓" : s.status === "failed" ? "✗" : "…"} ${s.label}${s.detail ? ` (${s.detail})` : ""}`).join("\n");
    if (now !== last) {
      console.log(`\n${now}`);
      last = now;
    }
    if (run.status === "succeeded") process.exit(0);
    if (run.status === "failed") {
      console.error(`\nThe release to staging stopped: ${run.error}`);
      process.exit(1);
    }
    await sleep(run.status === "waiting" ? 10_000 : 1_000);
  }
  console.error("The release to staging took longer than 35 minutes.");
  process.exit(1);
} else if (cmd === "result") {
  const [status, ...detail] = rest;
  await call("ci.staging_result", { sha, passed: status === "passed", detail: detail.join(" ").slice(0, 500) });
  console.log(`Told Control: ${sha.slice(0, 7)} ${status} on staging.`);
} else {
  console.error("Usage: staging-release.mjs release <sha> <message> | result <sha> passed|failed <detail>");
  process.exit(2);
}
