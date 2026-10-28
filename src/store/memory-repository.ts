import { createHash } from "node:crypto";
import type { PgPool, PgQueryable } from "../db/connection.js";
import { requireSingleRow, toIsoString, toNumber } from "./db-utils.js";
import {
  extractEntityMentions,
  type EntityMention,
} from "../entities/entity-extraction.js";
import { rootLogger } from "../logger.js";
import { tokenizeLexicalQuery } from "../search/lexical-score.js";
import type {
  AddMemoryInput,
  CanonicalMemoryRepository,
  MemoryGraphEntity,
  MemoryGraphRelationship,
  MemoryGraphView,
  MemorySource,
  ScopeRef,
  SearchMemoryResult,
} from "../types.js";
import { assertOrganizationId } from "./assert-organization-id.js";
import {
  assertNonBlankMemoryContent,
  assertNonBlankText,
} from "./memory-content.js";
import { scanForSecrets, SecretDetectedError } from "./secret-scrub.js";

const DEFAULT_ORG_ID = "default";
const MAX_STORED_ENTITY_MENTIONS = 64;
const MAX_QUERY_ENTITY_MENTIONS = 16;
const MAX_ENTITY_RELATIONSHIPS_PER_MEMORY = 96;
const POSTGRES_INTEGER_MIN = -2147483648;
const POSTGRES_INTEGER_MAX = 2147483647;

type PostgresMemoryRow = {
  id: number | string;
  organization_id: string;
  scope_type: unknown;
  scope_id: string;
  project_key: string | null;
  kind: unknown;
  title: string | null;
  content: string;
  summary: string | null;
  durability: unknown;
  importance: number | string;
  source_id: number | string;
  created_at: string | Date;
  updated_at: string | Date;
};

type PostgresSourceRow = {
  source_id_joined: number | string;
  source_organization_id: string;
  source_scope_type: unknown;
  source_scope_id: string;
  source_type: unknown;
  source_ref: string;
  source_title: string | null;
  source_created_at: string | Date;
};

type PostgresSearchRow = PostgresMemoryRow & PostgresSourceRow;

type PostgresTaggedRow = {
  tags: string[] | null;
};

type PostgresHydratedRow = PostgresSearchRow & PostgresTaggedRow;

type PostgresEntityRow = {
  id: number | string;
  kind: EntityMention["kind"];
  normalized: string;
};

type PostgresGraphEntityRow = {
  id: number | string;
  organization_id: string;
  kind: EntityMention["kind"];
  normalized: string;
  display_text: string;
  first_seen_at: string | Date;
  last_seen_at: string | Date;
  mention_count: number | string;
  memory_ids: (number | string)[] | null;
};

type PostgresGraphRelationshipRow = {
  id: number | string;
  organization_id: string;
  from_entity_id: number | string;
  to_entity_id: number | string;
  relation_type: string;
  evidence_memory_record_id: number | string;
  valid_from: string | null;
  valid_to: string | null;
  confidence: number | string;
  created_at: string | Date;
  from_kind: EntityMention["kind"];
  from_normalized: string;
  from_display_text: string;
  to_kind: EntityMention["kind"];
  to_normalized: string;
  to_display_text: string;
};

type PersistedEntityMention = EntityMention & {
  entityId: number;
};

type EntityRelationshipInput = {
  fromEntityId: number;
  toEntityId: number;
  relationType: "co_mentions" | "temporal_context";
  validFrom: string | null;
  confidence: number;
};

type PostgresStoredSourceMetadata = {
  sourceRef: string;
  uri: string | null;
};

const SOURCE_RETURN_COLUMNS = `
  id AS source_id_joined,
  organization_id AS source_organization_id,
  scope_type AS source_scope_type,
  scope_id AS source_scope_id,
  source_type,
  source_ref,
  title AS source_title,
  captured_at AS source_created_at
`;

const SEARCH_RETURN_COLUMNS = `
  mr.id,
  mr.organization_id,
  mr.scope_type,
  mr.scope_id,
  mr.project_key,
  mr.kind,
  mr.title,
  mr.content,
  mr.summary,
  mr.durability,
  mr.importance,
  mr.source_id,
  mr.created_at,
  mr.updated_at,
  s.id AS source_id_joined,
  s.organization_id AS source_organization_id,
  s.scope_type AS source_scope_type,
  s.scope_id AS source_scope_id,
  s.source_type,
  s.source_ref,
  s.title AS source_title,
  s.captured_at AS source_created_at,
  COALESCE(mt.tags, '{}') AS tags
`;

const TAG_LATERAL_JOIN = `
  LEFT JOIN LATERAL (
    SELECT array_agg(memory_tags.tag ORDER BY memory_tags.tag) AS tags
    FROM memory_tags
    WHERE memory_tags.memory_record_id = mr.id
      AND memory_tags.organization_id = mr.organization_id
  ) mt ON TRUE
`;

