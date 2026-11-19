import { readFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { loadSpec, parseSpec, SpecError } from "../src/spec.js";

describe("parseSpec", () => {
  it("reads the orders yaml fixture", async () => {
    const doc = await loadSpec("test/fixtures/orders.yaml");
    expect(doc.openapi).toBe("3.0.3");
    expect(doc.info).toMatchObject({ title: "Orders" });
    expect(Object.keys(doc.paths as object)).toEqual(["/orders", "/orders/{id}"]);
  });

  it("reads the health json fixture", async () => {
    const doc = await loadSpec("test/fixtures/health.json");
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info).toMatchObject({ title: "Health" });
  });

  it("rejects swagger and other versions", () => {
    expect(() => parseSpec("swagger: '2.0'\ninfo:\n  title: Old\n  version: '1'\n")).toThrow(
      /swagger 2.0/,
    );
    expect(() =>
      parseSpec('{"openapi":"2.0.0","info":{"title":"Nope","version":"1"},"paths":{}}'),
    ).toThrow(/found 2.0.0/);
    expect(() => parseSpec("openapi: 3.0\ninfo:\n  title: Num\n  version: '1'\n")).toThrow(
      /should be a string/,
    );
  });

  it("rejects an empty file, a list, and broken text", () => {
    expect(() => parseSpec("   \n")).toThrow(SpecError);
    expect(() => parseSpec("   \n")).toThrow(/empty/);
    expect(() => parseSpec("- just\n- a\n- list\n")).toThrow(/must be an object/);
    expect(() => parseSpec("{ this is not json")).toThrow(/could not parse/);
    expect(() => parseSpec("openapi: [")).toThrow(/could not parse/);
    expect(() => parseSpec("info:\n  title: Missing\n")).toThrow(/missing openapi version/);
  });
});

describe("loadSpec", () => {
  it("says when the file is missing", async () => {
    await expect(loadSpec("test/fixtures/no-such.yaml")).rejects.toThrow(/not found/);
  });

  it("loads yaml served from a url", async () => {
    const body = await readFile("test/fixtures/orders.yaml", "utf8");
    const server = await listen((res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/yaml");
      res.end(body);
    });

    try {
      const doc = await loadSpec(`http://127.0.0.1:${server.port}/orders.yaml`);
      expect(doc.openapi).toBe("3.0.3");
    } finally {
      await server.close();
    }
  });

  it("reports a failed fetch", async () => {
    const server = await listen((res) => {
      res.statusCode = 404;
      res.end("missing");
    });

    try {
      await expect(loadSpec(`http://127.0.0.1:${server.port}/nope.yaml`)).rejects.toThrow(/404/);
    } finally {
      await server.close();
    }
  });
});

function listen(
  handler: (res: ServerResponse) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server: Server = createServer((_req, res) => handler(res));
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
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}
