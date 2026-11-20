import { describe, expect, it } from "vitest";
import { resolveLocalRefs } from "../src/refs.js";
import { SpecError } from "../src/spec.js";

describe("resolveLocalRefs", () => {
  it("follows a chain of local refs", () => {
    const doc = {
      components: {
        schemas: {
          Id: { $ref: "#/components/schemas/Uuid" },
          Uuid: { type: "string", format: "uuid" },
        },
      },
      used: { $ref: "#/components/schemas/Id" },
    };

    const out = resolveLocalRefs(doc) as {
      components: { schemas: { Id: { type: string } } };
      used: { format: string };
    };

    expect(out.used).toEqual({ type: "string", format: "uuid" });
    expect(out.components.schemas.Id).toEqual({ type: "string", format: "uuid" });
    expect(doc.used).toEqual({ $ref: "#/components/schemas/Id" });
  });

  it("resolves refs nested in a list", () => {
    const doc = {
      components: {
        schemas: {
          Money: { type: "object", properties: { amount: { type: "number" } } },
        },
      },
      bag: { allOf: [{ $ref: "#/components/schemas/Money" }, { type: "object" }] },
    };

    const out = resolveLocalRefs(doc) as { bag: { allOf: unknown[] } };
    expect(out.bag.allOf[0]).toEqual({
      type: "object",
      properties: { amount: { type: "number" } },
    });
    expect(out.bag.allOf[1]).toEqual({ type: "object" });
  });

  it("stops when a schema points back at itself", () => {
    const doc = {
      components: {
        schemas: {
          Node: {
            type: "object",
            properties: {
              name: { type: "string" },
              child: { $ref: "#/components/schemas/Node" },
            },
          },
        },
      },
      root: { $ref: "#/components/schemas/Node" },
    };

    const out = resolveLocalRefs(doc) as {
      root: { properties: { child: unknown } };
    };

    expect(out.root).toEqual({
      type: "object",
      properties: {
        name: { type: "string" },
        child: { $ref: "#/components/schemas/Node" },
      },
    });
  });

  it("stops when two refs point at each other", () => {
    const doc = {
      components: {
        schemas: {
          A: { $ref: "#/components/schemas/B" },
          B: { $ref: "#/components/schemas/A" },
        },
      },
    };

    const out = resolveLocalRefs(doc) as {
      components: { schemas: { A: unknown; B: unknown } };
    };

    expect(out.components.schemas.A).toEqual({ $ref: "#/components/schemas/B" });
    expect(out.components.schemas.B).toEqual({ $ref: "#/components/schemas/A" });
  });

  it("decodes ~0 and ~1 in a pointer", () => {
    const doc = {
      components: {
        schemas: {
          "a/b": { type: "string" },
          "a~b": { type: "number" },
        },
      },
      slash: { $ref: "#/components/schemas/a~1b" },
      tilde: { $ref: "#/components/schemas/a~0b" },
    };

    const out = resolveLocalRefs(doc) as { slash: unknown; tilde: unknown };
    expect(out.slash).toEqual({ type: "string" });
    expect(out.tilde).toEqual({ type: "number" });
  });

  it("reads a ref into a list and a plain value", () => {
    const doc = {
      choices: ["yes", "no"],
      pick: { $ref: "#/choices/1" },
      label: { $ref: "#/choices/0" },
    };

    expect(resolveLocalRefs(doc)).toMatchObject({ pick: "no", label: "yes" });
  });

  it("leaves an external ref alone", () => {
    const doc = {
      pet: { $ref: "./extra.yaml#/components/schemas/Pet", description: "kept" },
    };

    expect(resolveLocalRefs(doc)).toEqual(doc);
  });

  it("throws when the pointer goes nowhere", () => {
    expect(() => resolveLocalRefs({ item: { $ref: "#/components/schemas/Missing" } })).toThrow(
      SpecError,
    );
    expect(() => resolveLocalRefs({ item: { $ref: "#/components/schemas/Missing" } })).toThrow(
      /could not resolve #\/components\/schemas\/Missing/,
    );
    expect(() => resolveLocalRefs({ item: { $ref: "#components/schemas/Nope" } })).toThrow(
      /could not resolve/,
    );
  });
});