export function createMemoryRepository(
  pool: PgPool,
): CanonicalMemoryRepository {
  return {
    async addMemory(input, beforeCommit) {
      assertNonBlankMemoryContent(input.content);

      const memoryType = normalizeMemoryType(input.memoryType);
      const durability = normalizeDurability(input.durability, "ephemeral");
      const importance = normalizePostgresInteger(input.importance, 0);
      const title = normalizeNullableText(input.title ?? null, "title");
      const summary =
        input.summary === undefined
          ? summarize(input.content)
          : normalizeNullableText(input.summary, "summary");
      const scopeType = mapScopeType(input.scopeType, "scopeType");
      const scopeId = mapRequiredText(input.scopeId, "scopeId");
      const sourceScopeType = mapScopeType(
        input.source.scopeType,
        "source.scopeType",
      );
      const sourceScopeId = mapRequiredText(
        input.source.scopeId,
        "source.scopeId",
      );
      const scopedInput = {
        ...input,
        scopeType,
        scopeId,
        source: {
          ...input.source,
          scopeType: sourceScopeType,
          scopeId: sourceScopeId,
        },
      };
      assertNoSecretsInMemoryFields({
        title,
        content: input.content,
        summary,
      });
      const rawOrganizationId = input.organizationId ?? DEFAULT_ORG_ID;
      assertNonBlankText(rawOrganizationId, "organizationId");
      const organizationId = rawOrganizationId.trim();
      requireSourceKey(scopedInput.source);
      normalizeNullableText(scopedInput.source.title ?? null, "source.title");
      normalizeNullableText(scopedInput.source.uri ?? null, "source.uri");
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const sourceRow = await upsertPostgresSource(
          client,
          scopedInput,
          organizationId,
        );
        const sourceId = mapPositiveSafeInteger(
          sourceRow.source_id_joined,
          "source id",
        );

        const memoryResult = await client.query<PostgresMemoryRow>(
          `
            INSERT INTO memory_records (
              organization_id,
              scope_type,
              scope_id,
              project_key,
              kind,
              title,
              content,
              summary,
              durability,
              importance,
              source_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING
              id,
              organization_id,
              scope_type,
              scope_id,
              project_key,
              kind,
              title,
              content,
              summary,
              durability,
              importance,
              source_id,
              created_at,
              updated_at
          `,
          [
            organizationId,
            scopedInput.scopeType,
            scopedInput.scopeId,
            input.projectKey ?? null,
            memoryType,
            title,
            input.content,
            summary,
            durability,
            importance,
            sourceId,
          ],
        );

        const memoryRow = requireSingleRow(memoryResult.rows[0], "memory");
        const memoryRecordId = mapPositiveSafeInteger(
          memoryRow.id,
          "memory id",
        );
        await persistPostgresEntityGraph(client, {
          input: scopedInput,
          organizationId,
          memoryRecordId,
          sourceRow,
        });

        const record = mapPostgresSearchResult({
          ...memoryRow,
          ...sourceRow,
          tags: [],
        });
        await beforeCommit?.(record);
        await client.query("COMMIT");

        return record;
      } catch (error: unknown) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async searchMemory(input) {
      if (input.organizationId !== undefined) {
        assertNonBlankText(input.organizationId, "organizationId");
      }
      const organizationId =
        input.organizationId === undefined
          ? undefined
          : input.organizationId.trim();

      if (typeof input.query !== "string") {
        throw new Error("search query must be a string");
      }

      if (input.scopes.length === 0) {
        return [];
      }
      const scopes = input.scopes.map((scope, index) => ({
        scopeType: mapScopeType(scope.scopeType, `scopes[${index}].scopeType`),
        scopeId: mapRequiredText(scope.scopeId, `scopes[${index}].scopeId`),
      }));

      const trimmedQuery = input.query.trim();
      if (trimmedQuery.length === 0) {
        return [];
      }

      const limit = normalizeLimit(input.limit, 10, 100, "limit");
      const params: unknown[] = [];
      const tsQueryIndex = params.push(trimmedQuery);
      const searchText = `
        concat_ws(
          ' ',
          mr.title,
          mr.content,
          mr.summary,
          s.title,
          s.source_ref
        )
      `;
      const phraseIndex = params.push(likeContainsPattern(trimmedQuery));
      const tsQuery = `lexical.query`;
      const fullTextClause =
        `(numnode(${tsQuery}) > 0 AND mr.search_vector @@ ${tsQuery})`;
      const searchClauses = [
        fullTextClause,
        `${searchText} ILIKE $${phraseIndex} ESCAPE '\\'`,
      ];
      const scoreExpressions = [
        `CASE WHEN numnode(${tsQuery}) > 0 THEN ts_rank_cd(mr.search_vector, ${tsQuery}, 32) * 8 ELSE 0 END`,
        `CASE WHEN ${searchText} ILIKE $${phraseIndex} ESCAPE '\\' THEN 2 ELSE 0 END`,
      ];

      for (const term of tokenizeLexicalQuery(trimmedQuery).slice(0, 12)) {
        const termIndex = params.push(likeContainsPattern(term));
        searchClauses.push(`${searchText} ILIKE $${termIndex} ESCAPE '\\'`);
        scoreExpressions.push(
          `CASE WHEN ${searchText} ILIKE $${termIndex} ESCAPE '\\' THEN 1 ELSE 0 END`,
        );
      }

      const entityMatchClause = buildEntityMatchClause(
        extractEntityMentions(trimmedQuery).slice(0, MAX_QUERY_ENTITY_MENTIONS),
        params,
      );
      if (entityMatchClause) {
        searchClauses.push(entityMatchClause);
        scoreExpressions.push(
          `CASE WHEN ${entityMatchClause} THEN 3 ELSE 0 END`,
        );
      }

      const scopeClauses = scopes.map((scope) => {
        const scopeTypeIndex = params.push(scope.scopeType);
        const scopeIdIndex = params.push(scope.scopeId);
        return `(mr.scope_type = $${scopeTypeIndex} AND mr.scope_id = $${scopeIdIndex})`;
      });

      let orgClause = "";
      if (organizationId !== undefined) {
        const orgIndex = params.push(organizationId);
        orgClause = ` AND mr.organization_id = $${orgIndex}`;
      }

      const limitIndex = params.push(limit);
      const result = await pool.query<PostgresHydratedRow>(
        `
          WITH lexical AS (
            SELECT websearch_to_tsquery('simple', $${tsQueryIndex}) AS query
          )
          SELECT ${SEARCH_RETURN_COLUMNS}
          FROM memory_records mr
          JOIN sources s ON s.id = mr.source_id
          ${TAG_LATERAL_JOIN}
          CROSS JOIN lexical
          WHERE (${searchClauses.join(" OR ")})
            AND (${scopeClauses.join(" OR ")})${orgClause}
            AND mr.durability <> 'archived'
          ORDER BY (${scoreExpressions.join(" + ")}) DESC, mr.id DESC
          LIMIT $${limitIndex}
        `,
        params,
      );

      return result.rows.map(mapPostgresSearchResult);
    },

    async listMemory(scope, options) {
      assertOrganizationId(options?.organizationId, options?.allowLegacyAnonymous, "listMemory");
      const organizationId =
        options?.organizationId === undefined
          ? undefined
          : options.organizationId.trim();
      const scopeType = mapScopeType(scope.scopeType, "scopeType");
      const scopeId = mapRequiredText(scope.scopeId, "scopeId");
      const limit = clampListLimit(options?.limit);
      const params: unknown[] = [scopeType, scopeId];
      let orgClause = "";
      if (organizationId !== undefined) {
        const orgIndex = params.push(organizationId);
        orgClause = ` AND mr.organization_id = $${orgIndex}`;
      }
      const limitIndex = params.push(limit);
      // Compaction pin: drop records tied to an active goal run so an
      // in-progress goal never loses context to dedup/decay-archive. Only the
      // compaction candidate load sets this; review paths leave it unset.
      const goalRunPinClause = options?.excludePinnedGoalRuns
        ? ` AND (mr.goal_run_id IS NULL
            OR mr.goal_run_id NOT IN (SELECT id FROM goal_runs WHERE status = 'active'))`
        : "";

      const result = await pool.query<PostgresHydratedRow>(
        `
          SELECT ${SEARCH_RETURN_COLUMNS}
          FROM memory_records mr
          JOIN sources s ON s.id = mr.source_id
          ${TAG_LATERAL_JOIN}
          WHERE mr.scope_type = $1
            AND mr.scope_id = $2${orgClause}
            AND mr.durability <> 'archived'${goalRunPinClause}
          ORDER BY mr.id DESC
          LIMIT $${limitIndex}
        `,
        params,
      );

      return result.rows.map(mapPostgresSearchResult);
    },

    async getMemoryRecordsByIds(ids, organizationId, allowLegacyAnonymous) {
      assertOrganizationId(organizationId, allowLegacyAnonymous, "getMemoryRecordsByIds");
      const scopedOrganizationId =
        organizationId === undefined ? undefined : organizationId.trim();
      if (ids.length === 0) {
        return [];
      }

      const params: unknown[] = [ids];
      let orgClause = "";
      if (scopedOrganizationId !== undefined) {
        const orgIndex = params.push(scopedOrganizationId);
        orgClause = ` AND mr.organization_id = $${orgIndex}`;
      }

      const result = await pool.query<PostgresHydratedRow>(
        `
          SELECT ${SEARCH_RETURN_COLUMNS}
          FROM memory_records mr
          JOIN sources s ON s.id = mr.source_id
          ${TAG_LATERAL_JOIN}
          WHERE mr.id = ANY($1::int[])${orgClause}
            AND mr.durability <> 'archived'
        `,
        params,
      );

      return orderRecordsByIds(result.rows.map(mapPostgresSearchResult), ids);
    },

    async listMemoryRecordIdsForIndexing(organizationId, scopes, options) {
      assertNonBlankText(organizationId, "organizationId");
      if (!Array.isArray(scopes)) {
        throw new Error("scopes must be an array");
      }
      const scopedRefs = Array.from(scopes, (scope, index) => ({
        scopeType: mapScopeType(scope?.scopeType, `scopes[${index}].scopeType`),
        scopeId: mapRequiredText(scope?.scopeId, `scopes[${index}].scopeId`),
      }));
      const afterId = options?.afterId === undefined ? 0 : options.afterId;
      const throughId = options?.throughId;
      assertNonNegativeSafeInteger(afterId, "afterId");
      if (throughId !== undefined) {
        assertNonNegativeSafeInteger(throughId, "throughId");
      }
      const limit = normalizeLimit(options?.limit, 500, MAX_LIST_LIMIT, "limit");

      if (scopedRefs.length === 0) {
        return { ids: [], throughId: throughId ?? 0 };
      }

      const params: unknown[] = [organizationId.trim()];
      const scopeClauses = scopedRefs.map((scope) => {
        const scopeTypeIndex = params.push(scope.scopeType);
        const scopeIdIndex = params.push(scope.scopeId);
        return `(mr.scope_type = $${scopeTypeIndex} AND mr.scope_id = $${scopeIdIndex})`;
      });
      const afterIdIndex = params.push(afterId);
      const throughIdClause = throughId === undefined
        ? ""
        : `AND mr.id <= $${params.push(throughId)}`;
      const limitIndex = params.push(limit);
      const result = await pool.query<{
        id: number | string;
        through_id: number | string;
      }>(
        `
          SELECT mr.id, MAX(mr.id) OVER () AS through_id
          FROM memory_records mr
          WHERE mr.organization_id = $1
            AND (${scopeClauses.join(" OR ")})
            AND mr.id > $${afterIdIndex}
            ${throughIdClause}
          ORDER BY mr.id ASC
          LIMIT $${limitIndex}
        `,
        params,
      );

      return {
        ids: result.rows.map((row) => mapPositiveSafeInteger(row.id, "memory id")),
        throughId: throughId ?? (result.rows[0]
          ? mapPositiveSafeInteger(result.rows[0].through_id, "throughId")
          : 0),
      };
    },

    async listMemoryForGovernance(scope, options) {
      assertNonBlankText(options.organizationId, "organizationId");
      const organizationId = options.organizationId.trim();
      const scopeType = mapScopeType(scope.scopeType, "scopeType");
      const scopeId = mapRequiredText(scope.scopeId, "scopeId");

      const limit = clampListLimit(options.limit);
      const params: unknown[] = [
        scopeType,
        scopeId,
        organizationId,
      ];
      let tagJoin = "";
      let tagClause = "";
      if (options.tag !== undefined) {
        assertNonBlankText(options.tag, "tag");
        const tagIndex = params.push(options.tag.trim());
        tagJoin = `
          JOIN memory_tags filter_tags
            ON filter_tags.memory_record_id = mr.id
           AND filter_tags.organization_id = mr.organization_id
        `;
        tagClause = ` AND filter_tags.tag = $${tagIndex}`;
      }
      let archivedClause = "";
      if (!options.includeArchived) {
        archivedClause = ` AND mr.durability <> 'archived'`;
      }
      const limitIndex = params.push(limit);

      const result = await pool.query<PostgresHydratedRow>(
        `
          SELECT ${SEARCH_RETURN_COLUMNS}
          FROM memory_records mr
          JOIN sources s ON s.id = mr.source_id
          ${tagJoin}
          ${TAG_LATERAL_JOIN}
          WHERE mr.scope_type = $1
            AND mr.scope_id = $2
            AND mr.organization_id = $3${archivedClause}${tagClause}
          ORDER BY mr.updated_at DESC, mr.id DESC
          LIMIT $${limitIndex}
        `,
        params,
      );

      return result.rows.map(mapPostgresSearchResult);
    },

    async inspectMemoryGraph(scope, options) {
      assertNonBlankText(options.organizationId, "organizationId");
      if (options.query !== undefined) {
        assertNonBlankText(options.query, "graph query");
      }
      return inspectPostgresMemoryGraph(pool, scope, options);
    },

    async updateMemoryRecord(input, beforeCommit) {
      assertNonBlankText(input.organizationId, "organizationId");
      const organizationId = input.organizationId.trim();
      const nextTags =
        input.tags === undefined ? undefined : normalizeTags(input.tags);

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const currentRow = await getPostgresMemoryRecordById(
          client,
          input.id,
          organizationId,
        );
        if (!currentRow) {
          await client.query("ROLLBACK");
          return null;
        }

        const nextTitle =
          input.title === undefined
            ? currentRow.title
            : normalizeNullableText(input.title, "title");
        const nextContent = input.content ?? currentRow.content;
        if (input.content !== undefined) {
          assertNonBlankMemoryContent(nextContent);
        }
        const nextSummary =
          input.summary === undefined
            ? currentRow.summary
            : normalizeNullableText(input.summary, "summary");
        const currentKind = mapMemoryType(currentRow.kind);
        const nextKind = normalizeMemoryType(input.kind, currentKind);
        const currentDurability = mapDurability(currentRow.durability);
        const nextDurability = normalizeDurability(
          input.durability,
          currentDurability,
        );
        const currentImportance = mapPostgresInteger(
          currentRow.importance,
          "importance",
        );
        const nextImportance = normalizePostgresInteger(
          input.importance,
          currentImportance,
        );
        assertNoSecretsInMemoryFields({
          title: nextTitle,
          content: nextContent,
          summary: nextSummary,
        });
        const updateResult = await client.query<PostgresMemoryRow>(
          `
            UPDATE memory_records
            SET kind = $3,
                title = $4,
                content = $5,
                summary = $6,
                importance = $7,
                durability = $8,
                updated_at = NOW()
            WHERE id = $1
              AND organization_id = $2
            RETURNING
              id,
              organization_id,
              scope_type,
              scope_id,
              project_key,
              kind,
              title,
              content,
              summary,
              durability,
              importance,
              source_id,
              created_at,
              updated_at
          `,
          [
            input.id,
            organizationId,
            nextKind,
            nextTitle,
            nextContent,
            nextSummary,
            nextImportance,
            nextDurability,
          ],
        );
        const updatedRow = requireSingleRow(updateResult.rows[0], "memory");

        if (input.tags !== undefined) {
          await replacePostgresMemoryTags(client, {
            memoryRecordId: input.id,
            organizationId,
            tags: nextTags ?? [],
          });
        }

        await deletePostgresEntityGraphForMemory(client, input.id, organizationId);
        const currentSourceMetadata = parseStoredPostgresSourceRef(
          currentRow.source_ref,
        );
        await persistPostgresEntityGraph(client, {
          input: {
            organizationId,
            scopeType: mapScopeType(updatedRow.scope_type, "memory scope_type"),
            scopeId: updatedRow.scope_id,
            projectKey: updatedRow.project_key ?? undefined,
            memoryType: mapMemoryType(updatedRow.kind),
            title: updatedRow.title ?? undefined,
            content: updatedRow.content,
            summary: updatedRow.summary ?? undefined,
            durability: mapDurability(updatedRow.durability),
            importance: mapPostgresInteger(updatedRow.importance, "importance"),
            source: {
              scopeType: mapScopeType(
                currentRow.source_scope_type,
                "memory source.scope_type",
              ),
              scopeId: currentRow.source_scope_id,
              sourceType: mapSourceType(currentRow.source_type),
              sourceRef: currentSourceMetadata.sourceRef,
              title: currentRow.source_title ?? undefined,
              uri: currentSourceMetadata.uri ?? undefined,
            },
          },
          organizationId,
          memoryRecordId: input.id,
          sourceRow: currentRow,
        });

        const hydrated = await getPostgresMemoryRecordById(
          client,
          input.id,
          organizationId,
        );

        const record = hydrated ? mapPostgresSearchResult(hydrated) : null;
        if (record) {
          await beforeCommit?.(record);
        }
        await client.query("COMMIT");
        return record;
      } catch (error: unknown) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async archiveMemoryRecord(input, beforeCommit) {
      assertPositiveSafeInteger(input.id, "id");
      assertNonBlankText(input.organizationId, "organizationId");
      const organizationId = input.organizationId.trim();

      const client = beforeCommit ? await pool.connect() : undefined;
      const queryable = client ?? pool;

      try {
        if (client) {
          await client.query("BEGIN");
        }
        const result = await queryable.query<{
          archived: boolean;
          found: boolean;
          qdrant_point_ids: string[] | null;
        }>(
          `
            WITH target AS (
              SELECT id
              FROM memory_records
              WHERE id = $1
                AND organization_id = $2
            ),
            archived AS (
              UPDATE memory_records
              SET durability = 'archived',
                  updated_at = NOW()
              WHERE id = $1
                AND organization_id = $2
                AND durability <> 'archived'
              RETURNING id
            )
            SELECT
              EXISTS (SELECT 1 FROM archived) AS archived,
              EXISTS (SELECT 1 FROM target) AS found,
              COALESCE(
                array_agg(mc.qdrant_point_id) FILTER (WHERE mc.qdrant_point_id IS NOT NULL),
                '{}'
              ) AS qdrant_point_ids
            FROM target
            LEFT JOIN memory_chunks mc
              ON mc.memory_record_id = target.id
             AND mc.organization_id = $2
          `,
          [input.id, organizationId],
        );

        const archiveResult = mapArchiveMemoryRecordRow(result.rows[0]);
        if (archiveResult.found) {
          await beforeCommit?.(input.id);
        }
        if (client) {
          await client.query("COMMIT");
        }
        return {
          archived: archiveResult.archived,
          qdrantPointIds: archiveResult.qdrantPointIds,
        };
      } catch (error: unknown) {
        if (client) {
          await client.query("ROLLBACK").catch(() => undefined);
        }
        throw error;
      } finally {
        client?.release();
      }
    },

    async getMemoryRecordById(id, organizationId) {
      assertNonBlankText(organizationId, "organizationId");
      const result = await getPostgresMemoryRecordById(
        pool,
        id,
        organizationId.trim(),
      );
      return result ? mapPostgresSearchResult(result) : null;
    },

    async deleteMemoryRecord(id, organizationId) {
      assertNonBlankText(organizationId, "organizationId");
      const scopedOrganizationId = organizationId.trim();

      // Single-statement rollback. ON DELETE CASCADE on memory_chunks,
      // ingest_jobs, and relationships (defined in migrations/001_initial.sql)
      // removes every dependent row in the same transaction Postgres uses
      // for this DELETE — no explicit child-table cleanup required.
      // organization_id is required to prevent cross-tenant deletion (SEC-5).
      await pool.query(
        `DELETE FROM memory_records WHERE id = $1 AND organization_id = $2`,
        [id, scopedOrganizationId],
      );
    },
  };
}

