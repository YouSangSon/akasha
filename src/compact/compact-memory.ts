import type { MemoryType, SearchMemoryResult } from "../types.js";

export type CompactMemoryInput = {
  dryRun: boolean;
  records: SearchMemoryResult[];
};

export type PromotionCandidate = {
  recordId: number;
  suggestedMemoryType: Exclude<MemoryType, "summary">;
  reason: string;
};

export type MergeCandidate = {
  canonicalRecordId: number;
  recordIds: number[];
  duplicateRecordIds: number[];
  reason: string;
};

export type CompactMemoryResult = {
  applied: boolean;
  archiveCandidates: SearchMemoryResult[];
  promotionCandidates: PromotionCandidate[];
  mergeCandidates: MergeCandidate[];
};

export function compactMemory(
  input: CompactMemoryInput,
): CompactMemoryResult {
  const promotionCandidates = input.records
    .filter(shouldPromoteRecord)
    .map((record) => ({
      recordId: record.id,
      suggestedMemoryType: suggestedMemoryType(record.content),
      reason: promotionReason(record.content),
    }));

  const duplicateGroups = groupDuplicateEphemeralRecords(input.records);
  const mergeCandidates = duplicateGroups.map((records) => {
    const [canonicalRecord, ...duplicates] = records;

    return {
      canonicalRecordId: canonicalRecord.id,
      recordIds: records.map((record) => record.id),
      duplicateRecordIds: duplicates.map((record) => record.id),
      reason: "Duplicate ephemeral notes can be merged into the newest record.",
    };
  });

  return {
    applied: false,
    archiveCandidates: mergeCandidates.flatMap((candidate) =>
      candidate.duplicateRecordIds.map((recordId) =>
        input.records.find((record) => record.id === recordId),
      ),
    ).filter((record): record is SearchMemoryResult => record !== undefined),
    promotionCandidates,
    mergeCandidates,
  };
}

function shouldPromoteRecord(record: SearchMemoryResult): boolean {
  return (
    record.memoryType === "summary" &&
    record.source.sourceType !== "conversation" &&
    /^(\s*decision:|\s*constraint:)/i.test(record.content)
  );
}

function suggestedMemoryType(
  content: string,
): Exclude<MemoryType, "summary"> {
  if (/^\s*decision:/i.test(content)) {
    return "decision";
  }

  return "fact";
}

function promotionReason(content: string): string {
  if (/^\s*decision:/i.test(content)) {
    return "Summary looks like a durable decision and should be reviewed for promotion.";
  }

  return "Summary looks like a durable constraint and should be reviewed for promotion.";
}

function groupDuplicateEphemeralRecords(
  records: SearchMemoryResult[],
): SearchMemoryResult[][] {
  const groupedRecords = new Map<string, SearchMemoryResult[]>();

  for (const record of records) {
    if (!isEphemeralCandidate(record)) {
      continue;
    }

    const normalizedContent = normalizeContent(record.content);
    const existingGroup = groupedRecords.get(normalizedContent) ?? [];
    existingGroup.push(record);
    groupedRecords.set(normalizedContent, existingGroup);
  }

  return [...groupedRecords.values()]
    .filter((group) => group.length > 1)
    .map((group) =>
      [...group].sort((left, right) => {
        const updatedAtDiff =
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt);

        if (updatedAtDiff !== 0) {
          return updatedAtDiff;
        }

        return left.id - right.id;
      }),
    );
}

function isEphemeralCandidate(record: SearchMemoryResult): boolean {
  return (
    record.memoryType !== "decision" &&
    record.source.sourceType === "conversation"
  );
}

function normalizeContent(content: string): string {
  return content.replace(/\s+/g, " ").trim().toLowerCase();
}
