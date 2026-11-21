import { describe, expect, it } from "vitest";
import { checkAgainstSchema } from "../src/schema-check.js";

const order = {
  type: "object",
  required: ["id", "items"],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["price"],
        properties: {
          price: { type: "number" },
          "item-id": { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
};

describe("checkAgainstSchema", () => {
  it("accepts a nested value that fits", () => {
    const value = { id: "o1", items: [{ price: 4.5, "item-id": "sku" }] };
    expect(checkAgainstSchema(value, order)).toEqual([]);
  });

  it("points at the bad leaf", () => {
    const value = {
      id: "o1",
      items: [{ price: 1 }, { price: 2 }, { price: "nope" }],
    };
    expect(checkAgainstSchema(value, order)).toEqual([
      { path: "body.items[2].price", message: "expected number, got string" },
    ]);
  });

  it("reports every broken field, not just the first", () => {
    expect(checkAgainstSchema({ name: 1, extra: true }, order, "response")).toEqual([
      { path: "response.id", message: 'missing required property "id"' },
      { path: "response.items", message: 'missing required property "items"' },
      { path: "response.name", message: 'unexpected property "name"' },
      { path: "response.extra", message: 'unexpected property "extra"' },
    ]);
  });

  it("names each type it knows", () => {
    expect(checkAgainstSchema("x", { type: "integer" })).toEqual([
      { path: "body", message: "expected integer, got string" },
    ]);
    expect(checkAgainstSchema(1.5, { type: "integer" })).toEqual([
      { path: "body", message: "expected integer, got number" },
    ]);
    expect(checkAgainstSchema(1, { type: "number" })).toEqual([]);
    expect(checkAgainstSchema("x", { type: "number" })).toEqual([
      { path: "body", message: "expected number, got string" },
    ]);
    expect(checkAgainstSchema("x", { type: "boolean" })).toEqual([
      { path: "body", message: "expected boolean, got string" },
    ]);
    expect(checkAgainstSchema([], { type: "object" })).toEqual([
      { path: "body", message: "expected object, got array" },
    ]);
    expect(checkAgainstSchema({}, { type: "array" })).toEqual([
      { path: "body", message: "expected array, got object" },
    ]);
    expect(checkAgainstSchema("x", { type: "null" })).toEqual([
      { path: "body", message: "expected null, got string" },
    ]);
    expect(checkAgainstSchema(null, { type: "null" })).toEqual([]);
    expect(checkAgainstSchema(1, { type: ["string", "null"] })).toEqual([
      { path: "body", message: "expected string or null, got integer" },
    ]);
  });

  it("lets null through only when the schema says so", () => {
    expect(checkAgainstSchema(null, { type: "string", nullable: true })).toEqual([]);
    expect(checkAgainstSchema("ok", { type: "string", nullable: true })).toEqual([]);
    expect(checkAgainstSchema(null, { type: "string" })).toEqual([
      { path: "body", message: "expected string, got null" },
    ]);
    expect(checkAgainstSchema(null, { type: "string", nullable: false })).toEqual([
      { path: "body", message: "expected string, got null" },
    ]);
    expect(checkAgainstSchema(null, {})).toEqual([
      { path: "body", message: "expected non-null value, got null" },
    ]);
    expect(checkAgainstSchema(null, { type: ["string", "null"] })).toEqual([]);
  });

  it("checks enum with plain and nested values", () => {
    expect(checkAgainstSchema("b", { type: "string", enum: ["a", "b"] })).toEqual([]);
    expect(checkAgainstSchema("c", { type: "string", enum: ["a", "b"] })).toEqual([
      { path: "body", message: "value not in enum" },
    ]);
    expect(checkAgainstSchema("1", { enum: [1, 2] })).toEqual([
      { path: "body", message: "value not in enum" },
    ]);
    expect(checkAgainstSchema({ code: "ok" }, { enum: [{ code: "ok" }, { code: "no" }] })).toEqual(
      [],
    );
    expect(checkAgainstSchema({ code: "ok", extra: 1 }, { enum: [{ code: "ok" }] })).toEqual([
      { path: "body", message: "value not in enum" },
    ]);
    expect(checkAgainstSchema(null, { type: "string", nullable: true, enum: ["a"] })).toEqual([
      { path: "body", message: "value not in enum" },
    ]);
    expect(checkAgainstSchema(null, { nullable: true, enum: ["a", null] })).toEqual([]);
  });

  it("checks properties, required, and additionalProperties", () => {
    const schema = {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
      additionalProperties: { type: "integer" },
    };

    expect(checkAgainstSchema({ id: "a", n: 2 }, schema)).toEqual([]);
    expect(checkAgainstSchema({ id: "a", n: "2" }, schema)).toEqual([
      { path: "body.n", message: "expected integer, got string" },
    ]);

    const closed = { ...schema, additionalProperties: false };
    expect(checkAgainstSchema({ id: "a", n: 2 }, closed)).toEqual([
      { path: "body.n", message: 'unexpected property "n"' },
    ]);
    expect(checkAgainstSchema({ id: "a", n: 2 }, { ...schema, additionalProperties: true })).toEqual(
      [],
    );
  });

  it("quotes property names that are not identifiers", () => {
    const value = { id: "o1", items: [{ price: 1, "item-id": 9 }] };
    expect(checkAgainstSchema(value, order)).toEqual([
      { path: 'body.items[0]["item-id"]', message: "expected string, got integer" },
    ]);
  });

  it("checks each array item", () => {
    const schema = { type: "array", items: { type: "boolean" } };
    expect(checkAgainstSchema([true, false], schema)).toEqual([]);
    expect(checkAgainstSchema([true, "no"], schema)).toEqual([
      { path: "body[1]", message: "expected boolean, got string" },
    ]);
  });

  it("follows a local ref on the schema", () => {
    const schema = {
      defs: { Price: { type: "integer" } },
      type: "object",
      required: ["price"],
      properties: { price: { $ref: "#/defs/Price" } },
    };
    expect(checkAgainstSchema({ price: 3 }, schema)).toEqual([]);
    expect(checkAgainstSchema({ price: 3.5 }, schema)).toEqual([
      { path: "body.price", message: "expected integer, got number" },
    ]);
  });

  it("says when a ref cannot be resolved", () => {
    expect(checkAgainstSchema({ id: 1 }, { $ref: "#/components/schemas/Missing" })).toEqual([
      { path: "body", message: "could not resolve #/components/schemas/Missing" },
    ]);
  });

  it("checks date, email, uuid, uri, and integer formats", () => {
    expect(checkAgainstSchema("2026-11-21", { format: "date" })).toEqual([]);
    expect(checkAgainstSchema("2024-02-29", { format: "date" })).toEqual([]);
    expect(checkAgainstSchema("2026-02-29", { format: "date" })).toEqual([
      { path: "body", message: "expected date" },
    ]);
    expect(checkAgainstSchema("21-11-2026", { format: "date" })).toEqual([
      { path: "body", message: "expected date" },
    ]);

    expect(checkAgainstSchema("2026-11-21T04:36:00Z", { format: "date-time" })).toEqual([]);
    expect(checkAgainstSchema("2026-11-21t04:36:00.120z", { format: "date-time" })).toEqual([]);
    expect(checkAgainstSchema("2026-11-21T04:36:00+02:00", { format: "date-time" })).toEqual([]);
    expect(checkAgainstSchema("2026-11-21T04:36:00", { format: "date-time" })).toEqual([
      { path: "body", message: "expected date-time" },
    ]);
    expect(checkAgainstSchema("2026-11-21", { format: "date-time" })).toEqual([
      { path: "body", message: "expected date-time" },
    ]);

    expect(checkAgainstSchema("ada@example.com", { format: "email" })).toEqual([]);
    expect(checkAgainstSchema("ada@localhost", { format: "email" })).toEqual([
      { path: "body", message: "expected email" },
    ]);
    expect(checkAgainstSchema("not an email", { format: "email" })).toEqual([
      { path: "body", message: "expected email" },
    ]);

    expect(
      checkAgainstSchema("550e8400-e29b-41d4-a716-446655440000", { format: "uuid" }),
    ).toEqual([]);
    expect(checkAgainstSchema("550e8400e29b41d4a716446655440000", { format: "uuid" })).toEqual([
      { path: "body", message: "expected uuid" },
    ]);

    expect(checkAgainstSchema("https://api.example.com/v1", { format: "uri" })).toEqual([]);
    expect(checkAgainstSchema("mailto:ada@example.com", { format: "uri" })).toEqual([]);
    expect(checkAgainstSchema("/relative/path", { format: "uri" })).toEqual([
      { path: "body", message: "expected uri" },
    ]);

    expect(checkAgainstSchema(2147483647, { type: "integer", format: "int32" })).toEqual([]);
    expect(checkAgainstSchema(-2147483648, { format: "int32" })).toEqual([]);
    expect(checkAgainstSchema(2147483648, { type: "integer", format: "int32" })).toEqual([
      { path: "body", message: "expected int32" },
    ]);
    expect(checkAgainstSchema(1.5, { format: "int32" })).toEqual([
      { path: "body", message: "expected int32" },
    ]);
    expect(checkAgainstSchema(1e20, { format: "int64" })).toEqual([
      { path: "body", message: "expected int64" },
    ]);
    expect(checkAgainstSchema(-20, { format: "int64" })).toEqual([]);

    expect(checkAgainstSchema("abc", { format: "byte" })).toEqual([]);
    expect(checkAgainstSchema(1, { type: "string", format: "email" })).toEqual([
      { path: "body", message: "expected string, got integer" },
    ]);
  });

  it("requires one anyOf match and exactly one oneOf match", () => {
    const kinds = [{ type: "string" }, { type: "integer" }];
    expect(checkAgainstSchema("a", { anyOf: kinds })).toEqual([]);
    expect(checkAgainstSchema(1.5, { anyOf: kinds })).toEqual([
      { path: "body", message: "value matched no anyOf schema" },
    ]);

    expect(checkAgainstSchema(1, { oneOf: kinds })).toEqual([]);
    expect(checkAgainstSchema(true, { oneOf: kinds })).toEqual([
      { path: "body", message: "value matched no oneOf schema" },
    ]);
    expect(checkAgainstSchema("a", { oneOf: [{ type: "string" }, { enum: ["a", "b"] }] })).toEqual([
      { path: "body", message: "value matched more than one oneOf schema" },
    ]);
  });

  it("collects allOf failures at the leaf path", () => {
    const schema = {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            allOf: [
              { type: "object", required: ["price"], properties: { price: { type: "number" } } },
              { type: "object", required: ["sku"], properties: { sku: { type: "string" } } },
            ],
          },
        },
      },
    };

    expect(checkAgainstSchema({ items: [{ price: 1, sku: "a" }, { price: "x" }] }, schema)).toEqual(
      [
        { path: "body.items[1].price", message: "expected number, got string" },
        { path: "body.items[1].sku", message: 'missing required property "sku"' },
      ],
    );
  });

  it("puts a oneOf miss on the array slot", () => {
    const schema = {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { oneOf: [{ type: "string" }, { type: "integer" }] },
        },
      },
    };

    expect(checkAgainstSchema({ items: ["a", 1, true, "b"] }, schema)).toEqual([
      { path: "body.items[2]", message: "value matched no oneOf schema" },
    ]);
  });

  it("stops on a ref that only points at itself", () => {
    const schema = {
      type: "object",
      properties: {
        child: { $ref: "#/properties/child" },
      },
    };
    expect(checkAgainstSchema({ child: { child: 1 } }, schema)).toEqual([
      { path: "body.child", message: "unresolved ref #/properties/child" },
    ]);
  });
});
