import type { AddMemoryInput } from "../../../src/types.js";

// Each entry is keyed by a stable seed-key (used by queries.json to declare
// relevance). The eval runner inserts these records and builds a
// seedKey -> memoryRecordId map at runtime.
export type SeedEntry = {
  seedKey: string;
  memory: AddMemoryInput;
};

const PROJECT_ALPHA = "project-alpha";
const PROJECT_BETA = "project-beta";
const USER_ALICE = "alice";

export const SEED_ENTRIES: readonly SeedEntry[] = [
  {
    seedKey: "alpha.canonical-pg",
    memory: {
      scopeType: "project",
      scopeId: PROJECT_ALPHA,
      projectKey: PROJECT_ALPHA,
      memoryType: "decision",
      content:
        "Decision: Postgres is the canonical store for memory records. Qdrant only holds derived chunk vectors and can be rebuilt from Postgres.",
      source: {
        scopeType: "project",
        scopeId: PROJECT_ALPHA,
        sourceType: "decision",
        sourceRef: "adr-001",
      },
    },
  },
  {
    seedKey: "alpha.chunk-size",
    memory: {
      scopeType: "project",
      scopeId: PROJECT_ALPHA,
      projectKey: PROJECT_ALPHA,
      memoryType: "decision",
      content:
        "Decision: chunk memory at 800 tokens with 120-token overlap to balance recall and embedding cost.",
      source: {
        scopeType: "project",
        scopeId: PROJECT_ALPHA,
        sourceType: "decision",
        sourceRef: "adr-002",
      },
    },
  },
  {
    seedKey: "alpha.embedding-model",
    memory: {
      scopeType: "project",
      scopeId: PROJECT_ALPHA,
      projectKey: PROJECT_ALPHA,
      memoryType: "fact",
      content:
        "OpenAI text-embedding-3-small produces 1536-dimensional vectors and is the canonical embedding model for project alpha.",
      source: {
        scopeType: "project",
        scopeId: PROJECT_ALPHA,
        sourceType: "document",
        sourceRef: "docs/embedding.md",
      },
    },
  },
  {
    seedKey: "alpha.qdrant-collection",
    memory: {
      scopeType: "project",
      scopeId: PROJECT_ALPHA,
      projectKey: PROJECT_ALPHA,
      memoryType: "fact",
      content:
        "The Qdrant collection memory_chunks_v1 holds every canonical chunk vector for project alpha.",
      source: {
        scopeType: "project",
        scopeId: PROJECT_ALPHA,
        sourceType: "document",
        sourceRef: "docs/qdrant.md",
      },
    },
  },
  {
    seedKey: "alpha.no-content-logging",
    memory: {
      scopeType: "project",
      scopeId: PROJECT_ALPHA,
      projectKey: PROJECT_ALPHA,
      memoryType: "summary",
      content:
        "Constraint: never log raw memory content or query text to stdout or stderr; redact via the pino logger config.",
      source: {
        scopeType: "project",
        scopeId: PROJECT_ALPHA,
        sourceType: "decision",
        sourceRef: "adr-003",
      },
    },
  },
  {
    seedKey: "beta.auth-deferred",
    memory: {
      scopeType: "project",
      scopeId: PROJECT_BETA,
      projectKey: PROJECT_BETA,
      memoryType: "decision",
      content:
        "Decision: defer authentication for the beta project until phase 2; phase 1 ships without auth.",
      source: {
        scopeType: "project",
        scopeId: PROJECT_BETA,
        sourceType: "decision",
        sourceRef: "beta/adr-001",
      },
    },
  },
  {
    seedKey: "beta.sqlite-local",
    memory: {
      scopeType: "project",
      scopeId: PROJECT_BETA,
      projectKey: PROJECT_BETA,
      memoryType: "fact",
      content:
        "Beta project uses SQLite for local development only; production runs on Postgres like alpha.",
      source: {
        scopeType: "project",
        scopeId: PROJECT_BETA,
        sourceType: "document",
        sourceRef: "beta/README.md",
      },
    },
  },
  {
    seedKey: "alice.korean-default",
    memory: {
      scopeType: "user",
      scopeId: USER_ALICE,
      memoryType: "decision",
      content:
        "Decision: Alice prefers Korean responses by default. Switch to English only for code blocks or when the project explicitly says so.",
      source: {
        scopeType: "user",
        scopeId: USER_ALICE,
        sourceType: "decision",
        sourceRef: "alice/adr-001",
      },
    },
  },
  {
    seedKey: "alice.tabs-typescript",
    memory: {
      scopeType: "user",
      scopeId: USER_ALICE,
      memoryType: "fact",
      content:
        "Alice formats TypeScript with tabs, not spaces, and configures her editor accordingly.",
      source: {
        scopeType: "user",
        scopeId: USER_ALICE,
        sourceType: "document",
        sourceRef: "alice/profile.md",
      },
    },
  },
  {
    seedKey: "alpha.migration-003-durability",
    memory: {
      scopeType: "project",
      scopeId: PROJECT_ALPHA,
      projectKey: PROJECT_ALPHA,
      memoryType: "summary",
      content:
        "Migration 003 added the durability column to memory_records with default value 'ephemeral' so legacy rows do not need backfill.",
      source: {
        scopeType: "project",
        scopeId: PROJECT_ALPHA,
        sourceType: "document",
        sourceRef: "migrations/003.sql",
      },
    },
  },
];
