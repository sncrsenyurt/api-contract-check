#!/usr/bin/env node
import { FlagError, parseFlags, usage } from "./flags.js";
import { loadSpec, SpecError } from "./spec.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  let parsed;
  try {
    parsed = parseFlags(argv);
  } catch (err) {
    if (err instanceof FlagError) {
      console.error(err.message);
      console.error("");
      console.error(usage());
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  if (parsed.help) {
    console.log(usage());
    return;
  }

  let doc: Record<string, unknown>;
  try {
    doc = await loadSpec(parsed.spec);
  } catch (err) {
    if (err instanceof SpecError) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const version = String(doc.openapi);
  const count = pathCount(doc);
  const noun = count === 1 ? "path" : "paths";
  console.log(`loaded ${version}, ${count} ${noun}`);
}

function pathCount(doc: Record<string, unknown>): number {
  const paths = doc.paths;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) return 0;
  return Object.keys(paths).length;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