function mapPostgresSearchResult(row: PostgresHydratedRow): SearchMemoryResult {
  const sourceMetadata = parseStoredPostgresSourceRef(row.source_ref);

  return {
    id: mapPositiveSafeInteger(row.id, "memory id"),
    organizationId: mapRequiredText(
      row.organization_id,
      "memory organization_id",
    ),
    sourceId: mapPositiveSafeInteger(row.source_id, "memory source_id"),
    scopeType: mapScopeType(row.scope_type, "memory scope_type"),
    scopeId: mapRequiredText(row.scope_id, "memory scope_id"),
    projectKey: mapNullableText(row.project_key, "memory project_key"),
    memoryType: mapMemoryType(row.kind),
    title: mapNullableText(row.title, "memory title"),
    content: mapMemoryContent(row.content),
    summary: mapNullableText(row.summary, "memory summary"),
    durability: mapDurability(row.durability),
    importance: mapPostgresInteger(row.importance, "importance"),
    tags: mapStoredTags(row.tags),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    source: {
      id: mapPositiveSafeInteger(row.source_id_joined, "memory source.id"),
      organizationId: mapRequiredText(
        row.source_organization_id,
        "memory source.organization_id",
      ),
      scopeType: mapScopeType(row.source_scope_type, "memory source.scope_type"),
      scopeId: mapRequiredText(row.source_scope_id, "memory source.scope_id"),
      sourceType: mapSourceType(row.source_type),
      externalId: sourceMetadata.sourceRef,
      sourceRef: sourceMetadata.sourceRef,
      title: mapNullableText(row.source_title, "memory source.title"),
      uri: sourceMetadata.uri,
      createdAt: toIsoString(row.source_created_at),
    },
  };
}

