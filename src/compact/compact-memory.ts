export type CompactRecord = {
  id: string;
  kind: string;
  durability: string;
  summary: string;
};

export type CompactMemoryInput = {
  dryRun: boolean;
  records: CompactRecord[];
};

export type CompactMemoryResult = {
  applied: boolean;
  archivedIds: string[];
  promotionCandidates: string[];
  mergeGroups: string[][];
};

export function compactMemory(
  params: CompactMemoryInput,
): CompactMemoryResult {
  const promotionCandidates = params.records
    .filter(
      (record) =>
        record.kind === "summary" &&
        /decision:|constraint:/i.test(record.summary),
    )
    .map((record) => record.id);

  const mergeGroups = new Map<string, string[]>();

  for (const record of params.records) {
    const group = mergeGroups.get(record.summary) ?? [];
    group.push(record.id);
    mergeGroups.set(record.summary, group);
  }

  return {
    applied: !params.dryRun,
    archivedIds: [],
    promotionCandidates,
    mergeGroups: [...mergeGroups.values()].filter((group) => group.length > 1),
  };
}
