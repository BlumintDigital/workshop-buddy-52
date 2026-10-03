// Records the short product walkthrough used in the landing page hero, from staging.
//
//   node scripts/record-hero-video.mjs [outDir]
//
// Signs in to staging.shoplane.uk as the smoke-check admin (.env.staging.e2e and
// e2e/.state/mfa-secrets.staging.json, written by scripts/setup-staging-e2e.mjs), clicks through a
// fixed script with a visible cursor, and encodes hero.mp4, hero.webm and hero-poster.jpg with
// ffmpeg. Navigation only: it doesn't change data or send anything, so it can be re-run any time
// the product changes.

import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const OUT = resolve(process.argv[2] ?? "hero-video");
const W = 1440;
const H = 900;

// ---------------------------------------------------------------- accounts
const env = Object.fromEntries(
  readFileSync(".env.staging.e2e", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const SITE = env.E2E_BASE_URL;
const EMAIL = env.E2E_ADMIN_EMAIL;
const PASSWORD = env.E2E_ADMIN_PASSWORD;
const SECRET = JSON.parse(readFileSync("e2e/.state/mfa-secrets.staging.json", "utf8"))[EMAIL]?.secret;
if (!SITE || !EMAIL || !PASSWORD || !SECRET) throw new Error("Run scripts/setup-staging-e2e.mjs first.");

function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

// ---------------------------------------------------------------- a cursor people can see
// Browsers don't record the real pointer, so draw one that follows the mouse, with a ripple on click.
const CURSOR = () => {
  const install = () => {
    if (document.getElementById("__cursor")) return;
    const c = document.createElement("div");
    c.id = "__cursor";
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 8.5-6.6 1.6L9.2 19z" fill="#121613" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", transform: "translate(-100px,-100px)" });
    const ring = document.createElement("div");
    Object.assign(ring.style, { position: "fixed", width: "34px", height: "34px", margin: "-17px 0 0 -17px", borderRadius: "50%", background: "rgba(46,106,76,.28)", pointerEvents: "none", zIndex: "2147483646", opacity: "0" });
    document.documentElement.append(c, ring);
    addEventListener("mousemove", (e) => { c.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`; }, true);
    addEventListener("mousedown", (e) => {
      ring.style.left = `${e.clientX}px`;
      ring.style.top = `${e.clientY}px`;
      ring.animate([{ opacity: 1, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.6)" }], { duration: 450, easing: "ease-out" });
    }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install);
  else install();
};

// ---------------------------------------------------------------- record
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(join(OUT, f), { recursive: true, force: true });
const browser = await chromium.launch({ channel: "chrome" });

// Sign in first, outside the recording.
const signIn = await browser.newContext({ viewport: { width: W, height: H } });
const sp = await signIn.newPage();
await sp.goto(`${SITE}/auth`);
await sp.locator("#login-email").fill(EMAIL);
await sp.locator("#login-password").fill(PASSWORD);
await sp.getByRole("button", { name: "Sign In" }).click();
await sp.locator("input[data-input-otp]").fill(totp(SECRET));
await sp.getByRole("button", { name: "Verify", exact: true }).click();
await sp.waitForURL(/\/admin\/dashboard/, { timeout: 30_000 });
const state = await signIn.storageState();
await signIn.close();

const ctx = await browser.newContext({ viewport: { width: W, height: H }, storageState: state, recordVideo: { dir: join(OUT, "raw"), size: { width: W, height: H } } });
await ctx.addInitScript(CURSOR);
const page = await ctx.newPage();
let mx = W * 0.62;
let my = H * 0.55;
const pause = (ms) => page.waitForTimeout(ms);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
async function moveTo(target, ms = 650) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Couldn't find something to click; the script needs updating for the current screens.");
  const x = box.x + Math.min(box.width / 2, 120);
  const y = box.y + box.height / 2;
  const steps = Math.round(ms / 16);
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps);
    await page.mouse.move(mx + (x - mx) * t, my + (y - my) * t);
    await pause(16);
  }
  mx = x;
  my = y;
}
async function click(target, ms) {
  await moveTo(target, ms);
  await pause(180);
  await page.mouse.down();
  await pause(90);
  await page.mouse.up();
}
const settle = async (ms) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await pause(ms);
};

const startedAt = Date.now();
await page.goto(`${SITE}/admin/dashboard`);
await page.getByRole("heading", { name: "Today", exact: true }).waitFor();
await settle(0);
const loadedAfter = (Date.now() - startedAt) / 1000;
await page.mouse.move(mx, my);
await pause(1600);

// 1. Something needs attention: the overdue invoices.
await moveTo(page.getByText(/invoices? overdue/i).first(), 800);
await pause(500);
await click(page.getByRole("link", { name: "View invoices" }).or(page.getByRole("button", { name: "View invoices" })).first(), 450);
await page.getByText(/INV-/).first().waitFor();
await settle(1700);

// 2. The projects board, then one job and its tasks.
await click(page.getByRole("link", { name: /^Projects$/ }).first(), 750);
await page.getByText("Electric motor rewind").first().waitFor();
await settle(1200);
await click(page.getByText("Electric motor rewind").first(), 750);
await page.getByRole("heading", { name: "Tasks" }).first().waitFor();
await settle(1300);
await page.mouse.wheel(0, 420);
await pause(1600);

// 3. Back to Today, so the clip loops cleanly.
await click(page.getByRole("link", { name: /^Today$/ }).first(), 800);
await page.getByRole("heading", { name: "Today", exact: true }).waitFor();
await settle(1400);
const endedAfter = (Date.now() - startedAt) / 1000;

const video = page.video();
await ctx.close();
await browser.close();
const raw = await video.path();

// ---------------------------------------------------------------- encode
// Start once Today has loaded, so the loop opens on a settled screen.
const start = String((loadedAfter + 0.3).toFixed(2));
const length = String((endedAfter - loadedAfter - 0.5).toFixed(2));
const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
const scale = "fps=30,scale=1440:-2:flags=lanczos";
ff(["-ss", start, "-t", length, "-i", raw, "-vf", scale, "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", join(OUT, "hero.mp4")]);
ff(["-ss", start, "-t", length, "-i", raw, "-vf", scale, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-row-mt", "1", "-an", join(OUT, "hero.webm")]);
ff(["-ss", "0.5", "-i", join(OUT, "hero.mp4"), "-frames:v", "1", "-q:v", "3", join(OUT, "hero-poster.jpg")]);
for (const f of ["hero.mp4", "hero.webm", "hero-poster.jpg"]) console.log(`${f}: ${(statSync(join(OUT, f)).size / 1024).toFixed(0)} KB`);
rmSync(join(OUT, "raw"), { recursive: true, force: true });
