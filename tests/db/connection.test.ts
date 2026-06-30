import { describe, expect, it } from "vitest";
import { createPgPool } from "../../src/db/connection.js";

describe("createPgPool", () => {
  it.each([
    {
      input: null,
      message: "pg pool input must be an object",
    },
    {
      input: [],
      message: "pg pool input must be an object",
    },
    {
      input: { connectionString: 123 },
      message: "connectionString must be a string",
    },
    {
      input: { connectionString: " \n\t " },
      message: "connectionString must contain non-whitespace text",
    },
  ])("rejects malformed pool input %#", ({ input, message }) => {
    expect(() => createPgPool(input as never)).toThrow(message);
  });
});
