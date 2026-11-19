import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

export class SpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpecError";
  }
}

export async function loadSpec(location: string): Promise<Record<string, unknown>> {
  const text = isHttpUrl(location) ? await readUrl(location) : await readLocal(location);
  return parseSpec(text, location);
}

export function parseSpec(text: string, where = "spec"): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) throw new SpecError(`spec is empty: ${where}`);

  let doc: unknown;
  try {
    doc = parseBody(trimmed);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "parse error";
    throw new SpecError(`could not parse spec ${where}: ${detail}`);
  }

  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new SpecError(`spec must be an object: ${where}`);
  }

  const record = doc as Record<string, unknown>;
  const version = record.openapi;

  if (typeof version !== "string") {
    if ("swagger" in record) {
      throw new SpecError(`expected openapi 3.x, this looks like swagger ${String(record.swagger)}`);
    }
    if (version === undefined) {
      throw new SpecError(`missing openapi version in ${where}`);
    }
    throw new SpecError(`openapi version should be a string like "3.0.3" in ${where}`);
  }

  if (!/^3\.\d+\.\d+$/.test(version.trim())) {
    throw new SpecError(`expected openapi 3.x, found ${version} in ${where}`);
  }

  return record;
}

function parseBody(text: string): unknown {
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch (jsonErr) {
      try {
        return parseYaml(text);
      } catch {
        throw jsonErr;
      }
    }
  }

  return parseYaml(text);
}

function isHttpUrl(location: string): boolean {
  return /^https?:\/\//i.test(location);
}

async function readLocal(location: string): Promise<string> {
  try {
    return await readFile(location, "utf8");
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (code === "ENOENT") throw new SpecError(`spec not found: ${location}`);
    throw new SpecError(`could not read spec: ${location}`);
  }
}

async function readUrl(location: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(location);
  } catch {
    throw new SpecError(`could not fetch spec: ${location}`);
  }

  if (!res.ok) throw new SpecError(`spec url returned ${res.status}: ${location}`);
  return res.text();
}
