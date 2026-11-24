#!/usr/bin/env node
import { diffDocuments, formatDiff } from "./diff-specs.js";
import { FlagError, parseDiffArgs, parseFlags, usage } from "./flags.js";
import { listOperations } from "./operations.js";
import { pickOperations, selectionError } from "./pick-ops.js";
import { exitCodeFor, recordFromCalls, summaryLines, writeReport } from "./report.js";
import { runCalls } from "./run-calls.js";
import { loadSpec, SpecError } from "./spec.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  try {
    if (argv[0] === "diff") {
      await runDiff(argv.slice(1));
      return;
    }
    await runCheck(argv);
  } catch (err) {
    if (err instanceof FlagError) {
      console.error(err.message);
      console.error("");
      console.error(usage());
      process.exitCode = 1;
      return;
    }
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

async function runDiff(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return;
  }
  const { oldSpec, newSpec } = parseDiffArgs(argv);
  const oldDoc = await loadSpec(oldSpec);
  const newDoc = await loadSpec(newSpec);
  const changes = diffDocuments(oldDoc, newDoc);
  for (const line of formatDiff(changes)) console.log(line);
  process.exitCode = changes.length === 0 ? 0 : 2;
}

async function runCheck(argv: string[]): Promise<void> {
  const parsed = parseFlags(argv);
  if (parsed.help) {
    console.log(usage());
    return;
  }

  const doc = await loadSpec(parsed.spec);
  const listed = listOperations(doc);
  const missed = selectionError(listed, parsed.only, parsed.skip);
  if (missed) {
    console.error(missed);
    process.exitCode = 1;
    return;
  }

  const startedAt = new Date();
  const results = await runCalls(pickOperations(listed, parsed.only, parsed.skip), {
    baseUrl: parsed.baseUrl,
    headers: parsed.headers,
    timeoutMs: parsed.timeoutMs,
  });
  const record = recordFromCalls(
    {
      spec: parsed.spec,
      baseUrl: parsed.baseUrl,
      openapi: String(doc.openapi),
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
    },
    results,
  );
  await writeReport(parsed.outDir, record);
  for (const line of summaryLines(record)) console.log(line);
  process.exitCode = exitCodeFor(record);
}

main().catch((err: unknown) => {
  const line = err instanceof Error ? err.message.split("\n")[0] : "request failed";
  console.error(/authorization|bearer|token/i.test(line) ? "request failed" : line);
  process.exit(1);
});
