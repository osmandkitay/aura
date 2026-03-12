import { stableStringify } from "../canonical";
import { deriveFile } from "../derive";
import { publishFile } from "../publish";
import { defaultDeriveOutputPath } from "../filesystem";
import { validateFile } from "../validate";

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }

    const flagName = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[flagName] = next;
      index += 1;
    } else {
      flags[flagName] = true;
    }
  }

  return { positionals, flags };
}

function flagValue(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags[name];
  return typeof value === "string" ? value : undefined;
}

function hasFlag(parsed: ParsedArgs, name: string): boolean {
  return parsed.flags[name] === true;
}

function printHelp(): void {
  console.log(
    `aura-protocol

Small AURA 2.0 core compiler for local files.
Published AURA is consumed directly from /.well-known/aura.json without this CLI.

Commands:
  derive <input> [--out <file>] [--stdout]
  publish <input> --out <dir>
  validate <file>

Defaults:
  derive writes to a sibling .derived/aura-v2.json when --out is omitted.`
  );
}

function printCommandHelp(command: string): void {
  if (command === "derive") {
    console.log("derive <input> [--out <file>] [--stdout]");
    return;
  }

  if (command === "publish") {
    console.log("publish <input> --out <dir>");
    return;
  }

  if (command === "validate") {
    console.log("validate <file>");
    return;
  }

  printHelp();
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  if (rest.includes("--help") || rest.includes("-h")) {
    printCommandHelp(command);
    return 0;
  }

  const parsed = parseArgs(rest);

  try {
    if (command === "derive") {
      const input = parsed.positionals[0];
      if (!input) {
        throw new Error("derive requires an input file path.");
      }

      if (hasFlag(parsed, "stdout") && flagValue(parsed, "out")) {
        throw new Error("Use either --stdout or --out for derive, not both.");
      }

      const result = deriveFile(input, {
        outFile: flagValue(parsed, "out"),
        writeToDisk: !hasFlag(parsed, "stdout")
      });

      if (hasFlag(parsed, "stdout")) {
        process.stdout.write(stableStringify(result.document));
      } else {
        console.log(`Derived ${input} -> ${result.outFile}`);
      }

      return 0;
    }

    if (command === "publish") {
      const input = parsed.positionals[0];
      const outDirectory = flagValue(parsed, "out");
      if (!input || !outDirectory) {
        throw new Error("publish requires an input file and --out <dir>.");
      }

      const result = publishFile(input, outDirectory);
      console.log(`Published ${result.derived.actions.length} actions -> ${result.indexPath}`);
      return 0;
    }

    if (command === "validate") {
      const filePath = parsed.positionals[0];
      if (!filePath) {
        throw new Error("validate requires a file path.");
      }

      const result = validateFile(filePath);
      if (!result.valid) {
        console.error(`Invalid ${result.target} (${result.schemaPath})`);
        for (const error of result.errors) {
          console.error(`  - ${error}`);
        }
        return 1;
      }

      console.log(`Valid ${result.target} (${result.schemaPath})`);
      return 0;
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    if (command === "derive" && parsed.positionals[0]) {
      console.error(`Default output path would have been ${defaultDeriveOutputPath(parsed.positionals[0])}`);
    }
    return 1;
  }
}
