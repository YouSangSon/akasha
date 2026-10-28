import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertRetrievalCorpus } from "../../../src/eval/retrieval-corpus.js";
import { SEED_ENTRIES } from "./seed.js";
import { ADDITIONAL_RETRIEVAL_SEEDS } from "./retrieval-seed.js";

const directory = dirname(fileURLToPath(import.meta.url));
const LEGACY_SHA256 = {
  "queries.json": "65568ef8d574e840627cece6d2ac189230f52674a1fb72d741e7e0920b36c83a",
  "seed.ts": "2d20c3f3f117250e57bfc60fe2f52be0416e852fe1a3c462014d80aa209bb02a",
};

export function loadRetrievalCorpus() {
  for (const [name, expected] of Object.entries(LEGACY_SHA256)) {
    const actual = createHash("sha256").update(readFileSync(join(directory, name))).digest("hex");
    if (actual !== expected) throw new Error(`legacy retrieval fixture changed: ${name}; preserve the historical baseline`);
  }
  const legacy: unknown = JSON.parse(readFileSync(join(directory, "queries.json"), "utf8"));
  const expanded: unknown = JSON.parse(readFileSync(join(directory, "queries-expanded.json"), "utf8"));
  const multilingual: unknown = JSON.parse(readFileSync(join(directory, "queries-multilingual.json"), "utf8"));
  if (!Array.isArray(legacy) || !Array.isArray(expanded) || !Array.isArray(multilingual)) throw new Error("retrieval query fixtures must be arrays");
  const seeds = [...SEED_ENTRIES, ...ADDITIONAL_RETRIEVAL_SEEDS];
  const queries: unknown[] = [...legacy, ...expanded, ...multilingual];
  assertRetrievalCorpus(seeds, queries);
  return { version: 3, seeds, queries, legacyQueries: queries.slice(0, legacy.length),
    expandedQueries: queries.slice(legacy.length, legacy.length + expanded.length),
    multilingualQueries: queries.slice(legacy.length + expanded.length) };
}
