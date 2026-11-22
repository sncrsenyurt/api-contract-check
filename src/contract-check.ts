#!/usr/bin/env node
import { FlagError, parseFlags, usage } from "./flags.js";
import { listOperations } from "./operations.js";
import { runCalls } from "./run-calls.js";
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
    const results = await runCalls(ops, {
      baseUrl: parsed.baseUrl,
      headers: parsed.headers,
      timeoutMs: parsed.timeoutMs,
    });
    const version = String(doc.openapi);
    const noun = ops.length === 1 ? "operation" : "operations";
    console.log(`loaded ${version}, ${ops.length} ${noun}`);
    for (const result of results) {
      const status = result.status === undefined ? "" : `  ${result.status}`;
      const mark = result.ok ? "ok" : result.status === undefined ? "error" : "drift";
      console.log(
        `${result.method.toUpperCase()} ${result.path}  ${result.operationId}${status}  ${mark}`,
      );
      for (const message of result.messages) console.log(`  ${message}`);
    }
  } catch (err) {
    if (err instanceof SpecError) {
      console.error(err.message);
      process.exitCode = 1;
      return;
    }
    const line = err instanceof Error ? err.message.split("\n")[0] : "request failed";
    console.error(/authorization|bearer|token/i.test(line) ? "request failed" : line);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  const line = err instanceof Error ? err.message.split("\n")[0] : "request failed";
  console.error(/authorization|bearer|token/i.test(line) ? "request failed" : line);
  process.exit(1);
});
