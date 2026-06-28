import { createHash } from "node:crypto";
import type { PgPool, PgQueryable } from "../db/connection.js";
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
  id: number;
  organization_id: string;
  scope_type: SearchMemoryResult["scopeType"];
  scope_id: string;
  project_key: string | null;
  kind: SearchMemoryResult["memoryType"];
  title: string | null;
  content: string;
  summary: string | null;
  durability: NonNullable<SearchMemoryResult["durability"]>;
  importance: number;
  source_id: number;
  created_at: string | Date;
  updated_at: string | Date;
};

type PostgresSourceRow = {
  source_id_joined: number;
  source_organization_id: string;
  source_scope_type: MemorySource["scopeType"];
  source_scope_id: string;
  source_type: MemorySource["sourceType"];
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
    async addMemory(input) {
      assertNonBlankMemoryContent(input.content);

      const memoryType = normalizeMemoryType(input.memoryType);
      const durability = normalizeDurability(input.durability, "ephemeral");
      const importance = normalizePostgresInteger(input.importance, 0);
      const title = normalizeNullableText(input.title ?? null);
      const summary =
        input.summary === undefined
          ? summarize(input.content)
          : normalizeNullableText(input.summary);
      assertNoSecretsInMemoryFields({
        title,
        content: input.content,
        summary,
      });
      const organizationId = input.organizationId ?? DEFAULT_ORG_ID;
      assertNonBlankText(organizationId, "organizationId");
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const sourceRow = await upsertPostgresSource(
          client,
          input,
          organizationId,
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
            input.scopeType,
            input.scopeId,
            input.projectKey ?? null,
            memoryType,
            title,
            input.content,
            summary,
            durability,
            importance,
            sourceRow.source_id_joined,
          ],
        );

        const memoryRow = requireSingleRow(memoryResult.rows[0], "memory");
        await persistPostgresEntityGraph(client, {
          input,
          organizationId,
          memoryRecordId: toNumber(memoryRow.id),
          sourceRow,
        });

        await client.query("COMMIT");

      return mapPostgresSearchResult({
          ...memoryRow,
          ...sourceRow,
          tags: [],
        });
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

      if (input.scopes.length === 0) {
        return [];
      }

      const trimmedQuery = input.query.trim();
      if (trimmedQuery.length === 0) {
        return [];
      }

      const limit = Math.max(1, Math.min(input.limit ?? 10, 100));
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

      const scopeClauses = input.scopes.map((scope) => {
        const scopeTypeIndex = params.push(scope.scopeType);
        const scopeIdIndex = params.push(scope.scopeId);
        return `(mr.scope_type = $${scopeTypeIndex} AND mr.scope_id = $${scopeIdIndex})`;
      });

      let orgClause = "";
      if (input.organizationId !== undefined) {
        const orgIndex = params.push(input.organizationId);
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
      const limit = clampListLimit(options?.limit);
      const params: unknown[] = [scope.scopeType, scope.scopeId];
      let orgClause = "";
      if (options?.organizationId !== undefined) {
        const orgIndex = params.push(options.organizationId);
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
      if (ids.length === 0) {
        return [];
      }

      const params: unknown[] = [ids];
      let orgClause = "";
      if (organizationId !== undefined) {
        const orgIndex = params.push(organizationId);
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

    async listMemoryForGovernance(scope, options) {
      assertNonBlankText(options.organizationId, "organizationId");

      const limit = clampListLimit(options.limit);
      const params: unknown[] = [
        scope.scopeType,
        scope.scopeId,
        options.organizationId,
      ];
      let tagJoin = "";
      let tagClause = "";
      if (options.tag !== undefined) {
        const tagIndex = params.push(options.tag);
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

    async updateMemoryRecord(input) {
      assertNonBlankText(input.organizationId, "organizationId");
      const nextTags =
        input.tags === undefined ? undefined : normalizeTags(input.tags);

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const currentRow = await getPostgresMemoryRecordById(
          client,
          input.id,
          input.organizationId,
        );
        if (!currentRow) {
          await client.query("ROLLBACK");
          return null;
        }

        const nextTitle =
          input.title === undefined
            ? currentRow.title
            : normalizeNullableText(input.title);
        const nextContent = input.content ?? currentRow.content;
        if (input.content !== undefined) {
          assertNonBlankMemoryContent(nextContent);
        }
        const nextSummary =
          input.summary === undefined
            ? currentRow.summary
            : normalizeNullableText(input.summary);
        const nextKind = normalizeMemoryType(input.kind, currentRow.kind);
        const nextDurability = normalizeDurability(
          input.durability,
          currentRow.durability,
        );
        const nextImportance = normalizePostgresInteger(
          input.importance,
          currentRow.importance,
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
            input.organizationId,
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
            organizationId: input.organizationId,
            tags: nextTags ?? [],
          });
        }

        await deletePostgresEntityGraphForMemory(client, input.id, input.organizationId);
        await persistPostgresEntityGraph(client, {
          input: {
            organizationId: input.organizationId,
            scopeType: updatedRow.scope_type,
            scopeId: updatedRow.scope_id,
            projectKey: updatedRow.project_key ?? undefined,
            memoryType: updatedRow.kind,
            title: updatedRow.title ?? undefined,
            content: updatedRow.content,
            summary: updatedRow.summary ?? undefined,
            durability: updatedRow.durability,
            importance: updatedRow.importance,
            source: {
              scopeType: currentRow.source_scope_type,
              scopeId: currentRow.source_scope_id,
              sourceType: currentRow.source_type,
              sourceRef:
                parseStoredPostgresSourceRef(currentRow.source_ref).sourceRef,
              title: currentRow.source_title ?? undefined,
              uri: parseStoredPostgresSourceRef(currentRow.source_ref).uri ?? undefined,
            },
          },
          organizationId: input.organizationId,
          memoryRecordId: input.id,
          sourceRow: currentRow,
        });

        const hydrated = await getPostgresMemoryRecordById(
          client,
          input.id,
          input.organizationId,
        );

        await client.query("COMMIT");
        return hydrated ? mapPostgresSearchResult(hydrated) : null;
      } catch (error: unknown) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async archiveMemoryRecord(input) {
      assertNonBlankText(input.organizationId, "organizationId");

      const result = await pool.query<{
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
        [input.id, input.organizationId],
      );

      if (!result.rows[0]?.found) {
        return { archived: false, qdrantPointIds: [] };
      }

      return {
        archived: result.rows[0].archived,
        qdrantPointIds: result.rows[0]?.qdrant_point_ids ?? [],
      };
    },

    async getMemoryRecordById(id, organizationId) {
      assertNonBlankText(organizationId, "organizationId");
      const result = await getPostgresMemoryRecordById(pool, id, organizationId);
      return result ? mapPostgresSearchResult(result) : null;
    },

    async deleteMemoryRecord(id, organizationId) {
      assertNonBlankText(organizationId, "organizationId");

      // Single-statement rollback. ON DELETE CASCADE on memory_chunks,
      // ingest_jobs, and relationships (defined in migrations/001_initial.sql)
      // removes every dependent row in the same transaction Postgres uses
      // for this DELETE — no explicit child-table cleanup required.
      // organization_id is required to prevent cross-tenant deletion (SEC-5).
      await pool.query(
        `DELETE FROM memory_records WHERE id = $1 AND organization_id = $2`,
        [id, organizationId],
      );
    },
  };
}

function mapPostgresSearchResult(row: PostgresHydratedRow): SearchMemoryResult {
  const sourceMetadata = parseStoredPostgresSourceRef(row.source_ref);

  return {
    id: toNumber(row.id),
    organizationId: row.organization_id,
    sourceId: toNumber(row.source_id),
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    projectKey: row.project_key,
    memoryType: row.kind,
    title: row.title,
    content: row.content,
    summary: row.summary,
    durability: row.durability,
    importance: row.importance,
    tags: row.tags ?? [],
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    source: {
      id: toNumber(row.source_id_joined),
      organizationId: row.source_organization_id,
      scopeType: row.source_scope_type,
      scopeId: row.source_scope_id,
      sourceType: row.source_type,
      externalId: sourceMetadata.sourceRef,
      sourceRef: sourceMetadata.sourceRef,
      title: row.source_title,
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
  const limit = clampListLimit(options.limit);
  const params: unknown[] = [
    options.organizationId,
    scope.scopeType,
    scope.scopeId,
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

  const relationshipLimit = clampListLimit(
    options.relationshipLimit ?? options.limit,
  );
  const relationshipParams: unknown[] = [
    options.organizationId,
    scope.scopeType,
    scope.scopeId,
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
    id: toNumber(row.id),
    organizationId: row.organization_id,
    kind: row.kind,
    normalized: row.normalized,
    displayText: row.display_text,
    firstSeenAt: toIsoString(row.first_seen_at),
    lastSeenAt: toIsoString(row.last_seen_at),
    mentionCount: toNumber(row.mention_count),
    memoryIds: toNumberArray(row.memory_ids),
  };
}

function mapPostgresGraphRelationship(
  row: PostgresGraphRelationshipRow,
): MemoryGraphRelationship {
  const fromEntityId = toNumber(row.from_entity_id);
  const toEntityId = toNumber(row.to_entity_id);

  return {
    id: toNumber(row.id),
    organizationId: row.organization_id,
    fromEntityId,
    toEntityId,
    fromEntity: {
      id: fromEntityId,
      kind: row.from_kind,
      normalized: row.from_normalized,
      displayText: row.from_display_text,
    },
    toEntity: {
      id: toEntityId,
      kind: row.to_kind,
      normalized: row.to_normalized,
      displayText: row.to_display_text,
    },
    relationType: row.relation_type,
    evidenceMemoryRecordId: toNumber(row.evidence_memory_record_id),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    confidence: toNumber(row.confidence),
    createdAt: toIsoString(row.created_at),
  };
}

function requireSourceKey(input: AddMemoryInput["source"]): string {
  const sourceKey = input.sourceRef ?? input.externalId;

  if (!sourceKey) {
    throw new Error(
      "Memory source provenance is required: provide sourceRef or externalId",
    );
  }

  return sourceKey;
}

function summarize(content: string): string {
  return content.length <= 180 ? content : `${content.slice(0, 177)}...`;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toNumber(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function toNumberArray(values: readonly (number | string)[] | null): number[] {
  return (values ?? []).map((value) => toNumber(value));
}

function likeContainsPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

function requireSingleRow<TRow>(row: TRow | undefined, label: string): TRow {
  if (!row) {
    throw new Error(`Expected ${label} row to be returned`);
  }

  return row;
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

function normalizeNullableText(value: string | null): string | null {
  return value === null || value.trim().length === 0 ? null : value;
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
      input.source.uri
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
        input.source.title ?? null,
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
      input.source.title ?? null,
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
    return entity ? [{ ...mention, entityId: toNumber(entity.id) }] : [];
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
  try {
    const parsed = JSON.parse(value) as Partial<PostgresStoredSourceMetadata>;

    if (typeof parsed.sourceRef === "string") {
      return {
        sourceRef: parsed.sourceRef,
        uri: typeof parsed.uri === "string" ? parsed.uri : null,
      };
    }
  } catch (err) {
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

function clampListLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_LIST_LIMIT;
  }

  return Math.min(Math.floor(value), MAX_LIST_LIMIT);
}
