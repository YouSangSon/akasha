import type { PgPool } from "../db/connection.js";
import { assertNonBlankText } from "../store/memory-content.js";

export type AuditOutcome = "ok" | "error";

export type AuditLogEntry = {
  organizationId: string;
  actor: string;
  tool: string;
  projectKey?: string | null;
  outcome: AuditOutcome;
  errorMessage?: string | null;
  durationMs: number;
  requestId?: string | null;
};

export type StoredAuditLogEntry = AuditLogEntry & {
  id: number;
  createdAt: string;
};

export type AuditLogRepository = {
  record(entry: AuditLogEntry): Promise<void>;
  listByOrganization(
    organizationId: string,
    options?: { limit?: number },
  ): Promise<StoredAuditLogEntry[]>;
};

type AuditLogRow = {
  id: number;
  organization_id: string;
  actor: string;
  tool: string;
  project_key: string | null;
  outcome: AuditOutcome;
  error_message: string | null;
  duration_ms: number;
  request_id: string | null;
  created_at: string | Date;
};

export function createAuditLogRepository(pool: PgPool): AuditLogRepository {
  assertAuditLogPool(pool);

  return {
    async record(entry) {
      assertAuditLogEntry(entry);

      await pool.query(
        `
          INSERT INTO audit_log (
            organization_id,
            actor,
            tool,
            project_key,
            outcome,
            error_message,
            duration_ms,
            request_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          entry.organizationId,
          entry.actor,
          entry.tool,
          entry.projectKey ?? null,
          entry.outcome,
          entry.errorMessage != null
            ? entry.errorMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH)
            : null,
          entry.durationMs,
          entry.requestId ?? null,
        ],
      );
    },

    async listByOrganization(organizationId, options) {
      assertNonBlankText(organizationId, "organizationId");

      const limit = resolveAuditLimit(options);
      const result = await pool.query<AuditLogRow>(
        `
          SELECT
            id,
            organization_id,
            actor,
            tool,
            project_key,
            outcome,
            error_message,
            duration_ms,
            request_id,
            created_at
          FROM audit_log
          WHERE organization_id = $1
          ORDER BY id DESC
          LIMIT $2
        `,
        [organizationId, limit],
      );

      return result.rows.map(mapAuditLogRow);
    },
  };
}

function mapAuditLogRow(row: AuditLogRow): StoredAuditLogEntry {
  return {
    id: typeof row.id === "number" ? row.id : Number(row.id),
    organizationId: row.organization_id,
    actor: row.actor,
    tool: row.tool,
    projectKey: row.project_key,
    outcome: row.outcome,
    errorMessage: row.error_message,
    durationMs: row.duration_ms,
    requestId: row.request_id,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  };
}

const DEFAULT_AUDIT_LIMIT = 100;
const MAX_AUDIT_LIMIT = 1000;
const MAX_ERROR_MESSAGE_LENGTH = 1024;

function assertAuditLogPool(value: unknown): asserts value is PgPool {
  const candidate = assertObject(value, "audit log pool");
  assertFunction(candidate.query, "audit log pool.query");
}

function assertAuditLogEntry(
  value: unknown,
): asserts value is AuditLogEntry {
  const candidate = assertObject(value, "audit log entry");
  assertNonBlankText(candidate.organizationId, "organizationId");
  assertNonBlankText(candidate.actor, "actor");
  assertNonBlankText(candidate.tool, "tool");
  assertOptionalNonBlankStringOrNull(candidate.projectKey, "projectKey");
  assertAuditOutcome(candidate.outcome, "outcome");
  assertOptionalStringOrNull(candidate.errorMessage, "errorMessage");
  assertNonNegativeFiniteNumber(candidate.durationMs, "durationMs");
  assertOptionalNonBlankStringOrNull(candidate.requestId, "requestId");
}

function resolveAuditLimit(options: { limit?: number } | undefined): number {
  if (options === undefined) {
    return DEFAULT_AUDIT_LIMIT;
  }
  const candidate = assertObject(options, "audit log list options");
  return clampAuditLimit(candidate.limit as number | undefined);
}

function clampAuditLimit(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_AUDIT_LIMIT;
  }
  if (!Number.isInteger(value) || value < 1 || value > MAX_AUDIT_LIMIT) {
    throw new Error(
      `audit log limit must be a positive integer up to ${MAX_AUDIT_LIMIT}`,
    );
  }
  return value;
}

function assertAuditOutcome(
  value: unknown,
  fieldName: string,
): asserts value is AuditOutcome {
  if (value !== "ok" && value !== "error") {
    throw new Error(`${fieldName} must be "ok" or "error"`);
  }
}

function assertObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertFunction(value: unknown, fieldName: string): void {
  if (typeof value !== "function") {
    throw new Error(`${fieldName} must be a function`);
  }
}

function assertOptionalStringOrNull(value: unknown, fieldName: string): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string when provided`);
  }
}

function assertOptionalNonBlankStringOrNull(
  value: unknown,
  fieldName: string,
): void {
  if (value === undefined || value === null) {
    return;
  }
  assertNonBlankText(value, fieldName);
}

function assertNonNegativeFiniteNumber(
  value: unknown,
  fieldName: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative finite number`);
  }
}
