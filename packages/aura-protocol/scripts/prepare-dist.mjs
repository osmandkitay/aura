import fs from "node:fs";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dirname, "..");
const schemaDir = path.join(packageRoot, "schema");
const distDir = path.join(packageRoot, "dist");

fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(path.resolve(packageRoot, "..", "..", "LICENSE"), path.join(distDir, "LICENSE"));
fs.copyFileSync(path.resolve(packageRoot, "..", "..", "docs/spec/aura-v2-core.md"), path.join(distDir, "SPEC.md"));
fs.copyFileSync(path.resolve(packageRoot, "..", "..", "docs/migration/v1-to-v2-plan.md"), path.join(distDir, "MIGRATION.md"));

for (const filename of fs.readdirSync(schemaDir)) {
  if (!filename.endsWith(".json")) {
    continue;
  }

  fs.copyFileSync(path.join(schemaDir, filename), path.join(distDir, filename));
}
