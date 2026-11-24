import { listOperations, type Operation, type OperationParam } from "./operations.js";

export type BreakingChange = {
  operation: string;
  detail: string;
};

export function diffDocuments(
  oldDoc: Record<string, unknown>,
  newDoc: Record<string, unknown>,
): BreakingChange[] {
  return diffOperations(listOperations(oldDoc), listOperations(newDoc));
}

export function diffOperations(oldOps: Operation[], newOps: Operation[]): BreakingChange[] {
  const next = new Map(newOps.map((op) => [opKey(op), op]));
  const changes: BreakingChange[] = [];

  for (const oldOp of oldOps) {
    const operation = `${oldOp.method.toUpperCase()} ${oldOp.path}`;
    const newer = next.get(opKey(oldOp));
    if (!newer) {
      changes.push({ operation, detail: "removed" });
      continue;
    }

    const details: string[] = [];
    diffParams(oldOp.parameters, newer.parameters, details);
    diffBody(oldOp.requestBody, newer.requestBody, details);
    diffResponses(oldOp.responses, newer.responses, details);
    for (const detail of details) changes.push({ operation, detail });
  }

  return changes;
}

export function formatDiff(changes: BreakingChange[]): string[] {
  if (changes.length === 0) return ["no breaking changes"];

  const lines: string[] = [];
  let current = "";
  for (const change of changes) {
    if (change.operation !== current) {
      current = change.operation;
      lines.push(change.operation);
    }
    lines.push(`  ${change.detail}`);
  }
  return lines;
}

function diffParams(oldParams: OperationParam[], newParams: OperationParam[], out: string[]): void {
  const oldMap = new Map(oldParams.map((param) => [paramKey(param), param]));
  for (const param of newParams) {
    const prev = oldMap.get(paramKey(param));
    const label = `param ${param.name}`;
    if (!prev) {
      if (param.required) out.push(`${label}: now required`);
      continue;
    }
    if (param.required && !prev.required) out.push(`${label}: now required`);
    const oldSchema = paramSchema(prev);
    const newSchema = paramSchema(param);
    if (oldSchema && newSchema) walkSchema(oldSchema, newSchema, label, "request", out);
  }
}

function diffBody(
  oldBody: Record<string, unknown> | undefined,
  newBody: Record<string, unknown> | undefined,
  out: string[],
): void {
  const wasRequired = oldBody?.required === true;
  const nowRequired = newBody?.required === true;
  if (!wasRequired && nowRequired) out.push("request body: now required");

  const oldSchema = jsonSchema(oldBody);
  const newSchema = jsonSchema(newBody);
  if (oldSchema && newSchema) walkSchema(oldSchema, newSchema, "request body", "request", out);
}

function diffResponses(
  oldResponses: Record<string, unknown>,
  newResponses: Record<string, unknown>,
  out: string[],
): void {
  for (const [code, oldResponse] of Object.entries(oldResponses)) {
    const newer = newResponses[code];
    if (!isRecord(newer)) {
      out.push(`response ${code}: removed`);
      continue;
    }
    const oldSchema = jsonSchema(oldResponse);
    const newSchema = jsonSchema(newer);
    if (oldSchema && newSchema) {
      walkSchema(oldSchema, newSchema, `response ${code} body`, "response", out);
    } else if (oldSchema && !newSchema) {
      out.push(`response ${code} body: removed`);
    }
  }
}

