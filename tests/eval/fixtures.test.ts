import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EvalQuery } from "../../src/eval/types.js";
import { SEED_ENTRIES } from "./fixtures/seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const queries = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "queries.json"), "utf8"),
) as EvalQuery[];

describe("retrieval eval fixtures", () => {
  it("keeps query ids and seed keys unique", () => {
    expect(new Set(SEED_ENTRIES.map((entry) => entry.seedKey)).size).toBe(
      SEED_ENTRIES.length,
    );
    expect(new Set(queries.map((query) => query.id)).size).toBe(queries.length);
  });

  it("only references known seed keys", () => {
    const seedKeys = new Set(SEED_ENTRIES.map((entry) => entry.seedKey));

    for (const query of queries) {
      expect(query.relevantRecordSeedKeys.length).toBeGreaterThan(0);
      for (const seedKey of query.relevantRecordSeedKeys) {
        expect(seedKeys.has(seedKey), `${query.id}: ${seedKey}`).toBe(true);
      }
    }
  });

  it("covers lexical-rescue and policy recall cases", () => {
    expect(queries.map((query) => query.id)).toEqual(
      expect.arrayContaining(["q16", "q18", "q19", "q20"]),
    );
  });
});
