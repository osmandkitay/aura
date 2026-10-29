import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve(import.meta.dirname, "..", "dist");
fs.rmSync(distDir, { recursive: true, force: true });