function walkSchema(
  oldSchema: Schema,
  newSchema: Schema,
  path: string,
  side: Side,
  out: string[],
): void {
  const oldTypes = typeSet(oldSchema);
  const newTypes = typeSet(newSchema);
  if (oldTypes && newTypes && !sameTypes(oldTypes, newTypes) && typeBreaks(oldTypes, newTypes, side)) {
    out.push(`${path}: type ${typeLabel(oldTypes)} -> ${typeLabel(newTypes)}`);
    return;
  }

  // request enums break when a value disappears; response enums break when one shows up
  const oldEnum = enumValues(oldSchema);
  const newEnum = enumValues(newSchema);
  if (oldEnum && newEnum) {
    if (side === "request") {
      const gone = oldEnum.filter((value) => !newEnum.some((other) => show(other) === show(value)));
      if (gone.length > 0) out.push(`${path}: enum removed ${gone.map(show).join(", ")}`);
    } else {
      const added = newEnum.filter((value) => !oldEnum.some((other) => show(other) === show(value)));
      if (added.length > 0) out.push(`${path}: enum added ${added.map(show).join(", ")}`);
    }
  }

  const oldProps = propertiesOf(oldSchema);
  const newProps = propertiesOf(newSchema);
  const oldRequired = new Set(stringList(oldSchema.required));
  const newRequired = new Set(stringList(newSchema.required));

  if (side === "request") {
    for (const key of newRequired) {
      if (!oldRequired.has(key)) out.push(`${path}.${key}: now required`);
    }
  }

  for (const key of Object.keys(oldProps)) {
    if (!Object.hasOwn(newProps, key)) {
      if (side === "response") out.push(`${path}.${key}: removed`);
      continue;
    }
    const oldChild = asSchema(oldProps[key]);
    const newChild = asSchema(newProps[key]);
    if (oldChild && newChild) walkSchema(oldChild, newChild, `${path}.${key}`, side, out);
  }

  const oldItems = asSchema(oldSchema.items);
  const newItems = asSchema(newSchema.items);
  if (oldItems && newItems) walkSchema(oldItems, newItems, `${path}[]`, side, out);
}

function paramSchema(param: OperationParam): Schema | undefined {
  if (isRecord(param.schema)) return flatten(param.schema);
  if (isRecord(param.content)) return jsonSchema({ content: param.content });
  return undefined;
}

function jsonSchema(value: unknown): Schema | undefined {
  if (!isRecord(value) || !isRecord(value.content)) return undefined;
  const content = value.content;
  const media = isRecord(content["application/json"])
    ? content["application/json"]
    : Object.values(content).find(isRecord);
  if (!isRecord(media) || !isRecord(media.schema)) return undefined;
  return flatten(media.schema);
}

function flatten(schema: Schema): Schema {
  const merged: Schema = { ...schema };
  const props: Record<string, unknown> = isRecord(schema.properties) ? { ...schema.properties } : {};
  const required = new Set(stringList(schema.required));
  const parts = Array.isArray(schema.allOf) ? schema.allOf.filter(isRecord) : [];

  for (const part of parts) {
    const flat = flatten(part);
    if (isRecord(flat.properties)) Object.assign(props, flat.properties);
    for (const key of stringList(flat.required)) required.add(key);
    if (merged.type === undefined && flat.type !== undefined) merged.type = flat.type;
    if (merged.enum === undefined && flat.enum !== undefined) merged.enum = flat.enum;
    if (merged.items === undefined && flat.items !== undefined) merged.items = flat.items;
    if (flat.nullable === true) merged.nullable = true;
  }

  if (Object.keys(props).length > 0) merged.properties = props;
  if (required.size > 0) merged.required = [...required];
  delete merged.allOf;
  return merged;
}

function typeSet(schema: Schema): Set<string> | undefined {
  const types = new Set<string>();
  if (typeof schema.type === "string") types.add(schema.type);
  else if (Array.isArray(schema.type)) {
    for (const type of schema.type) {
      if (typeof type === "string") types.add(type);
    }
  }
  if (schema.nullable === true) types.add("null");
  if (types.size === 0) return undefined;
  return types;
}

function typeBreaks(oldTypes: Set<string>, newTypes: Set<string>, side: Side): boolean {
  if (side === "request") {
    for (const type of oldTypes) if (!newTypes.has(type)) return true;
    return false;
  }
  for (const type of newTypes) if (!oldTypes.has(type)) return true;
  return false;
}

function typeLabel(types: Set<string>): string {
  return [...types].sort().join(" or ");
}

function sameTypes(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const type of left) if (!right.has(type)) return false;
  return true;
}

function enumValues(schema: Schema): unknown[] | undefined {
  if (!Array.isArray(schema.enum)) return undefined;
  return schema.enum;
}

function propertiesOf(schema: Schema): Record<string, unknown> {
  return isRecord(schema.properties) ? schema.properties : {};
}

function asSchema(value: unknown): Schema | undefined {
  return isRecord(value) ? flatten(value) : undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function show(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

function paramKey(param: OperationParam): string {
  return `${param.in}:${param.name}`;
}

function opKey(op: Operation): string {
  return `${op.method} ${op.path}`;
}

type Side = "request" | "response";
type Schema = Record<string, unknown>;

function isRecord(value: unknown): value is Schema {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
