#!/usr/bin/env node
import { FlagError, parseFlags, usage } from "./flags.js";
import { listOperations } from "./operations.js";
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

  try {
    const doc = await loadSpec(parsed.spec);
    const ops = listOperations(doc);
    const version = String(doc.openapi);
    const noun = ops.length === 1 ? "operation" : "operations";
    console.log(`loaded ${version}, ${ops.length} ${noun}`);
    for (const op of ops) {
      console.log(`${op.method.toUpperCase()} ${op.path}  ${op.operationId}`);
    }
  } catch (err) {
    if (err instanceof SpecError) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
