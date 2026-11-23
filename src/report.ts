import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CallResult } from "./run-calls.js";

export type RunOperation = {
  method: string;
  path: string;
  operationId: string;
  status: number | null;
  pass: boolean;
  errors: { path: string; message: string }[];
  durationMs: number;
};

export type RunRecord = {
  spec: string;
  baseUrl: string;
  openapi: string;
  startedAt: string;
  durationMs: number;
  passed: number;
  failed: number;
  errors: number;
  operations: RunOperation[];
};

export function recordFromCalls(
  meta: {
    spec: string;
    baseUrl: string;
    openapi: string;
    startedAt: string;
    durationMs: number;
  },
  calls: CallResult[],
): RunRecord {
  let passed = 0;
  let failed = 0;
  let errors = 0;
  const operations = calls.map((call) => {
    if (call.ok) passed += 1;
    else if (call.status === undefined) errors += 1;
    else failed += 1;
    return {
      method: call.method.toUpperCase(),
      path: call.path,
      operationId: call.operationId,
      status: call.status ?? null,
      pass: call.ok,
      errors: call.errors,
      durationMs: call.durationMs,
    };
  });
  return { ...meta, passed, failed, errors, operations };
}

export function summaryLines(record: RunRecord): string[] {
  const lines = record.operations.map((op) => {
    if (op.status === null) return `${op.method} ${op.path}  ${op.operationId}  error`;
    return `${op.method} ${op.path}  ${op.operationId}  ${op.status}  ${op.pass ? "pass" : "fail"}`;
  });
  const errorWord = record.errors === 1 ? "error" : "errors";
  lines.push(`${record.passed} pass, ${record.failed} fail, ${record.errors} ${errorWord}`);
  return lines;
}

export function exitCodeFor(record: RunRecord): 0 | 1 | 2 {
  if (record.errors > 0) return 1;
  if (record.failed > 0) return 2;
  return 0;
}

export async function writeReport(dir: string, record: RunRecord): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = join(dir, "report.json");
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}
