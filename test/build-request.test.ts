import { describe, expect, it } from "vitest";
import { buildRequest } from "../src/build-request.js";
import type { Operation } from "../src/operations.js";

const setup = {
  baseUrl: "https://api.example.com/v1",
  headers: [
    { name: "X-Trace", value: "local" },
    { name: "Accept", value: "application/json" },
  ],
  timeoutMs: 1500,
};

describe("buildRequest", () => {
  it("fills the url from the base, path, and query", () => {
    const op: Operation = {
      method: "get",
      path: "/orders/{id}",
      operationId: "getOrder",
      parameters: [
        { name: "id", in: "path", required: true, example: "abc" },
        {
          name: "limit",
          in: "query",
          required: false,
          schema: { type: "integer", default: 5 },
        },
        {
          name: "sort",
          in: "query",
          required: false,
          examples: { fresh: { value: "new" }, old: { value: "old" } },
        },
        {
          name: "X-Trace",
          in: "header",
          required: false,
          schema: { type: "string", example: "from-spec" },
        },
        { name: "X-Shop", in: "header", required: false, schema: { type: "string" } },
      ],
      responses: {},
    };

    const built = buildRequest(op, setup);
    expect(built.method).toBe("GET");
    expect(built.url).toBe("https://api.example.com/v1/orders/abc?limit=5&sort=new");
    expect(built.timeoutMs).toBe(1500);
    expect(built.body).toBeUndefined();
    expect(built.headers["X-Trace"]).toBe("local");
    expect(built.headers["X-Shop"]).toBe("string");
    expect(built.headers.Accept).toBe("application/json");
  });

  it("builds a json body from examples, defaults, and enums", () => {
    const op: Operation = {
      method: "post",
      path: "/items",
      operationId: "createItem",
      parameters: [],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              oneOf: [
                {
                  type: "object",
                  required: ["name", "qty", "email"],
                  properties: {
                    name: { type: "string", example: "mug" },
                    qty: { type: "integer" },
                    note: { type: "string", default: "none" },
                    extra: { type: "string" },
                    email: { type: "string", format: "email" },
                  },
                },
                { type: "string" },
              ],
            },
          },
        },
      },
      responses: {},
    };

    const built = buildRequest(op, { ...setup, headers: [] });
    expect(built.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(built.body ?? "")).toEqual({
      name: "mug",
      qty: 0,
      note: "none",
      email: "user@example.com",
    });
  });

  it("prefers a body example over the schema", () => {
    const op: Operation = {
      method: "post",
      path: "/items",
      operationId: "createItem",
      parameters: [],
      requestBody: {
        content: {
          "text/plain": { schema: { type: "string" } },
          "application/json": {
            example: { ok: true },
            schema: { type: "object" },
          },
        },
      },
      responses: {},
    };

    const built = buildRequest(op, { ...setup, headers: [] });
    expect(built.body).toBe('{"ok":true}');
  });
});
