import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exitCodeFor, recordFromCalls, summaryLines, writeReport } from "../src/report.js";
import type { CallResult } from "../src/run-calls.js";

const meta = {
  spec: "shop.yaml",
  baseUrl: "http://127.0.0.1:9",
  openapi: "3.0.3",
  startedAt: "2026-11-23T04:42:00.000Z",
  durationMs: 40,
};

function call(partial: Partial<CallResult> & Pick<CallResult, "operationId" | "ok">): CallResult {
  return {
    method: "get",
    path: "/health",
    status: 200,
    errors: [],
    durationMs: 5,
    ...partial,
  };
}

describe("recordFromCalls", () => {
  it("counts passes, drifts, and unreachable calls", () => {
    const record = recordFromCalls(meta, [
      call({ operationId: "getHealth", ok: true }),
      call({
        operationId: "getOrder",
        path: "/orders/{id}",
        ok: false,
        errors: [{ path: "body.total", message: "expected number, got string" }],
        durationMs: 8,
      }),
      call({
        operationId: "getGone",
        path: "/gone",
        ok: false,
        status: undefined,
        errors: [{ path: "request", message: "connect ECONNREFUSED" }],
        durationMs: 2,
      }),
    ]);

    expect(record.passed).toBe(1);
    expect(record.failed).toBe(1);
    expect(record.errors).toBe(1);
    expect(record.operations[1]).toMatchObject({
      method: "GET",
      path: "/orders/{id}",
      status: 200,
      pass: false,
      durationMs: 8,
      errors: [{ path: "body.total", message: "expected number, got string" }],
    });
    expect(record.operations[2].status).toBeNull();
    expect(exitCodeFor(record)).toBe(1);
  });

  it("exits 0 when every call passes and 2 on drift", () => {
    const clean = recordFromCalls(meta, [call({ operationId: "getHealth", ok: true })]);
    const drift = recordFromCalls(meta, [
      call({
        operationId: "getOrder",
        ok: false,
        errors: [{ path: "status", message: "500 is not documented" }],
      }),
    ]);
    expect(exitCodeFor(clean)).toBe(0);
    expect(exitCodeFor(drift)).toBe(2);
  });

  it("prints one line per operation and a totals line", () => {
    const record = recordFromCalls(meta, [
      call({ operationId: "getHealth", ok: true, durationMs: 4 }),
      call({
        operationId: "getOrder",
        path: "/orders/{id}",
        ok: false,
        errors: [{ path: "body.total", message: "expected number, got string" }],
      }),
    ]);
    expect(summaryLines(record)).toEqual([
      "GET /health  getHealth  200  pass",
      "GET /orders/{id}  getOrder  200  fail",
      "1 pass, 1 fail, 0 errors",
    ]);
  });

  it("writes report.json under --out", async () => {
    const dir = await mkdtemp(join(tmpdir(), "contract-out-"));
    const record = recordFromCalls(meta, [call({ operationId: "getHealth", ok: true })]);
    const file = await writeReport(dir, record);
    const saved = JSON.parse(await readFile(file, "utf8")) as typeof record;
    expect(file.endsWith("report.json")).toBe(true);
    expect(saved).toMatchObject({
      spec: "shop.yaml",
      baseUrl: "http://127.0.0.1:9",
      openapi: "3.0.3",
      startedAt: meta.startedAt,
      passed: 1,
      failed: 0,
      errors: 0,
    });
    expect(saved.operations).toHaveLength(1);
  });
});
