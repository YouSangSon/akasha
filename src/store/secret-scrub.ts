// Synchronous secret scanner. Curated regex catalog covering the most
// impactful credential shapes. This is a starting point — if the pattern
// catalog needs to grow large, swap to secretlint or gitleaks.
//
// Detections never return the matched value, only the category, so error
// messages and logs cannot leak the secret that was found.

export type SecretDetection = {
  category: string;
};

export class SecretDetectedError extends Error {
  readonly categories: readonly string[];

  constructor(categories: readonly string[]) {
    const unique = Array.from(new Set(categories)).sort();
    super(
      `Refusing to store content: detected secret-shaped pattern(s) [${unique.join(", ")}]. Remove or redact before resubmitting.`,
    );
    this.name = "SecretDetectedError";
    this.categories = unique;
  }
}

type Pattern = {
  category: string;
  regex: RegExp;
};

// Each regex matches a credential SHAPE. Word boundaries / explicit anchors
// keep false positives down on prose like "AWS region" or "we discussed sk-".
const PATTERNS: readonly Pattern[] = [
  // AWS access key: AKIA + 16 uppercase alphanumerics, word-bounded.
  { category: "aws-access-key", regex: /\bAKIA[A-Z0-9]{16}\b/ },
  // GitHub token prefixes: ghp/ghs/gho/ghu/ghr followed by 36+ token chars.
  {
    category: "github-token",
    regex: /\b(?:ghp|ghs|gho|ghu|ghr)_[A-Za-z0-9]{36,}\b/,
  },
  // Anthropic key first (more specific) then OpenAI sk-* (broader). Order matters.
  {
    category: "anthropic-key",
    regex: /\bsk-ant-[A-Za-z0-9_-]{50,}\b/,
  },
  {
    category: "openai-key",
    regex: /\bsk-[A-Za-z0-9_-]{30,}\b/,
  },
  // PEM private key block header.
  {
    category: "private-key-block",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  },
  // Authorization: Bearer <opaque token>. The header form is a strong signal
  // that the value is a credential, not coincidental text.
  {
    category: "bearer-token",
    regex: /Authorization:\s*Bearer\s+[A-Za-z0-9_.\-+/=]{20,}/i,
  },
  // JWT three-segment shape: eyJ-prefix on the first two base64url segments
  // plus a long signature segment. eyJ is the base64url encoding of `{"`.
  {
    category: "jwt",
    regex:
      /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}\b/,
  },
  // GCP API key: AIza prefix followed by 35 alphanumeric/dash/underscore chars.
  { category: "gcp-api-key", regex: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  // Stripe live or test secret key: sk_live_/sk_test_ + 24+ alphanumerics.
  {
    category: "stripe-key",
    regex: /\bsk_(?:live|test)_[A-Za-z0-9]{24,}\b/,
  },
  // Slack token prefixes: xoxb (bot), xoxp (user), xoxo (OAuth), xoxa (app).
  { category: "slack-token", regex: /\bxox[bpoa]-[0-9A-Za-z-]{10,}\b/ },
  // DB connection string with embedded credentials: user:pass@host form.
  // The ://[^:@\s]+:[^@\s]+@ structure ensures userinfo is present; plain
  // URLs like https://example.com (no user:pass@) do not match.
  {
    category: "db-connection-string",
    regex: /:\/\/[^:@\s]+:[^@\s]+@[a-z0-9][\w.-]+/i,
  },
];

export function scanForSecrets(content: string): SecretDetection[] {
  assertStringContent(content, "content");

  const detections: SecretDetection[] = [];

  for (const pattern of PATTERNS) {
    if (pattern.regex.test(content)) {
      detections.push({ category: pattern.category });
    }
  }

  return detections;
}

export function assertNoSecrets(content: string): void {
  const detections = scanForSecrets(content);
  if (detections.length === 0) {
    return;
  }
  throw new SecretDetectedError(detections.map((d) => d.category));
}

function assertStringContent(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
}
