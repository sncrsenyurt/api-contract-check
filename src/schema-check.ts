import { resolveLocalRefs } from "./refs.js";
import { SpecError } from "./spec.js";

const STRING_FORMATS = new Set(["date-time", "date", "email", "uuid", "uri"]);

export type SchemaError = {
  path: string;
  message: string;
};

export function checkAgainstSchema(
  value: unknown,
  schema: unknown,
  rootPath = "body",
): SchemaError[] {
  let use = schema;
  try {
    use = resolveLocalRefs(schema);
  } catch (err) {
    if (err instanceof SpecError) return [{ path: rootPath, message: err.message }];
    throw err;
  }
  return checkNode(value, use, rootPath);
}

function checkNode(value: unknown, schema: unknown, path: string): SchemaError[] {
  if (!isRecord(schema)) return [{ path, message: "schema is not an object" }];

  if (typeof schema.$ref === "string") {
    return [{ path, message: `unresolved ref ${schema.$ref}` }];
  }

  if (value === null) return checkNull(schema, path);

  const types = typeNames(schema);
  if (types.length > 0 && !types.some((type) => matchesType(value, type))) {
    return [{ path, message: `expected ${phrase(types)}, got ${describeValue(value)}` }];
  }

  const errors: SchemaError[] = [];

  if (Array.isArray(schema.enum) && !schema.enum.some((item) => sameValue(item, value))) {
    errors.push({ path, message: "value not in enum" });
  }

  if (typeof schema.format === "string") {
    const formatError = checkFormat(value, schema.format, path);
    if (formatError) errors.push(formatError);
  }

  if (isRecord(value)) errors.push(...checkObject(value, schema, path));
  if (Array.isArray(value) && schema.items !== undefined) {
    errors.push(...checkItems(value, schema.items, path));
  }

  errors.push(...checkComposition(value, schema, path));
  return unique(errors);
}

function checkNull(schema: Record<string, unknown>, path: string): SchemaError[] {
  const types = typeNames(schema);
  const allowed = schema.nullable === true || types.includes("null");
  if (!allowed) {
    const listed = types.filter((type) => type !== "null");
    const expected = listed.length > 0 ? phrase(listed) : "non-null value";
    return [{ path, message: `expected ${expected}, got null` }];
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((item) => item === null)) {
    return [{ path, message: "value not in enum" }];
  }

  return [];
}

function checkObject(
  value: Record<string, unknown>,
  schema: Record<string, unknown>,
  path: string,
): SchemaError[] {
  const errors: SchemaError[] = [];
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === "string")
    : [];

  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      errors.push({
        path: joinProp(path, key),
        message: `missing required property "${key}"`,
      });
    }
  }

  const known = new Set(Object.keys(properties));
  for (const key of known) {
    if (!Object.hasOwn(value, key)) continue;
    errors.push(...checkNode(value[key], properties[key], joinProp(path, key)));
  }

  for (const key of Object.keys(value)) {
    if (known.has(key)) continue;
    const at = joinProp(path, key);
    const extra = schema.additionalProperties;
    if (extra === false) {
      errors.push({ path: at, message: `unexpected property "${key}"` });
      continue;
    }
    if (extra === undefined || extra === true) continue;
    if (isRecord(extra)) errors.push(...checkNode(value[key], extra, at));
  }

  return errors;
}

function checkItems(value: unknown[], items: unknown, path: string): SchemaError[] {
  const errors: SchemaError[] = [];
  for (let i = 0; i < value.length; i++) {
    errors.push(...checkNode(value[i], items, `${path}[${i}]`));
  }
  return errors;
}

function checkComposition(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
): SchemaError[] {
  const errors: SchemaError[] = [];

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) errors.push(...checkNode(value, sub, path));
  }

  if (Array.isArray(schema.anyOf)) {
    const ok = schema.anyOf.some((sub) => checkNode(value, sub, path).length === 0);
    if (!ok) errors.push({ path, message: "value matched no anyOf schema" });
  }

  if (Array.isArray(schema.oneOf)) {
    let matched = 0;
    for (const sub of schema.oneOf) {
      if (checkNode(value, sub, path).length === 0) matched += 1;
    }
    if (matched === 0) errors.push({ path, message: "value matched no oneOf schema" });
    else if (matched > 1) errors.push({ path, message: "value matched more than one oneOf schema" });
  }

  return errors;
}

function checkFormat(value: unknown, format: string, path: string): SchemaError | undefined {
  if (format === "int32" || format === "int64") {
    if (typeof value !== "number" || !Number.isInteger(value) || !fitsInteger(value, format)) {
      return { path, message: `expected ${format}` };
    }
    return;
  }

  if (!STRING_FORMATS.has(format)) return;
  if (typeof value !== "string" || !stringFormatOk(value, format)) {
    return { path, message: `expected ${format}` };
  }
}

function fitsInteger(value: number, format: "int32" | "int64"): boolean {
  if (format === "int32") return value >= -2147483648 && value <= 2147483647;
  // 2^63-1 rounded to a float, so the ends are a little soft
  const max = 9223372036854775807;
  return value >= -max && value <= max;
}

function stringFormatOk(value: string, format: string): boolean {
  switch (format) {
    case "date-time":
      return isDateTime(value);
    case "date":
      return isDate(value);
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case "uuid":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    case "uri":
      return isUri(value);
    default:
      return true;
  }
}

function isDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isDateTime(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|z|[+-]\d{2}:\d{2})$/.exec(
    value,
  );
  if (!match || !isDate(match[1])) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  if (hour > 23 || minute > 59 || second > 60) return false;
  const zone = match[6];
  if (zone === "Z" || zone === "z") return true;
  const offset = /^[+-](\d{2}):(\d{2})$/.exec(zone);
  if (!offset) return false;
  return Number(offset[1]) <= 23 && Number(offset[2]) <= 59;
}

function isUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol.length > 1;
  } catch {
    return false;
  }
}

function unique(errors: SchemaError[]): SchemaError[] {
  const seen = new Set<string>();
  const out: SchemaError[] = [];
  for (const error of errors) {
    const key = `${error.path}\0${error.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(error);
  }
  return out;
}

function typeNames(schema: Record<string, unknown>): string[] {
  if (typeof schema.type === "string") return [schema.type];
  if (!Array.isArray(schema.type)) return [];
  return schema.type.filter((type): type is string => typeof type === "string");
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return isRecord(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

function phrase(types: string[]): string {
  if (types.length === 1) return types[0];
  if (types.length === 2) return `${types[0]} or ${types[1]}`;
  return `${types.slice(0, -1).join(", ")} or ${types[types.length - 1]}`;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "number";
    return Number.isInteger(value) ? "integer" : "number";
  }
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return typeof value;
}

function joinProp(path: string, key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return `${path}.${key}`;
  return `${path}[${JSON.stringify(key)}]`;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!sameValue(a[i], b[i])) return false;
    }
    return true;
  }

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(right, key) || !sameValue(left[key], right[key])) return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