async function getPostgresMemoryRecordById(
  queryable: PgQueryable,
  id: number,
  organizationId: string,
): Promise<PostgresHydratedRow | null> {
  const result = await queryable.query<PostgresHydratedRow>(
    `
      SELECT ${SEARCH_RETURN_COLUMNS}
      FROM memory_records mr
      JOIN sources s ON s.id = mr.source_id
      ${TAG_LATERAL_JOIN}
      WHERE mr.id = $1
        AND mr.organization_id = $2
      LIMIT 1
    `,
    [id, organizationId],
  );

  return result.rows[0] ?? null;
}

async function inspectPostgresMemoryGraph(
  queryable: PgQueryable,
  scope: ScopeRef,
  options: {
    organizationId: string;
    kind?: EntityMention["kind"];
    query?: string;
    includeArchived?: boolean;
    limit?: number;
    relationshipLimit?: number;
  },
): Promise<MemoryGraphView> {
  const organizationId = options.organizationId.trim();
  const scopeType = mapScopeType(scope.scopeType, "scopeType");
  const scopeId = mapRequiredText(scope.scopeId, "scopeId");
  const limit = clampListLimit(options.limit);
  const relationshipLimit = clampListLimit(
    options.relationshipLimit ?? options.limit,
    options.relationshipLimit === undefined ? "limit" : "relationshipLimit",
  );
  const params: unknown[] = [
    organizationId,
    scopeType,
    scopeId,
  ];
  const archivedClause = options.includeArchived
    ? ""
    : " AND mr.durability <> 'archived'";
  let kindClause = "";
  if (options.kind !== undefined) {
    const kindIndex = params.push(options.kind);
    kindClause = ` AND e.kind = $${kindIndex}`;
  }
  let queryClause = "";
  const trimmedQuery = options.query?.trim();
  if (trimmedQuery) {
    const queryIndex = params.push(likeContainsPattern(trimmedQuery));
    queryClause =
      ` AND (e.normalized ILIKE $${queryIndex} ESCAPE '\\' ` +
      `OR e.display_text ILIKE $${queryIndex} ESCAPE '\\')`;
  }
  const limitIndex = params.push(limit);

  const entityResult = await queryable.query<PostgresGraphEntityRow>(
    `
      SELECT
        e.id,
        e.organization_id,
        e.kind,
        e.normalized,
        e.display_text,
        e.first_seen_at,
        e.last_seen_at,
        COUNT(DISTINCT mem.memory_record_id)::int AS mention_count,
        COALESCE(
          array_agg(DISTINCT mem.memory_record_id ORDER BY mem.memory_record_id DESC),
          '{}'
        ) AS memory_ids
      FROM entities e
      JOIN memory_entity_mentions mem
        ON mem.entity_id = e.id
       AND mem.organization_id = e.organization_id
      JOIN memory_records mr
        ON mr.id = mem.memory_record_id
       AND mr.organization_id = e.organization_id
      WHERE e.organization_id = $1
        AND mr.scope_type = $2
        AND mr.scope_id = $3${archivedClause}${kindClause}${queryClause}
      GROUP BY
        e.id,
        e.organization_id,
        e.kind,
        e.normalized,
        e.display_text,
        e.first_seen_at,
        e.last_seen_at
      ORDER BY mention_count DESC, e.last_seen_at DESC, e.id DESC
      LIMIT $${limitIndex}
    `,
    params,
  );

  const entities = entityResult.rows.map(mapPostgresGraphEntity);
  const entityIds = entities.map((entity) => entity.id);
  if (entityIds.length === 0) {
    return { entities, relationships: [] };
  }

  const relationshipParams: unknown[] = [
    organizationId,
    scopeType,
    scopeId,
    entityIds,
  ];
  const relationshipLimitIndex = relationshipParams.push(relationshipLimit);
  const relationshipResult =
    await queryable.query<PostgresGraphRelationshipRow>(
      `
        SELECT
          er.id,
          er.organization_id,
          er.from_entity_id,
          er.to_entity_id,
          er.relation_type,
          er.evidence_memory_record_id,
          er.valid_from::text AS valid_from,
          er.valid_to::text AS valid_to,
          er.confidence::float8 AS confidence,
          er.created_at,
          from_e.kind AS from_kind,
          from_e.normalized AS from_normalized,
          from_e.display_text AS from_display_text,
          to_e.kind AS to_kind,
          to_e.normalized AS to_normalized,
          to_e.display_text AS to_display_text
        FROM entity_relationships er
        JOIN memory_records mr
          ON mr.id = er.evidence_memory_record_id
         AND mr.organization_id = er.organization_id
        JOIN entities from_e
          ON from_e.id = er.from_entity_id
         AND from_e.organization_id = er.organization_id
        JOIN entities to_e
          ON to_e.id = er.to_entity_id
         AND to_e.organization_id = er.organization_id
        WHERE er.organization_id = $1
          AND mr.scope_type = $2
          AND mr.scope_id = $3${archivedClause}
          AND (
            er.from_entity_id = ANY($4::bigint[])
            OR er.to_entity_id = ANY($4::bigint[])
          )
        ORDER BY er.created_at DESC, er.id DESC
        LIMIT $${relationshipLimitIndex}
      `,
      relationshipParams,
    );

  return {
    entities,
    relationships: relationshipResult.rows.map(mapPostgresGraphRelationship),
  };
}

