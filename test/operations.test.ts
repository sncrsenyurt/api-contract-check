import { describe, expect, it } from "vitest";
import { listOperations } from "../src/operations.js";
import { loadSpec } from "../src/spec.js";

describe("listOperations", () => {
  it("lists the orders fixture", async () => {
    const ops = listOperations(await loadSpec("test/fixtures/orders.yaml"));

    expect(ops.map((op) => [op.method, op.path, op.operationId])).toEqual([
      ["get", "/orders", "listOrders"],
      ["get", "/orders/{id}", "getOrder"],
    ]);
    expect(ops[1].parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "string" } },
    ]);
    expect(ops[0].requestBody).toBeUndefined();
  });

  it("reads the catalog yaml, refs and all", async () => {
    const ops = listOperations(await loadSpec("test/fixtures/catalog.yaml"));
    const list = ops.find((op) => op.operationId === "listItems");
    const create = ops.find((op) => op.path === "/items" && op.method === "post");
    const one = ops.find((op) => op.operationId === "getItem");

    expect(ops.map((op) => op.operationId)).toEqual(["listItems", "post_items", "getItem"]);

    expect(list?.parameters).toEqual([
      {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", maximum: 50 },
      },
      {
        name: "q",
        in: "query",
        required: false,
        schema: { type: "string" },
      },
    ]);

    const listed = (list?.responses["200"] as { content: Record<string, { schema: unknown }> })
      .content["application/json"].schema;
    expect(listed).toMatchObject({
      type: "array",
      items: {
        properties: {
          price: {
            type: "object",
            properties: { amount: { type: "number" }, currency: { type: "string" } },
          },
          related: { $ref: "#/components/schemas/Item" },
        },
      },
    });

    expect(create?.parameters.map((param) => param.name)).toEqual(["limit", "q"]);
    expect(create?.parameters[0].schema).toEqual({ type: "integer" });
    expect(create?.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: {
            allOf: [
              { type: "object", properties: { amount: { type: "number" } } },
              { type: "object", properties: { name: { type: "string" } } },
            ],
          },
        },
      },
    });
    expect(create?.responses["201"]).toMatchObject({
      description: "created",
      content: {
        "application/json": {
          schema: { properties: { related: { $ref: "#/components/schemas/Item" } } },
        },
      },
    });

    expect(one?.parameters).toEqual([
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" },
        example: "sku_1",
      },
    ]);
  });

  it("reads the notes json fixture", async () => {
    const ops = listOperations(await loadSpec("test/fixtures/notes.json"));
    const list = ops[0];
    const create = ops[1];
    const one = ops[2];

    expect(ops.map((op) => [op.method, op.path, op.operationId])).toEqual([
      ["get", "/notes", "get_notes"],
      ["post", "/notes", "post_notes"],
      ["get", "/notes/{noteId}", "getNote"],
    ]);

    expect(list.parameters).toEqual([
      {
        name: "tag",
        in: "query",
        required: true,
        schema: { type: "string", minLength: 1 },
      },
      {
        name: "page",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1 },
      },
    ]);
    expect(create.parameters).toEqual([
      { name: "tag", in: "query", required: false, schema: { type: "string" } },
    ]);
    expect(create.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: {
            properties: {
              author: { type: "object", properties: { name: { type: "string" } } },
              parent: { $ref: "#/components/schemas/Note" },
            },
          },
        },
      },
    });
    expect(one.responses["404"]).toEqual({ description: "not found" });
    expect(one.parameters[0]).toMatchObject({ name: "noteId", in: "path", required: true });
  });

  it("makes a plain operationId and keeps path params required", () => {
    const ops = listOperations({
      openapi: "3.0.3",
      paths: {
        "/": { get: { responses: { "200": { description: "root" } } } },
        "/things/{id}": {
          get: {
            parameters: [{ name: "id", in: "path", schema: { type: "string" } }],
            responses: { "200": { description: "one" } },
          },
        },
        "/a": { get: { operationId: "get_a", responses: { "200": { description: "a" } } } },
        "/a/": { get: { responses: { "200": { description: "again" } } } },
      },
    });

    expect(ops.map((op) => op.operationId)).toEqual(["get_root", "get_things_id", "get_a", "get_a_2"]);
    expect(ops[1].parameters[0].required).toBe(true);
  });

  it("follows a path item ref", () => {
    const ops = listOperations({
      openapi: "3.0.3",
      paths: {
        "/a": { $ref: "#/paths/~1b" },
        "/b": {
          parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
          get: {
            operationId: "getB",
            responses: { "200": { description: "ok" } },
          },
        },
      },
    });

    expect(ops.map((op) => [op.path, op.operationId])).toEqual([
      ["/a", "getB"],
      ["/b", "getB"],
    ]);
    expect(ops[0].parameters).toEqual([
      { name: "q", in: "query", required: false, schema: { type: "string" } },
    ]);
  });

  it("returns nothing when the spec has no paths", () => {
    expect(listOperations({ openapi: "3.0.3", info: { title: "Empty", version: "0" } })).toEqual(
      [],
    );
  });
});
