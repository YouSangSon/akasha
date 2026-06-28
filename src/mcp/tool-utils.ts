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
  projectKey: string | undefined,
  scope: ScopeType,
): string {
  if (projectKey === undefined || projectKey.trim().length === 0) {
    throw new Error(
      `projectKey is required for ${scope} scope operations and must contain non-whitespace text`,
    );
  }

  return projectKey;
}

export function requireUserScopeId(userScopeId: string | undefined): string {
  if (userScopeId === undefined || userScopeId.trim().length === 0) {
    throw new Error("userScopeId could not be resolved to non-whitespace text");
  }

  return userScopeId;
}

export function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 10;
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("limit must be a positive integer");
  }
  return Math.min(limit, 100);
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

export function resolveUserScopeId(input: {
  cwd: string;
  explicitUserScopeId?: string;
  defaultUserScopeId?: string;
}): string {
  if (input.explicitUserScopeId) {
    return input.explicitUserScopeId;
  }

  if (input.defaultUserScopeId) {
    return input.defaultUserScopeId;
  }

  const configuredUserId = process.env.DEVELOPER_MEMORY_USER_ID?.trim();

  if (configuredUserId) {
    return configuredUserId;
  }

  const gitEmail = readGitEmail(input.cwd);

  if (gitEmail) {
    return `git-${createHash("sha256").update(gitEmail).digest("hex").slice(0, 12)}`;
  }

  return `local-${sanitizeScopeId(os.userInfo().username)}`;
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
