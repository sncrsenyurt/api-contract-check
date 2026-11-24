import { describe, expect, it } from "vitest";
import { diffDocuments, formatDiff } from "../src/diff-specs.js";
import { loadSpec } from "../src/spec.js";

describe("diffDocuments", () => {
  it("lists each kind of breaking change and ignores compatible edits", async () => {
    const oldDoc = await loadSpec("test/fixtures/diff-old.yaml");
    const newDoc = await loadSpec("test/fixtures/diff-new.json");
    const changes = diffDocuments(oldDoc, newDoc);

    expect(changes).toEqual([
      { operation: "GET /items", detail: "param limit: type integer -> string" },
      { operation: "GET /items", detail: 'param status: enum removed "hold"' },
      { operation: "GET /items", detail: "param region: now required" },
      { operation: "GET /items", detail: 'response 200 body.status: enum added "archived"' },
      { operation: "GET /items", detail: "response 200 body.items[].price: type number -> string" },
      { operation: "GET /items", detail: "response 200 body.items[].sku: removed" },
      { operation: "POST /items", detail: "request body.sku: now required" },
      { operation: "POST /items", detail: "request body.qty: type integer -> string" },
      { operation: "POST /items", detail: 'request body.status: enum removed "hold"' },
      { operation: "DELETE /items/{id}", detail: "removed" },
    ]);

    expect(formatDiff(changes).slice(0, 4)).toEqual([
      "GET /items",
      "  param limit: type integer -> string",
      '  param status: enum removed "hold"',
      "  param region: now required",
    ]);
    expect(changes.some((change) => change.detail.includes("title"))).toBe(false);
    expect(changes.some((change) => change.detail.includes("param q"))).toBe(false);
    expect(changes.some((change) => change.detail.includes("fresh"))).toBe(false);
    expect(changes.some((change) => change.detail.includes("empty"))).toBe(false);
  });

  it("reports nothing when the specs match", async () => {
    const doc = await loadSpec("test/fixtures/diff-old.yaml");
    expect(diffDocuments(doc, doc)).toEqual([]);
    expect(formatDiff([])).toEqual(["no breaking changes"]);
  });
});
