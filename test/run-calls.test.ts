import { createServer, type Server, type ServerResponse, type Socket } from "node:http";
import { describe, expect, it } from "vitest";
import { listOperations } from "../src/operations.js";
import { checkResponse, runCalls } from "../src/run-calls.js";
import { parseSpec } from "../src/spec.js";

const spec = `
openapi: 3.0.3
info:
  title: Shop
  version: "1"
paths:
  /health:
    get:
      operationId: getHealth
      responses:
        "200":
          description: up
          content:
            application/json:
              schema:
                type: object
                required: [status]
                properties:
                  status:
                    type: string
                    enum: [ok]
  /orders/{id}:
    get:
      operationId: getOrder
      parameters:
        - name: id
          in: path
          required: true
          example: abc
          schema:
            type: string
      responses:
        "200":
          description: one order
          content:
            application/json:
              schema:
                type: object
                required: [id, total]
                properties:
                  id:
                    type: string
                  total:
                    type: number
`;

describe("checkResponse", () => {
  const op = listOperations(parseSpec(spec))[1];

  it("accepts a range or default status", () => {
    const ranged = {
      ...op,
      responses: {
        "2XX": {
          description: "ok",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    };
    expect(checkResponse(ranged, 201, "application/json; charset=utf-8", "{}")).toEqual([]);

    const loose = { ...op, responses: { default: { description: "anything" } } };
    expect(checkResponse(loose, 418, "text/plain", "nope")).toEqual([]);
  });

  it("flags an unknown status and a mismatched content-type", () => {
    expect(checkResponse(op, 500, "application/json", "{}")).toEqual([
      "status 500 is not documented",
    ]);
    expect(checkResponse(op, 200, "text/plain", "nope")).toEqual([
      "content-type text/plain is not documented",
    ]);
  });
});

describe("runCalls", () => {
  it("passes a clean call and flags a drifting body", async () => {
    const server = await listen((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("connection", "close");

      if (url.pathname === "/health") {
        res.statusCode = 200;
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (url.pathname === "/orders/abc" && req.headers["x-trace"] === "local") {
        res.statusCode = 200;
        res.end(JSON.stringify({ id: "abc", total: "12" }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ missing: true }));
    });

    try {
      const ops = listOperations(parseSpec(spec));
      const results = await runCalls(ops, {
        baseUrl: `http://127.0.0.1:${server.port}`,
        headers: [{ name: "X-Trace", value: "local" }],
        timeoutMs: 5000,
      });

      expect(results.map((result) => [result.operationId, result.status, result.ok])).toEqual([
        ["getHealth", 200, true],
        ["getOrder", 200, false],
      ]);
      expect(results[0].messages).toEqual([]);
      expect(results[1].messages).toEqual(["body.total expected number, got string"]);
    } finally {
      await server.close();
    }
  });
});

function listen(
  handler: (req: import("node:http").IncomingMessage, res: ServerResponse) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server: Server = createServer(handler);
  const sockets = new Set<Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("no port"));
        return;
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise((done, fail) => {
            for (const socket of sockets) socket.destroy();
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}
