#!/usr/bin/env node
import { runCli } from "./run";

void runCli().then((code) => {
  process.exitCode = code;
});
