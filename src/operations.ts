import { resolveLocalRefs } from "./refs.js";
import { SpecError } from "./spec.js";

const METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

export type OperationParam = {
  name: string;
  in: string;
  required: boolean;
  schema?: unknown;
  content?: unknown;
  example?: unknown;
  examples?: unknown;
};

export type Operation = {
  method: string;
  path: string;
  operationId: string;
  parameters: OperationParam[];
  requestBody?: Record<string, unknown>;
  responses: Record<string, unknown>;
};

export function listOperations(doc: Record<string, unknown>): Operation[] {
  const resolved = resolveLocalRefs(doc);
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
    throw new SpecError("spec must be an object");
  }

  const paths = (resolved as Record<string, unknown>).paths;
  if (paths === undefined) return [];
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) {
    throw new SpecError("paths must be an object");
  }

  const used = new Set<string>();
  const ops: Operation[] = [];

  for (const [path, item] of Object.entries(paths as Record<string, unknown>)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const pathItem = item as Record<string, unknown>;
    const shared = readParams(pathItem.parameters);

    for (const [key, value] of Object.entries(pathItem)) {
      if (!METHODS.has(key)) continue;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;

      const raw = value as Record<string, unknown>;
      const op: Operation = {
        method: key,
        path,
        operationId: takeOperationId(raw.operationId, key, path, used),
        parameters: mergeParams(shared, readParams(raw.parameters)),
        responses: readResponses(raw.responses),
      };
      const body = readRequestBody(raw.requestBody);
      if (body) op.requestBody = body;
      ops.push(op);
    }
  }

  return ops;
}

function mergeParams(shared: OperationParam[], own: OperationParam[]): OperationParam[] {
  const merged = shared.slice();
  for (const param of own) {
    const at = merged.findIndex((item) => item.name === param.name && item.in === param.in);
    if (at === -1) merged.push(param);
    else merged[at] = param;
  }
  return merged;
}

function readParams(value: unknown): OperationParam[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new SpecError("parameters must be a list");
  return value.map(readParam);
}

function readParam(value: unknown): OperationParam {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SpecError("parameter must be an object");
  }

  const rec = value as Record<string, unknown>;
  if (typeof rec.name !== "string" || !rec.name) throw new SpecError("parameter is missing a name");
  if (typeof rec.in !== "string" || !rec.in) {
    throw new SpecError(`parameter ${rec.name} is missing in`);
  }

  const param: OperationParam = {
    name: rec.name,
    in: rec.in,
    required: rec.in === "path" ? true : rec.required === true,
  };
  if (rec.schema !== undefined) param.schema = rec.schema;
  if (rec.content !== undefined) param.content = rec.content;
  if (rec.example !== undefined) param.example = rec.example;
  if (rec.examples !== undefined) param.examples = rec.examples;
  return param;
}

function readRequestBody(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SpecError("requestBody must be an object");
  }
  return value as Record<string, unknown>;
}

function readResponses(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SpecError("responses must be an object");
  }
  return value as Record<string, unknown>;
}

function takeOperationId(value: unknown, method: string, path: string, used: Set<string>): string {
  if (typeof value === "string" && value.trim()) {
    const id = value.trim();
    used.add(id);
    return id;
  }

  const slug = path
    .replace(/[{}]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  const base = `${method}_${slug || "root"}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  const id = `${base}_${n}`;
  used.add(id);
  return id;
}
