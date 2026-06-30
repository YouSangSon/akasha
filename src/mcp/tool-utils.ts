import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import type { AddMemoryInput, ScopeType } from "../types.js";

export const SUPPORTED_MEMORY_KINDS = ["decision", "summary", "fact"] as const;
export const SUPPORTED_DURABILITY_VALUES = [
  "ephemeral",
  "durable",
  "archived",
] as const;
export const SUPPORTED_SCOPE_TYPES = ["project", "user"] as const;
export const SUPPORTED_GOAL_RUN_OUTCOMES = [
  "success",
  "failure",
  "partial",
] as const;
export const SUPPORTED_GOAL_RUN_STATUSES = [
  "active",
  "completed",
  "abandoned",
] as const;
export const POSTGRES_INTEGER_MIN = -2147483648;
export const POSTGRES_INTEGER_MAX = 2147483647;

export function formatMemoryIdentifier(record: {
  scopeType: string;
  scopeId: string;
  id: number;
}): string {
  return `${record.scopeType}:${record.scopeId}:${record.id}`;
}

export function requireProjectKey(
  projectKey: unknown,
  scope: ScopeType,
): string {
  if (projectKey === undefined) {
    throw new Error(
      `projectKey is required for ${scope} scope operations and must contain non-whitespace text`,
    );
  }
  if (typeof projectKey !== "string") {
    throw new Error("projectKey must be a string");
  }
  if (projectKey.trim().length === 0) {
    throw new Error(
      `projectKey is required for ${scope} scope operations and must contain non-whitespace text`,
    );
  }

  return projectKey;
}

export function requireUserScopeId(userScopeId: unknown): string {
  if (userScopeId === undefined) {
    throw new Error("userScopeId could not be resolved to non-whitespace text");
  }
  if (typeof userScopeId !== "string") {
    throw new Error("userScopeId must be a string");
  }
  if (userScopeId.trim().length === 0) {
    throw new Error("userScopeId could not be resolved to non-whitespace text");
  }

  return userScopeId;
}

export function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 10;
  }
  if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
    throw new Error("limit must be a positive integer up to 100");
  }
  return limit;
}

export function toMemoryType(kind: string): AddMemoryInput["memoryType"] {
  switch (kind) {
    case "decision":
    case "summary":
    case "fact":
      return kind;
    default:
      throw new Error(`Unsupported memory kind: ${kind}`);
  }
}

export function summarize(content: string): string {
  return content.slice(0, 80);
}

export type ResolveUserScopeIdInput = {
  cwd: string;
  explicitUserScopeId?: string;
  defaultUserScopeId?: string;
};

export function resolveUserScopeId(input: ResolveUserScopeIdInput): string {
  assertResolveUserScopeIdInput(input);

  if (input.explicitUserScopeId !== undefined) {
    return requireUserScopeId(input.explicitUserScopeId);
  }

  if (input.defaultUserScopeId !== undefined) {
    return requireUserScopeId(input.defaultUserScopeId);
  }

  if (process.env.DEVELOPER_MEMORY_USER_ID !== undefined) {
    const configuredUserId = process.env.DEVELOPER_MEMORY_USER_ID.trim();
    if (configuredUserId.length === 0) {
      throw new Error(
        "DEVELOPER_MEMORY_USER_ID must contain non-whitespace text",
      );
    }
    return configuredUserId;
  }

  const gitEmail = readGitEmail(input.cwd);

  if (gitEmail) {
    return `git-${createHash("sha256").update(gitEmail).digest("hex").slice(0, 12)}`;
  }

  return `local-${sanitizeScopeId(os.userInfo().username)}`;
}

function assertResolveUserScopeIdInput(
  input: unknown,
): asserts input is ResolveUserScopeIdInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("resolveUserScopeId input must be an object");
  }

  const candidate = input as Record<string, unknown>;
  assertNonBlankString(candidate.cwd, "cwd");
  assertOptionalString(candidate.explicitUserScopeId, "explicitUserScopeId");
  assertOptionalString(candidate.defaultUserScopeId, "defaultUserScopeId");
}

function assertNonBlankString(value: unknown, fieldName: string): void {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must contain non-whitespace text`);
  }
}

function assertOptionalString(value: unknown, fieldName: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
}

function readGitEmail(cwd: string): string | null {
  try {
    return execFileSync("git", ["config", "user.email"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function sanitizeScopeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}
