/**
 * Product-version check for the backend package.
 *
 * Dual-repo layout:
 * - Monorepo root (`journal`): SSOT is ../shared/product-version.json;
 *   this script delegates to ../scripts/sync-product-version.mjs --check.
 * - Standalone `journal-backend` clone: parent scripts/shared are absent;
 *   only assert that src/constant/productVersion.generated.ts exists
 *   (must be committed after syncing in the monorepo nest).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");
const GENERATED = path.join(
  BACKEND_ROOT,
  "src",
  "constant",
  "productVersion.generated.ts",
);
const MONOREPO_SYNC = path.resolve(
  BACKEND_ROOT,
  "..",
  "scripts",
  "sync-product-version.mjs",
);

function assertGeneratedExists() {
  if (!fs.existsSync(GENERATED)) {
    console.error(
      "[product-version] missing src/constant/productVersion.generated.ts",
    );
    console.error(
      "In monorepo nest: pnpm sync:product-version (or cd backend; pnpm generated:product-version), then commit this file to journal-backend.",
    );
    process.exit(1);
  }
  const text = fs.readFileSync(GENERATED, "utf8");
  if (!/PRODUCT_VERSION\s*=/.test(text)) {
    console.error(
      "[product-version] generated file missing PRODUCT_VERSION export",
    );
    process.exit(1);
  }
}

if (fs.existsSync(MONOREPO_SYNC)) {
  const result = spawnSync(
    process.execPath,
    ["--no-warnings", MONOREPO_SYNC, "--check"],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}

assertGeneratedExists();
console.log(
  "[product-version] standalone backend repo: generated file present (SSOT sync skipped)",
);
