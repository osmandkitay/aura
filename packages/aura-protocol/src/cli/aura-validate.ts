#!/usr/bin/env node
import { runCli } from "./run";

void runCli(["validate", ...process.argv.slice(2)]).then((code) => {
  process.exitCode = code;
});
