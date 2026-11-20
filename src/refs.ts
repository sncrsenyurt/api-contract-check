import { SpecError } from "./spec.js";

type Frame = {
  pointer: string;
  node: object;
};

export function resolveLocalRefs(root: unknown): unknown {
  return walk(root, root, []);
}

function walk(node: unknown, root: unknown, stack: Frame[]): unknown {
  if (Array.isArray(node)) {
    const next = stack.concat({ pointer: "", node });
    return node.map((item) => walk(item, root, next));
  }

  if (!node || typeof node !== "object") return node;

  const record = node as Record<string, unknown>;
  const rawRef = record.$ref;
  if (typeof rawRef === "string") {
    const pointer = rawRef.trim();
    if (pointer.startsWith("#")) {
      if (stack.some((frame) => frame.pointer === pointer)) return { $ref: pointer };

      const target = lookup(root, pointer);
      if (target !== null && typeof target === "object") {
        if (stack.some((frame) => frame.node === target)) return { $ref: pointer };
        return walk(target, root, stack.concat({ pointer, node: target }));
      }

      return target;
    }
  }

  const next = stack.concat({ pointer: "", node: record });
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    copy[key] = walk(value, root, next);
  }
  return copy;
}

function lookup(root: unknown, ref: string): unknown {
  let current = root;
  for (const token of pointerTokens(ref)) {
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!/^(0|[1-9]\d*)$/.test(token) || index >= current.length) {
        throw new SpecError(`could not resolve ${ref}`);
      }
      current = current[index];
      continue;
    }

    if (!current || typeof current !== "object") {
      throw new SpecError(`could not resolve ${ref}`);
    }

    const record = current as Record<string, unknown>;
    if (!Object.hasOwn(record, token)) throw new SpecError(`could not resolve ${ref}`);
    current = record[token];
  }
  return current;
}

function pointerTokens(ref: string): string[] {
  const body = ref.slice(1);
  if (body === "" || body === "/") return [];
  if (!body.startsWith("/")) throw new SpecError(`could not resolve ${ref}`);

  return body
    .slice(1)
    .split("/")
    .map((token) => {
      // ~1 is a slash, ~0 is a tilde; slash first so ~01 stays "~1"
      return token.replace(/~1/g, "/").replace(/~0/g, "~");
    });
}
