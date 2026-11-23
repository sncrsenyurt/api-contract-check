import { request, type APIRequestContext } from "playwright";
import { buildRequest, type CallSetup } from "./build-request.js";
import type { Operation } from "./operations.js";
import { checkAgainstSchema } from "./schema-check.js";

export type CallError = {
  path: string;
  message: string;
};

export type CallResult = {
  operationId: string;
  method: string;
  path: string;
  status?: number;
  ok: boolean;
  errors: CallError[];
  durationMs: number;
};

export async function runCalls(ops: Operation[], setup: CallSetup): Promise<CallResult[]> {
  const ctx = await request.newContext();
  const results: CallResult[] = [];
  try {
    for (const op of ops) {
      results.push(await callOne(ctx, op, setup));
    }
    return results;
  } finally {
    await ctx.dispose();
  }
}

export function checkResponse(
  op: Operation,
  status: number,
  contentType: string,
  rawBody: string,
): CallError[] {
  const response = responseFor(op.responses, status);
  if (!response) return [{ path: "status", message: `${status} is not documented` }];

  const content = isRecord(response.content) ? response.content : undefined;
  if (!content) return [];

  const actual = bareType(contentType);
  const match = Object.entries(content).find(([type]) => bareType(type) === actual);
  if (!match) {
    return [{ path: "content-type", message: `${actual || "missing"} is not documented` }];
  }

  const media = match[1];
  const schema = isRecord(media) ? media.schema : undefined;
  if (schema === undefined) return [];

  if (actual.includes("json")) {
    let parsed: unknown;
    try {
      parsed = rawBody === "" ? null : JSON.parse(rawBody);
    } catch {
      return [{ path: "body", message: "response body is not json" }];
    }
    return checkAgainstSchema(parsed, schema);
  }

  return checkAgainstSchema(rawBody, schema);
}

async function callOne(
  ctx: APIRequestContext,
  op: Operation,
  setup: CallSetup,
): Promise<CallResult> {
  const built = buildRequest(op, setup);
  const base = {
    operationId: op.operationId,
    method: op.method,
    path: op.path,
  };
  const started = performance.now();

  try {
    const res = await ctx.fetch(built.url, {
      method: built.method,
      headers: built.headers,
      timeout: built.timeoutMs,
      ...(built.body !== undefined ? { data: built.body } : {}),
    });
    const status = res.status();
    const contentType = res.headers()["content-type"] ?? "";
    const rawBody = await res.text();
    const errors = checkResponse(op, status, contentType, rawBody);
    return {
      ...base,
      status,
      ok: errors.length === 0,
      errors,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    return {
      ...base,
      ok: false,
      errors: [{ path: "request", message: safeLine(err) }],
      durationMs: Math.round(performance.now() - started),
    };
  }
}

function responseFor(
  responses: Record<string, unknown>,
  status: number,
): Record<string, unknown> | undefined {
  const exact = responses[String(status)];
  if (isRecord(exact)) return exact;

  const range = `${Math.floor(status / 100)}xx`;
  for (const [key, value] of Object.entries(responses)) {
    if (key.toLowerCase() === range && isRecord(value)) return value;
  }

  if (isRecord(responses.default)) return responses.default;
  return undefined;
}

function bareType(value: string): string {
  return value.split(";")[0].trim().toLowerCase();
}

function safeLine(err: unknown): string {
  const message = err instanceof Error ? err.message : "request failed";
  const line = message.split("\n")[0] ?? "request failed";
  if (/authorization|bearer|token/i.test(line)) return "request failed";
  return line;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
