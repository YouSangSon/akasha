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
  return {
    async record(entry) {
      assertNonBlankText(entry.organizationId, "organizationId");

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

      const limit = clampAuditLimit(options?.limit);
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
