export const ENTITY_KIND_VALUES = [
  "code_symbol",
  "path",
  "url",
  "date",
  "proper_noun",
] as const;

export type EntityKind = (typeof ENTITY_KIND_VALUES)[number];

export type EntityMention = {
  text: string;
  normalized: string;
  kind: EntityKind;
};

const ENTITY_PATTERNS: readonly {
  kind: EntityKind;
  pattern: RegExp;
}[] = [
  {
    kind: "url",
    pattern: /\bhttps?:\/\/[^\s)]+/giu,
  },
  {
    kind: "path",
    pattern: /\b(?:[\w.-]+\/)+[\w.-]+\b/gu,
  },
  {
    kind: "code_symbol",
    pattern: /\b[A-Z][A-Z0-9_]{2,}\b/gu,
  },
  {
    kind: "date",
    pattern: /\b\d{4}-\d{2}-\d{2}\b/gu,
  },
  {
    kind: "date",
    pattern:
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/giu,
  },
  {
    kind: "proper_noun",
    pattern: /\b[A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+){0,3}\b/gu,
  },
];

export function extractEntityMentions(text: string): EntityMention[] {
  assertStringInput(text, "extractEntityMentions text");

  const mentions = new Map<string, EntityMention>();

  for (const { kind, pattern } of ENTITY_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const raw = match[0]?.trim();
      if (!raw || raw.length <= 1) {
        continue;
      }

      const normalized = normalizeEntity(raw, kind);
      const key = `${kind}:${normalized}`;
      if (!mentions.has(key)) {
        mentions.set(key, { text: raw, normalized, kind });
      }
    }
  }

  return [...mentions.values()];
}

export function entityOverlapScore(
  leftText: string,
  rightText: string,
): { score: number; matched: EntityMention[] } {
  assertStringInput(leftText, "entityOverlapScore leftText");
  assertStringInput(rightText, "entityOverlapScore rightText");

  const left = extractEntityMentions(leftText);
  const rightByKey = new Map(
    extractEntityMentions(rightText).map((mention) => [
      `${mention.kind}:${mention.normalized}`,
      mention,
    ]),
  );
  const matched = left.filter((mention) =>
    rightByKey.has(`${mention.kind}:${mention.normalized}`),
  );

  if (left.length === 0 || matched.length === 0) {
    return { score: 0, matched: [] };
  }

  return {
    score: Math.min(1, matched.length / left.length),
    matched,
  };
}

function assertStringInput(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
}

function normalizeEntity(text: string, kind: EntityKind): string {
  const normalized = text.toLocaleLowerCase().replace(/\s+/g, " ").trim();

  if (kind === "url") {
    return normalized.replace(/[),.;]+$/g, "").replace(/\/+$/, "");
  }

  return normalized;
}
