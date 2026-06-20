import { describe, expect, it } from "vitest";
import {
  assertNoSecrets,
  scanForSecrets,
  SecretDetectedError,
} from "../../src/store/secret-scrub.js";
import { SEED_ENTRIES } from "../eval/fixtures/seed.js";

// All literal "secret-shaped" strings below are synthetic. They must match
// the patterns by structure but reference no real account or service.
//
// High-confidence provider keys (GCP / Stripe / Slack) are assembled from
// string fragments so the contiguous secret pattern never appears in source.
// This keeps the synthetic fixtures from tripping GitHub push-protection (and
// the spirit of this repo's own secret policy) while the runtime-assembled
// value still matches the scrubber regex.
const GCP_KEY = "AIza" + "Sy" + "0".repeat(33);
const STRIPE_LIVE = "sk_" + "live_" + "0a1b2c3d4e5f6g7h8i9j0k1l";
const STRIPE_TEST = "sk_" + "test_" + "0a1b2c3d4e5f6g7h8i9j0k1l";
const SLACK_TOKEN = "xox" + "b-" + "123456789012-ABCDEFGHIJKLMNOP";

describe("scanForSecrets", () => {
  it.each([
    [
      "aws-access-key",
      "Decision: rotate AWS access key AKIAIOSFODNN7EXAMPLE next week.",
      "aws-access-key",
    ],
    [
      "github-token",
      "Logged in to GitHub with ghp_AAAA1111BBBB2222CCCC3333DDDD4444EEEE.",
      "github-token",
    ],
    [
      "openai-key",
      "Use OPENAI_API_KEY=sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa in CI.",
      "openai-key",
    ],
    [
      "anthropic-key",
      "Set ANTHROPIC_API_KEY=sk-ant-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa for prod.",
      "anthropic-key",
    ],
    [
      "private-key-block",
      "Pasted: -----BEGIN RSA PRIVATE KEY-----\nMIIEpQIB...\n-----END RSA PRIVATE KEY-----",
      "private-key-block",
    ],
    [
      "bearer-token",
      "curl -H 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789' https://api.example.com",
      "bearer-token",
    ],
    [
      "jwt",
      "Sample token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      "jwt",
    ],
    [
      "gcp-api-key",
      `GCP key: ${GCP_KEY}`,
      "gcp-api-key",
    ],
    [
      "stripe-key-live",
      `Stripe live key: ${STRIPE_LIVE}`,
      "stripe-key",
    ],
    [
      "stripe-key-test",
      `Stripe test key: ${STRIPE_TEST}`,
      "stripe-key",
    ],
    [
      "slack-token",
      `Slack bot token: ${SLACK_TOKEN}`,
      "slack-token",
    ],
    [
      "db-connection-string",
      "DATABASE_URL=postgres://myuser:s3cr3tpw@db.example.com/mydb",
      "db-connection-string",
    ],
  ])(
    "detects %s pattern",
    (_label: string, content: string, expectedCategory: string) => {
      const detections = scanForSecrets(content);
      expect(detections.length).toBeGreaterThan(0);
      expect(detections.map((d) => d.category)).toContain(expectedCategory);
    },
  );

  it.each([
    ["regular-text", "Decision: use Postgres for canonical memory state."],
    ["short-sk-fragment", "We discussed sk- prefixes in chat (no real key)."],
    ["aws-text-without-key", "AWS region us-east-1 is preferred for latency."],
    [
      "akia-too-short",
      "Match must require 16 chars: AKIASHORT will not trip the check.",
    ],
    [
      "plain-https-url-no-userinfo",
      "See the docs at https://example.com for details.",
    ],
    [
      "plain-github-https-url",
      "Clone the repo: https://github.com/user/repo",
    ],
    [
      "plain-http-url-no-userinfo",
      "Visit http://localhost:3000/api/health to check status.",
    ],
  ])("does not flag %s", (_label: string, content: string) => {
    expect(scanForSecrets(content)).toEqual([]);
  });

  it("never returns the matched value, only the category", () => {
    const content = "Key: sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const detections = scanForSecrets(content);
    expect(detections.length).toBeGreaterThan(0);
    for (const detection of detections) {
      expect(detection).not.toHaveProperty("value");
      expect(detection).not.toHaveProperty("match");
      expect(JSON.stringify(detection)).not.toContain(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      );
    }
  });
});

describe("assertNoSecrets", () => {
  it("returns void on clean content", () => {
    expect(() =>
      assertNoSecrets("Decision: chunk memory at 800 tokens with 120 overlap."),
    ).not.toThrow();
  });

  it("throws SecretDetectedError listing categories on flagged content", () => {
    try {
      assertNoSecrets(
        "AWS key AKIAIOSFODNN7EXAMPLE and GitHub ghp_AAAA1111BBBB2222CCCC3333DDDD4444EEEE.",
      );
      throw new Error("expected assertNoSecrets to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SecretDetectedError);
      const detected = (error as SecretDetectedError).categories;
      expect(detected).toContain("aws-access-key");
      expect(detected).toContain("github-token");
      // Error message must not leak the matched values.
      expect((error as Error).message).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect((error as Error).message).not.toContain(
        "ghp_AAAA1111BBBB2222CCCC3333DDDD4444EEEE",
      );
    }
  });
});

describe("eval-seed regression guard", () => {
  it("does not flag any record in SEED_ENTRIES (synthetic data must stay clean)", () => {
    for (const entry of SEED_ENTRIES) {
      const detections = scanForSecrets(entry.memory.content);
      if (detections.length > 0) {
        throw new Error(
          `Seed key '${entry.seedKey}' triggered scrubber categories: ${detections
            .map((d) => d.category)
            .join(", ")}. Adjust the seed content or the pattern to avoid the false positive.`,
        );
      }
    }
  });
});
