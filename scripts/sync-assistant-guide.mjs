// Copies docs/user-guide.md into the assistant edge function, which can only read files in its
// own folder once deployed. Run after editing the guide: npm run docs:assistant-guide
// (src/test/assistant.test.ts fails while the copy is out of date).
import { readFileSync, writeFileSync } from "node:fs";

const guide = readFileSync(new URL("../docs/user-guide.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
writeFileSync(
  new URL("../supabase/functions/assistant/guide.ts", import.meta.url),
  `// Generated from docs/user-guide.md by scripts/sync-assistant-guide.mjs. Don't edit by hand.\nexport const GUIDE_MARKDOWN = ${JSON.stringify(guide)};\n`,
);
console.log("Updated supabase/functions/assistant/guide.ts");
