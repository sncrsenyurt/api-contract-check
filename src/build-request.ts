import type { Operation, OperationParam } from "./operations.js";

export type CallSetup = {
  baseUrl: string;
  headers: { name: string; value: string }[];
  timeoutMs: number;
};

export type BuiltRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
};

export function buildRequest(op: Operation, setup: CallSetup): BuiltRequest {
  const headers: Record<string, string> = {};
  const query: [string, string][] = [];
  let path = op.path;

  for (const param of op.parameters) {
    if (param.in === "path") {
      const text = pathText(valueForParam(param));
      path = path.split(`{${param.name}}`).join(encodeURIComponent(text));
      continue;
    }

    const value = valueForParam(param);
    if (value === undefined) continue;

    if (param.in === "query") {
      for (const item of queryPairs(param.name, value)) query.push(item);
    } else if (param.in === "header") {
      writeHeader(headers, param.name, headerText(value));
    }
  }

  let body: string | undefined;
  const built = bodyFor(op.requestBody);
  if (built) {
    body = built.data;
    writeHeader(headers, "Content-Type", built.type);
  }

  for (const header of setup.headers) {
    writeHeader(headers, header.name, header.value);
  }

  return {
    method: op.method.toUpperCase(),
    url: joinUrl(setup.baseUrl, path, query),
    headers,
    body,
    timeoutMs: setup.timeoutMs,
  };
}

function valueForParam(param: OperationParam): unknown {
  if (param.example !== undefined) return param.example;

  const listed = firstExample(param.examples);
  if (listed !== undefined) return listed;

  if (param.content !== undefined) {
    const picked = pickMedia(param.content);
    if (picked) {
      const value = mediaValue(picked.media);
      if (value !== undefined) return value;
    }
  }

  if (param.schema !== undefined) return sample(param.schema, new Set());
  return undefined;
}

function bodyFor(
  requestBody: Record<string, unknown> | undefined,
): { type: string; data: string } | undefined {
  if (!requestBody || !isRecord(requestBody.content)) return undefined;
  const picked = pickMedia(requestBody.content);
  if (!picked) return undefined;

  const value = mediaValue(picked.media);
  if (value === undefined) return undefined;

  const json = picked.type.includes("json");
  const data = typeof value === "string" && !json ? value : JSON.stringify(value);
  return { type: picked.type, data };
}

function pickMedia(content: unknown): { type: string; media: unknown } | undefined {
  if (!isRecord(content)) return undefined;
  const entries = Object.entries(content);
  const json = entries.find(([type]) => bareType(type) === "application/json");
  const chosen = json ?? entries[0];
  if (!chosen) return undefined;
  return { type: bareType(chosen[0]), media: chosen[1] };
}

function mediaValue(media: unknown): unknown {
  if (!isRecord(media)) return undefined;
  if ("example" in media) return media.example;

  const listed = firstExample(media.examples);
  if (listed !== undefined) return listed;
  if (media.schema !== undefined) return sample(media.schema, new Set());
  return undefined;
}

function firstExample(examples: unknown): unknown {
  if (!isRecord(examples)) return undefined;
  for (const entry of Object.values(examples)) {
    if (isRecord(entry) && "value" in entry) return entry.value;
  }
  return undefined;
}

function sample(schema: unknown, seen: Set<object>): unknown {
  if (!isRecord(schema)) return "string";
  if (typeof schema.$ref === "string") return "string";
  if (seen.has(schema)) return cycled(schema);
  if ("example" in schema) return schema.example;
  if ("default" in schema) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];

  seen.add(schema);
  try {
    if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) return sample(schema.oneOf[0], seen);
    if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) return sample(schema.anyOf[0], seen);
    if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
      const parts = schema.allOf.map((part) => sample(part, seen));
      if (parts.every((part) => isRecord(part))) return Object.assign({}, ...parts);
      const first = parts.find((part) => part !== undefined);
      if (first !== undefined) return first;
    }
    return sampleType(schema, seen);
  } finally {
    seen.delete(schema);
  }
}

function sampleType(schema: Record<string, unknown>, seen: Set<object>): unknown {
  const type = primaryType(schema);
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "null") return null;
  if (type === "array" || (type === undefined && schema.items !== undefined)) {
    if (schema.items === undefined) return [];
    return [sample(schema.items, seen)];
  }
  if (type === "object" || type === undefined) {
    if (type === "object" || isRecord(schema.properties) || Array.isArray(schema.required)) {
      return objectSample(schema, seen);
    }
  }
  if (type === "string" || type === undefined) return stringSample(schema);
  return stringSample(schema);
}

function objectSample(schema: Record<string, unknown>, seen: Set<object>): Record<string, unknown> {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === "string")
      : [],
  );
  const out: Record<string, unknown> = {};

  for (const [key, prop] of Object.entries(properties)) {
    if (!isRecord(prop)) continue;
    const hinted =
      "example" in prop ||
      "default" in prop ||
      (Array.isArray(prop.enum) && prop.enum.length > 0);
    if (!required.has(key) && !hinted) continue;
    out[key] = sample(prop, seen);
  }

  return out;
}

function stringSample(schema: Record<string, unknown>): string {
  switch (schema.format) {
    case "date":
      return "2020-01-01";
    case "date-time":
      return "2020-01-01T00:00:00Z";
    case "email":
      return "user@example.com";
    case "uuid":
      return "00000000-0000-4000-8000-000000000000";
    case "uri":
      return "https://example.com";
    default:
      return "string";
  }
}

function cycled(schema: Record<string, unknown>): unknown {
  const type = primaryType(schema);
  if (type === "array") return [];
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "null") return null;
  if (type === "object" || isRecord(schema.properties)) return {};
  return "string";
}

function primaryType(schema: Record<string, unknown>): string | undefined {
  const raw = schema.type;
  const list =
    typeof raw === "string"
      ? [raw]
      : Array.isArray(raw)
        ? raw.filter((type): type is string => typeof type === "string")
        : [];
  return list.find((type) => type !== "null") ?? list[0];
}

function pathText(value: unknown): string {
  if (value === undefined || value === null) return "string";
  return String(value);
}

function headerText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function queryPairs(name: string, value: unknown): [string, string][] {
  if (Array.isArray(value)) return value.flatMap((item) => queryPairs(name, item));
  if (typeof value === "string") return [[name, value]];
  if (typeof value === "number" || typeof value === "boolean") return [[name, String(value)]];
  if (value === null || value === undefined) return [];
  return [[name, JSON.stringify(value)]];
}

function joinUrl(baseUrl: string, path: string, query: [string, string][]): string {
  const url = new URL(baseUrl);
  const prefix = url.pathname.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  url.pathname = `${prefix}${suffix}` || "/";
  url.search = "";
  url.hash = "";
  for (const [key, value] of query) url.searchParams.append(key, value);
  return url.toString();
}

function writeHeader(headers: Record<string, string>, name: string, value: string): void {
  const previous = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  if (previous && previous !== name) delete headers[previous];
  headers[name] = value;
}

function bareType(value: string): string {
  return value.split(";")[0].trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
