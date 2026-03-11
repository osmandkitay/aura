import fs from "node:fs";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dirname, "..");
const schemaDir = path.join(packageRoot, "schema");
const distDir = path.join(packageRoot, "dist");

fs.mkdirSync(distDir, { recursive: true });

for (const filename of fs.readdirSync(schemaDir)) {
  if (!filename.endsWith(".json")) {
    continue;
  }

  fs.copyFileSync(path.join(schemaDir, filename), path.join(distDir, filename));
}