function mapPostgresGraphEntity(row: PostgresGraphEntityRow): MemoryGraphEntity {
  return {
    id: mapPositiveSafeInteger(row.id, "graph entity id"),
    organizationId: mapRequiredText(
      row.organization_id,
      "graph entity organization_id",
    ),
    kind: mapEntityKind(row.kind, "graph entity kind"),
    normalized: mapRequiredText(row.normalized, "graph entity normalized"),
    displayText: mapRequiredText(row.display_text, "graph entity display_text"),
    firstSeenAt: toIsoString(row.first_seen_at),
    lastSeenAt: toIsoString(row.last_seen_at),
    mentionCount: mapNonNegativeSafeInteger(
      row.mention_count,
      "graph entity mention_count",
    ),
    memoryIds: toPositiveSafeIntegerArray(
      row.memory_ids,
      "graph entity memory_ids",
    ),
  };
}

function mapPostgresGraphRelationship(
  row: PostgresGraphRelationshipRow,
): MemoryGraphRelationship {
  const fromEntityId = mapPositiveSafeInteger(
    row.from_entity_id,
    "graph relationship from_entity_id",
  );
  const toEntityId = mapPositiveSafeInteger(
    row.to_entity_id,
    "graph relationship to_entity_id",
  );

  return {
    id: mapPositiveSafeInteger(row.id, "graph relationship id"),
    organizationId: mapRequiredText(
      row.organization_id,
      "graph relationship organization_id",
    ),
    fromEntityId,
    toEntityId,
    fromEntity: {
      id: fromEntityId,
      kind: mapEntityKind(row.from_kind, "graph relationship from.kind"),
      normalized: mapRequiredText(
        row.from_normalized,
        "graph relationship from.normalized",
      ),
      displayText: mapRequiredText(
        row.from_display_text,
        "graph relationship from.display_text",
      ),
    },
    toEntity: {
      id: toEntityId,
      kind: mapEntityKind(row.to_kind, "graph relationship to.kind"),
      normalized: mapRequiredText(
        row.to_normalized,
        "graph relationship to.normalized",
      ),
      displayText: mapRequiredText(
        row.to_display_text,
        "graph relationship to.display_text",
      ),
    },
    relationType: mapRequiredText(
      row.relation_type,
      "graph relationship relation_type",
    ),
    evidenceMemoryRecordId: mapPositiveSafeInteger(
      row.evidence_memory_record_id,
      "graph relationship evidence_memory_record_id",
    ),
    validFrom: mapNullableNonBlankText(
      row.valid_from,
      "graph relationship valid_from",
    ),
    validTo: mapNullableNonBlankText(
      row.valid_to,
      "graph relationship valid_to",
    ),
    confidence: mapConfidence(row.confidence, "graph relationship confidence"),
    createdAt: toIsoString(row.created_at),
  };
}

function requireSourceKey(input: AddMemoryInput["source"]): string {
  const sourceKey = input.sourceRef ?? input.externalId;

  if (sourceKey === undefined) {
    throw new Error(
      "Memory source provenance is required: provide sourceRef or externalId",
    );
  }

  assertNonBlankText(sourceKey, "sourceRef or externalId");
  return sourceKey.trim();
}

function summarize(content: string): string {
  return content.length <= 180 ? content : `${content.slice(0, 177)}...`;
}

function toPositiveSafeIntegerArray(
  values: readonly (number | string)[] | null,
  fieldName: string,
): number[] {
  return (values ?? []).map((value, index) =>
    mapPositiveSafeInteger(value, `${fieldName}[${index}]`),
  );
}

function likeContainsPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

function assertNoSecretsInMemoryFields(input: {
  title: string | null;
  content: string;
  summary: string | null;
}): void {
  const detections = [
    ...(input.title ? scanForSecrets(input.title) : []),
    ...scanForSecrets(input.content),
    ...(input.summary ? scanForSecrets(input.summary) : []),
  ];

  if (detections.length > 0) {
    throw new SecretDetectedError(
      detections.map((detection) => detection.category),
    );
  }
}

function normalizeNullableText(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function normalizeMemoryType(
  value: SearchMemoryResult["memoryType"] | undefined,
  fallback?: SearchMemoryResult["memoryType"],
): SearchMemoryResult["memoryType"] {
  const nextValue = value ?? fallback;
  if (
    nextValue === "decision" ||
    nextValue === "fact" ||
    nextValue === "summary"
  ) {
    return nextValue;
  }
  throw new Error("kind must be one of: decision, summary, fact");
}

function normalizeDurability(
  value: NonNullable<SearchMemoryResult["durability"]> | undefined,
  fallback: NonNullable<SearchMemoryResult["durability"]>,
): NonNullable<SearchMemoryResult["durability"]> {
  if (value === undefined) {
    return fallback;
  }
  if (value === "ephemeral" || value === "durable" || value === "archived") {
    return value;
  }
  throw new Error("durability must be one of: ephemeral, durable, archived");
}

function normalizePostgresInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (
    !Number.isInteger(value) ||
    value < POSTGRES_INTEGER_MIN ||
    value > POSTGRES_INTEGER_MAX
  ) {
    throw new Error("importance must be a Postgres integer");
  }
  return value;
}

function mapPostgresInteger(value: unknown, fieldName: string): number {
  const numberValue = toNumber(value);
  if (
    !Number.isInteger(numberValue) ||
    numberValue < POSTGRES_INTEGER_MIN ||
    numberValue > POSTGRES_INTEGER_MAX
  ) {
    throw new Error(`${fieldName} must be a Postgres integer`);
  }
  return numberValue;
}

function mapNonNegativeSafeInteger(value: unknown, fieldName: string): number {
  const numberValue = toNumber(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    throw new Error(`${fieldName} must be a non-negative safe integer`);
  }
  return numberValue;
}

function mapPositiveSafeInteger(value: unknown, fieldName: string): number {
  const numberValue = toNumber(value);
  if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }
  return numberValue;
}

function mapRequiredText(value: unknown, fieldName: string): string {
  assertNonBlankText(value, fieldName);
  return value.trim();
}

function mapMemoryContent(value: unknown): string {
  assertNonBlankMemoryContent(value);
  return value;
}

function mapNullableText(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  throw new Error(`${fieldName} must be a string or null`);
}

function mapNullableNonBlankText(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string or null`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must contain non-whitespace text`);
  }
  return value.trim();
}

function mapEntityKind(
  value: unknown,
  fieldName: string,
): EntityMention["kind"] {
  if (
    value === "code_symbol" ||
    value === "path" ||
    value === "url" ||
    value === "date" ||
    value === "proper_noun"
  ) {
    return value;
  }
  throw new Error(
    `${fieldName} must be one of: code_symbol, path, url, date, proper_noun`,
  );
}

function assertNonNegativeSafeInteger(value: unknown, fieldName: string): void {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(`${fieldName} must be a non-negative safe integer`);
  }
}

function assertPositiveSafeInteger(value: unknown, fieldName: string): void {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`${fieldName} must be a positive safe integer`);
  }
}

function mapScopeType(
  value: unknown,
  fieldName: string,
): SearchMemoryResult["scopeType"] {
  if (value === "user" || value === "project") {
    return value;
  }
  throw new Error(`${fieldName} must be one of: user, project`);
}

function mapMemoryType(value: unknown): SearchMemoryResult["memoryType"] {
  if (value === "decision" || value === "fact" || value === "summary") {
    return value;
  }
  throw new Error("kind must be one of: decision, summary, fact");
}

function mapDurability(
  value: unknown,
): NonNullable<SearchMemoryResult["durability"]> {
  if (value === "ephemeral" || value === "durable" || value === "archived") {
    return value;
  }
  throw new Error("durability must be one of: ephemeral, durable, archived");
}

function mapSourceType(value: unknown): MemorySource["sourceType"] {
  if (value === "decision" || value === "document" || value === "conversation") {
    return value;
  }
  throw new Error(
    "memory source_type must be one of: decision, document, conversation",
  );
}

function mapStoredTags(value: unknown): string[] {
  return mapNonBlankStringArray(value, "memory tags");
}

function mapArchiveMemoryRecordRow(row: {
  archived?: unknown;
  found?: unknown;
  qdrant_point_ids?: unknown;
} | undefined): {
  archived: boolean;
  found: boolean;
  qdrantPointIds: string[];
} {
  if (row === undefined) {
    return { archived: false, found: false, qdrantPointIds: [] };
  }
  const found = mapBoolean(row.found, "archive memory found");
  if (!found) {
    return { archived: false, found, qdrantPointIds: [] };
  }
  return {
    archived: mapBoolean(row.archived, "archive memory archived"),
    found,
    qdrantPointIds: mapNonBlankStringArray(
      row.qdrant_point_ids,
      "archive memory qdrant_point_ids",
    ),
  };
}

function mapBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`);
  }
  return value;
}

function mapNonBlankStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
  const values: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") {
      throw new Error(`${fieldName}[${index}] must be a string`);
    }
    if (item.trim().length === 0) {
      throw new Error(
        `${fieldName}[${index}] must contain non-whitespace text`,
      );
    }
    values.push(item.trim());
  }
  return values;
}

function mapConfidence(value: unknown, fieldName: string): number {
  const numberValue = toNumber(value);
  if (numberValue < 0 || numberValue > 1) {
    throw new Error(`${fieldName} must be between 0 and 1`);
  }
  return numberValue;
}

function orderRecordsByIds(
  records: SearchMemoryResult[],
  ids: number[],
): SearchMemoryResult[] {
  const recordsById = new Map(records.map((record) => [record.id, record]));

  return ids.flatMap((id) => {
    const record = recordsById.get(id);
    return record ? [record] : [];
  });
}

async function upsertPostgresSource(
  queryable: PgQueryable,
  input: AddMemoryInput,
  organizationId: string,
): Promise<PostgresSourceRow> {
  const sourceKey = requireSourceKey(input.source);
  const sourceTitle = normalizeNullableText(
    input.source.title ?? null,
    "source.title",
  );
  const sourceUri = normalizeNullableText(
    input.source.uri ?? null,
    "source.uri",
  );
  // Push the source_ref match into the DB — source_ref is stored as JSON
  // {"sourceRef":...,"uri":...}, so we extract with ::jsonb->>'sourceRef'.
  // LIMIT 1 + ORDER BY id ASC preserves the lowest-id-match semantics of
  // the prior JS .find().
  const existingResult = await queryable.query<PostgresSourceRow>(
    `
      SELECT ${SOURCE_RETURN_COLUMNS}
      FROM sources
      WHERE organization_id = $1
        AND scope_type = $2
        AND scope_id = $3
        AND source_type = $4
        AND source_ref::jsonb->>'sourceRef' = $5
      ORDER BY id ASC
      LIMIT 1
    `,
    [
      organizationId,
      input.source.scopeType,
      input.source.scopeId,
      input.source.sourceType,
      sourceKey,
    ],
  );

  const existingRow = existingResult.rows[0];

  const nextSourceRef = serializeStoredPostgresSourceRef({
    sourceRef: sourceKey,
    uri:
      sourceUri
      ?? (existingRow
        ? parseStoredPostgresSourceRef(existingRow.source_ref).uri
        : null),
  });

  if (existingRow) {
    const updatedResult = await queryable.query<PostgresSourceRow>(
      `
        UPDATE sources
        SET title = COALESCE($2, title),
            source_ref = $3
        WHERE id = $1
        RETURNING ${SOURCE_RETURN_COLUMNS}
      `,
      [
        existingRow.source_id_joined,
        sourceTitle,
        nextSourceRef,
      ],
    );

    return requireSingleRow(updatedResult.rows[0], "source");
  }

  const createdResult = await queryable.query<PostgresSourceRow>(
    `
      INSERT INTO sources (
        organization_id,
        scope_type,
        scope_id,
        source_type,
        source_ref,
        title,
        content_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${SOURCE_RETURN_COLUMNS}
    `,
    [
      organizationId,
      input.source.scopeType,
      input.source.scopeId,
      input.source.sourceType,
      nextSourceRef,
      sourceTitle,
      createHash("sha256").update(input.content).digest("hex"),
    ],
  );

  return requireSingleRow(createdResult.rows[0], "source");
}

async function persistPostgresEntityGraph(
  queryable: PgQueryable,
  input: {
    input: AddMemoryInput;
    organizationId: string;
    memoryRecordId: number;
    sourceRow: PostgresSourceRow;
  },
): Promise<void> {
  const mentions = extractEntityMentions(
    buildEntityExtractionText(input.input, input.sourceRow),
  ).slice(0, MAX_STORED_ENTITY_MENTIONS);

  if (mentions.length === 0) {
    return;
  }

  const entitiesByKey = await upsertPostgresEntities(
    queryable,
    input.organizationId,
    mentions,
  );
  const persistedMentions = mentions.flatMap((mention) => {
    const entity = entitiesByKey.get(entityMentionKey(mention));
    return entity
      ? [
        {
          ...mention,
          entityId: mapPositiveSafeInteger(entity.id, "entity id"),
        },
      ]
      : [];
  });

  if (persistedMentions.length === 0) {
    return;
  }

  await insertPostgresMemoryEntityMentions(queryable, {
    memoryRecordId: input.memoryRecordId,
    organizationId: input.organizationId,
    mentions: persistedMentions,
  });
  await insertPostgresEntityRelationships(queryable, {
    memoryRecordId: input.memoryRecordId,
    organizationId: input.organizationId,
    relationships: buildEntityRelationships(persistedMentions),
  });
}

async function upsertPostgresEntities(
  queryable: PgQueryable,
  organizationId: string,
  mentions: readonly EntityMention[],
): Promise<Map<string, PostgresEntityRow>> {
  const params: unknown[] = [];
  const values = mentions.map((mention) => {
    const organizationIndex = params.push(organizationId);
    const kindIndex = params.push(mention.kind);
    const normalizedIndex = params.push(mention.normalized);
    const displayTextIndex = params.push(mention.text);
    return `($${organizationIndex}, $${kindIndex}, $${normalizedIndex}, $${displayTextIndex})`;
  });

  const result = await queryable.query<PostgresEntityRow>(
    `
      INSERT INTO entities (
        organization_id,
        kind,
        normalized,
        display_text
      ) VALUES ${values.join(", ")}
      ON CONFLICT (organization_id, kind, normalized)
      DO UPDATE SET
        last_seen_at = NOW(),
        display_text = EXCLUDED.display_text
      RETURNING id, kind, normalized
    `,
    params,
  );

  return new Map(
    result.rows.map((row) => [
      `${row.kind}:${row.normalized}`,
      row,
    ]),
  );
}

async function insertPostgresMemoryEntityMentions(
  queryable: PgQueryable,
  input: {
    memoryRecordId: number;
    organizationId: string;
    mentions: readonly PersistedEntityMention[];
  },
): Promise<void> {
  const params: unknown[] = [];
  const values = input.mentions.map((mention) => {
    const memoryRecordIndex = params.push(input.memoryRecordId);
    const entityIndex = params.push(mention.entityId);
    const organizationIndex = params.push(input.organizationId);
    const mentionTextIndex = params.push(mention.text);
    return `($${memoryRecordIndex}, $${entityIndex}, $${organizationIndex}, $${mentionTextIndex})`;
  });

  await queryable.query(
    `
      INSERT INTO memory_entity_mentions (
        memory_record_id,
        entity_id,
        organization_id,
        mention_text
      ) VALUES ${values.join(", ")}
      ON CONFLICT (memory_record_id, entity_id)
      DO UPDATE SET mention_text = EXCLUDED.mention_text
    `,
    params,
  );
}

async function deletePostgresEntityGraphForMemory(
  queryable: PgQueryable,
  memoryRecordId: number,
  organizationId: string,
): Promise<void> {
  await queryable.query(
    `
      DELETE FROM entity_relationships
      WHERE evidence_memory_record_id = $1
        AND organization_id = $2
    `,
    [memoryRecordId, organizationId],
  );
  await queryable.query(
    `
      DELETE FROM memory_entity_mentions
      WHERE memory_record_id = $1
        AND organization_id = $2
    `,
    [memoryRecordId, organizationId],
  );
}

async function replacePostgresMemoryTags(
  queryable: PgQueryable,
  input: {
    memoryRecordId: number;
    organizationId: string;
    tags: string[];
  },
): Promise<void> {
  await queryable.query(
    `
      DELETE FROM memory_tags
      WHERE memory_record_id = $1
        AND organization_id = $2
    `,
    [input.memoryRecordId, input.organizationId],
  );

  const tags = normalizeTags(input.tags);
  if (tags.length === 0) {
    return;
  }

  const params: unknown[] = [];
  const values = tags.map((tag) => {
    const memoryRecordIndex = params.push(input.memoryRecordId);
    const organizationIndex = params.push(input.organizationId);
    const tagIndex = params.push(tag);
    return `($${memoryRecordIndex}, $${organizationIndex}, $${tagIndex})`;
  });

  await queryable.query(
    `
      INSERT INTO memory_tags (
        memory_record_id,
        organization_id,
        tag
      ) VALUES ${values.join(", ")}
    `,
    params,
  );
}

async function insertPostgresEntityRelationships(
  queryable: PgQueryable,
  input: {
    memoryRecordId: number;
    organizationId: string;
    relationships: readonly EntityRelationshipInput[];
  },
): Promise<void> {
  if (input.relationships.length === 0) {
    return;
  }

  const params: unknown[] = [];
  const values = input.relationships.map((relationship) => {
    const organizationIndex = params.push(input.organizationId);
    const fromIndex = params.push(relationship.fromEntityId);
    const toIndex = params.push(relationship.toEntityId);
    const typeIndex = params.push(relationship.relationType);
    const evidenceIndex = params.push(input.memoryRecordId);
    const validFromIndex = params.push(relationship.validFrom);
    const confidenceIndex = params.push(relationship.confidence);

    return `($${organizationIndex}, $${fromIndex}, $${toIndex}, $${typeIndex}, $${evidenceIndex}, $${validFromIndex}::date, $${confidenceIndex})`;
  });

  await queryable.query(
    `
      INSERT INTO entity_relationships (
        organization_id,
        from_entity_id,
        to_entity_id,
        relation_type,
        evidence_memory_record_id,
        valid_from,
        confidence
      ) VALUES ${values.join(", ")}
      ON CONFLICT (
        organization_id,
        from_entity_id,
        to_entity_id,
        relation_type,
        evidence_memory_record_id
      )
      DO NOTHING
    `,
    params,
  );
}

function buildEntityExtractionText(
  input: AddMemoryInput,
  sourceRow: PostgresSourceRow,
): string {
  const sourceMetadata = parseStoredPostgresSourceRef(sourceRow.source_ref);
  const parts = [
    input.title,
    input.content,
    input.summary,
    input.projectKey,
    input.memoryType,
    input.source.title,
    input.source.sourceRef,
    input.source.externalId,
    input.source.uri,
    sourceRow.source_title,
    sourceMetadata.sourceRef,
    sourceMetadata.uri,
  ];

  return parts.filter((part): part is string => Boolean(part)).join("\n");
}

function buildEntityMatchClause(
  mentions: readonly EntityMention[],
  params: unknown[],
): string | null {
  if (mentions.length === 0) {
    return null;
  }

  const conditions = mentions.map((mention) => {
    const kindIndex = params.push(mention.kind);
    const normalizedIndex = params.push(mention.normalized);
    return `(e.kind = $${kindIndex} AND e.normalized = $${normalizedIndex})`;
  });

  return `
    EXISTS (
      SELECT 1
      FROM memory_entity_mentions mem
      JOIN entities e ON e.id = mem.entity_id
      WHERE mem.memory_record_id = mr.id
        AND mem.organization_id = mr.organization_id
        AND e.organization_id = mr.organization_id
        AND (${conditions.join(" OR ")})
    )
  `;
}

function buildEntityRelationships(
  mentions: readonly PersistedEntityMention[],
): EntityRelationshipInput[] {
  const relationships: EntityRelationshipInput[] = [];
  const seen = new Set<string>();
  const nonDateMentions = mentions.filter((mention) => mention.kind !== "date");
  const dateMentions = mentions.flatMap((mention) => {
    if (mention.kind !== "date") {
      return [];
    }

    const validFrom = parseMentionDate(mention.text);
    return validFrom ? [{ ...mention, validFrom }] : [];
  });

  for (let leftIndex = 0; leftIndex < nonDateMentions.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < nonDateMentions.length;
      rightIndex += 1
    ) {
      const left = nonDateMentions[leftIndex]!;
      const right = nonDateMentions[rightIndex]!;
      const [fromEntityId, toEntityId] =
        left.entityId < right.entityId
          ? [left.entityId, right.entityId]
          : [right.entityId, left.entityId];

      pushUniqueRelationship(relationships, seen, {
        fromEntityId,
        toEntityId,
        relationType: "co_mentions",
        validFrom: null,
        confidence: 0.6,
      });

      if (relationships.length >= MAX_ENTITY_RELATIONSHIPS_PER_MEMORY) {
        return relationships;
      }
    }
  }

  for (const dateMention of dateMentions) {
    for (const mention of nonDateMentions) {
      pushUniqueRelationship(relationships, seen, {
        fromEntityId: mention.entityId,
        toEntityId: dateMention.entityId,
        relationType: "temporal_context",
        validFrom: dateMention.validFrom,
        confidence: 0.8,
      });

      if (relationships.length >= MAX_ENTITY_RELATIONSHIPS_PER_MEMORY) {
        return relationships;
      }
    }
  }

  return relationships;
}

function normalizeTags(tags: readonly string[]): string[] {
  const trimmedTags = tags.map((tag) => {
    if (typeof tag !== "string") {
      throw new Error("tag must be a string");
    }
    const trimmed = tag.trim();
    if (trimmed.length === 0) {
      throw new Error("tag must contain non-whitespace text");
    }
    return trimmed;
  });
  return [...new Set(trimmedTags)]
    .sort((left, right) => left.localeCompare(right));
}

function pushUniqueRelationship(
  relationships: EntityRelationshipInput[],
  seen: Set<string>,
  relationship: EntityRelationshipInput,
): void {
  if (relationship.fromEntityId === relationship.toEntityId) {
    return;
  }

  const key = [
    relationship.fromEntityId,
    relationship.toEntityId,
    relationship.relationType,
    relationship.validFrom ?? "",
  ].join(":");

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  relationships.push(relationship);
}

function parseMentionDate(text: string): string | null {
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const value = isoMatch[0];
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString().slice(0, 10) === value ? value : null;
  }

  const monthMatch = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!monthMatch) {
    return null;
  }

  const monthIndex = monthNameToIndex(monthMatch[1]!);
  if (monthIndex === null) {
    return null;
  }

  return `${monthMatch[2]}-${String(monthIndex + 1).padStart(2, "0")}-01`;
}

function monthNameToIndex(value: string): number | null {
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const prefix = value.toLocaleLowerCase().slice(0, 3);
  const index = months.indexOf(prefix);
  return index === -1 ? null : index;
}

function entityMentionKey(mention: EntityMention): string {
  return `${mention.kind}:${mention.normalized}`;
}

function serializeStoredPostgresSourceRef(
  metadata: PostgresStoredSourceMetadata,
): string {
  return JSON.stringify(metadata);
}

export function parseStoredPostgresSourceRef(
  value: string,
): PostgresStoredSourceMetadata {
  if (typeof value !== "string") {
    throw new Error("sourceRef must be a string");
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed !== null && typeof parsed === "object") {
      const metadata = parsed as Partial<PostgresStoredSourceMetadata>;
      if (typeof metadata.sourceRef !== "string") {
        return {
          sourceRef: value,
          uri: null,
        };
      }
      const sourceRef = metadata.sourceRef.trim();
      if (sourceRef.length === 0) {
        return {
          sourceRef: value,
          uri: null,
        };
      }
      const uri =
        typeof metadata.uri === "string" && metadata.uri.trim().length > 0
          ? metadata.uri.trim()
          : null;
      return {
        sourceRef,
        uri,
      };
    }
  } catch (err: unknown) {
    rootLogger.warn(
      { err, valueLength: value.length },
      "parseStoredPostgresSourceRef: failed to parse source_ref JSON; falling back to raw value",
    );
  }

  return {
    sourceRef: value,
    uri: null,
  };
}

// listMemory is a browse/paging contract — bound results so a large scope
// can't return an unbounded row set. Callers that need more should paginate.
const DEFAULT_LIST_LIMIT = 1000;
const MAX_LIST_LIMIT = 5000;

function clampListLimit(
  value: number | undefined,
  label: string = "limit",
): number {
  return normalizeLimit(value, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, label);
}

function normalizeLimit(
  value: number | undefined,
  fallback: number,
  max: number,
  label: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${label} must be a positive integer up to ${max}`);
  }
  return value;
}
