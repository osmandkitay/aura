import fs from "node:fs";
import path from "node:path";
import type { AuraConfig } from "../../packages/aura-protocol/src";
export function fixture(): { source: any; config: AuraConfig } {
  const directory = path.resolve(__dirname, "../../examples/minimal-site");
  return {
    source: JSON.parse(fs.readFileSync(path.join(directory, "source/openapi.json"), "utf8")),
    config: JSON.parse(fs.readFileSync(path.join(directory, "aura.config.json"), "utf8"))
  };
}
