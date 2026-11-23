import type { Operation } from "./operations.js";

export function pickOperations(ops: Operation[], only: string[], skip: string[]): Operation[] {
  const chosen =
    only.length === 0 ? ops.slice() : ops.filter((op) => only.some((item) => sameOp(op, item)));
  if (skip.length === 0) return chosen;
  return chosen.filter((op) => !skip.some((item) => sameOp(op, item)));
}

export function selectionError(ops: Operation[], only: string[], skip: string[]): string | undefined {
  if (only.length === 0 && skip.length === 0) return undefined;
  if (ops.length === 0) return undefined;
  if (pickOperations(ops, only, skip).length === 0) return "no operations matched";
  return undefined;
}

function sameOp(op: Operation, filter: string): boolean {
  const text = filter.trim();
  if (op.operationId === text) return true;

  const space = text.indexOf(" ");
  if (space === -1) return false;
  const method = text.slice(0, space).trim();
  const path = text.slice(space + 1).trim();
  return op.method.toLowerCase() === method.toLowerCase() && op.path === path;
}
