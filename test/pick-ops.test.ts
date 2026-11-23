import { describe, expect, it } from "vitest";
import type { Operation } from "../src/operations.js";
import { pickOperations, selectionError } from "../src/pick-ops.js";

const ops: Operation[] = [
  { method: "get", path: "/health", operationId: "getHealth", parameters: [], responses: {} },
  { method: "get", path: "/orders/{id}", operationId: "getOrder", parameters: [], responses: {} },
  { method: "post", path: "/orders", operationId: "createOrder", parameters: [], responses: {} },
];

describe("pickOperations", () => {
  it("keeps every operation when no filter is set", () => {
    expect(pickOperations(ops, [], []).map((op) => op.operationId)).toEqual([
      "getHealth",
      "getOrder",
      "createOrder",
    ]);
  });

  it("matches an operationId or METHOD /path", () => {
    expect(pickOperations(ops, ["getOrder", "POST /orders"], []).map((op) => op.operationId)).toEqual([
      "getOrder",
      "createOrder",
    ]);
    expect(pickOperations(ops, ["get /health"], []).map((op) => op.operationId)).toEqual(["getHealth"]);
  });

  it("skips after only", () => {
    const picked = pickOperations(ops, ["getHealth", "getOrder"], ["GET /health"]);
    expect(picked.map((op) => op.operationId)).toEqual(["getOrder"]);
  });

  it("drops skipped ids and paths", () => {
    const picked = pickOperations(ops, [], ["createOrder", "GET /health"]);
    expect(picked.map((op) => op.operationId)).toEqual(["getOrder"]);
  });

  it("says when a filter matches nothing", () => {
    expect(selectionError(ops, ["missing"], [])).toBe("no operations matched");
    expect(selectionError(ops, ["getHealth"], ["GET /health"])).toBe("no operations matched");
    expect(selectionError(ops, [], ["nope"])).toBeUndefined();
    expect(selectionError([], ["nope"], [])).toBeUndefined();
  });
});
