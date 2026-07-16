/**
 * Regenerate product version outputs (system.js + generated.ts).
 * Only works in monorepo nest (parent ../scripts + ../shared must exist).
 * Standalone journal-backend: commit the already-synced generated.ts; do not run this.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");
const MONOREPO_SYNC = path.resolve(
  BACKEND_ROOT,
  "..",
  "scripts",
  "sync-product-version.mjs",
);

if (!fs.existsSync(MONOREPO_SYNC)) {
  console.error(
    "[product-version] cannot sync from standalone journal-backend clone.",
  );
  console.error(
    "In monorepo nest at repo root: pnpm sync:product-version",
  );
  console.error(
    "Then commit backend/src/constant/productVersion.generated.ts to journal-backend.",
  );
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--no-warnings", MONOREPO_SYNC, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
