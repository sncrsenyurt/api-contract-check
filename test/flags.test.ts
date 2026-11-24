import { describe, expect, it } from "vitest";
import { FlagError, parseDiffArgs, parseFlags } from "../src/flags.js";

const base = ["orders.yaml", "--base-url", "https://api.example.com"];

describe("parseFlags", () => {
  it("reads a spec, base url, headers, out dir, and timeout", () => {
    const parsed = parseFlags([
      "--header",
      "Accept: application/json",
      "orders.yaml",
      "--base-url=https://api.example.com/v1",
      "--header",
      "Authorization: Bearer abc:def",
      "--out",
      "tmp/out",
      "--timeout=15000",
    ]);

    expect(parsed).toEqual({
      help: false,
      spec: "orders.yaml",
      baseUrl: "https://api.example.com/v1",
      headers: [
        { name: "Accept", value: "application/json" },
        { name: "Authorization", value: "Bearer abc:def" },
      ],
      outDir: "tmp/out",
      timeoutMs: 15000,
      only: [],
      skip: [],
    });
  });

  it("defaults the report dir and timeout", () => {
    const parsed = parseFlags(base);
    expect(parsed).toMatchObject({
      help: false,
      outDir: "./contract-out",
      timeoutMs: 30000,
      headers: [],
      only: [],
      skip: [],
    });
  });

  it("treats --help as help even with other junk", () => {
    expect(parseFlags(["--help"])).toEqual({ help: true });
    expect(parseFlags(["-h", "--nope"])).toEqual({ help: true });
  });

  it("complains when the spec or base url is missing", () => {
    expect(() => parseFlags([])).toThrow(FlagError);
    expect(() => parseFlags([])).toThrow(/missing spec/);
    expect(() => parseFlags(["orders.yaml"])).toThrow(/missing --base-url/);
    expect(() => parseFlags(["--base-url", "https://api.example.com"])).toThrow(/missing spec/);
  });

  it("rejects a base url that is not http(s)", () => {
    expect(() => parseFlags(["orders.yaml", "--base-url", "ftp://files.example.com"])).toThrow(
      /http or https/,
    );
    expect(() => parseFlags(["orders.yaml", "--base-url", "not a url"])).toThrow(/not a url/);
  });

  it("rejects a bad timeout", () => {
    expect(() => parseFlags([...base, "--timeout", "0"])).toThrow(/timeout/);
    expect(() => parseFlags([...base, "--timeout", "15s"])).toThrow(/timeout/);
    expect(() => parseFlags([...base, "--timeout"])).toThrow(/needs a value/);
  });

  it("rejects a header that is not name:value", () => {
    expect(() => parseFlags([...base, "--header", "Bearer token"])).toThrow(/name:value/);
    expect(() => parseFlags([...base, "--header="])).toThrow(/needs a value/);
  });

  it("repeats --only and --skip", () => {
    const parsed = parseFlags([
      ...base,
      "--only",
      "getOrder",
      "--only=POST /orders",
      "--skip",
      "GET /health",
    ]);
    expect(parsed).toMatchObject({
      only: ["getOrder", "POST /orders"],
      skip: ["GET /health"],
    });
  });

  it("rejects an empty filter", () => {
    expect(() => parseFlags([...base, "--only"])).toThrow(/--only needs a value/);
    expect(() => parseFlags([...base, "--skip="])).toThrow(/--skip needs a value/);
    expect(() => parseFlags([...base, "--only", "  "])).toThrow(/--only needs an operation/);
  });

  it("reads the two specs for diff", () => {
    expect(parseDiffArgs(["old.yaml", "new.json"])).toEqual({
      oldSpec: "old.yaml",
      newSpec: "new.json",
    });
    expect(() => parseDiffArgs(["old.yaml"])).toThrow(/old spec and a new spec/);
    expect(() => parseDiffArgs(["old.yaml", "new.json", "extra.yaml"])).toThrow(
      /unexpected argument extra.yaml/,
    );
    expect(() => parseDiffArgs(["old.yaml", "--base-url", "https://api.example.com"])).toThrow(
      /unknown flag --base-url/,
    );
  });

  it("rejects unknown flags and extra paths", () => {
    expect(() => parseFlags([...base, "--verbose"])).toThrow(/unknown flag --verbose/);
    expect(() => parseFlags([...base, "another.yaml"])).toThrow(/unexpected argument another.yaml/);
  });
});
