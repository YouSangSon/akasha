import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

// Each configured token may bind to a single organization. Format:
//   "rawToken"             -> no binding (legacy: any org allowed)
//   "rawToken:dev-team"    -> bound to organization_id "dev-team"
//
// Tokens are configured via MEMORY_API_TOKENS as a comma-separated list:
//   MEMORY_API_TOKENS="alpha-token:dev-team,beta-token:finance-team,legacy-token"
// Multi-token support allows zero-downtime rotation: deploy with [old, new],
// rotate clients to new, then drop old in next deploy.
export type BearerToken = {
  token: string;
  organizationId?: string;
  authType?: "static" | "oauth";
  scopes?: readonly string[];
  subject?: string;
  issuer?: string;
  audience?: string | readonly string[];
};

export type OAuthTokenVerifier = {
  verify(token: string): Promise<BearerToken | null>;
};

export function loadBearerTokens(env: NodeJS.ProcessEnv): BearerToken[] {
  const raw = env.MEMORY_API_TOKENS;
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map(parseBearerEntry);
}

function parseBearerEntry(entry: string): BearerToken {
  const colonMatches = entry.match(/:/g) ?? [];
  if (colonMatches.length > 1) {
    throw new Error(
      "Invalid MEMORY_API_TOKENS entry: tokens may contain at most one colon",
    );
  }

  const colonIndex = entry.indexOf(":");
  if (colonIndex === -1) {
    const token = entry.trim();
    if (token.length === 0) {
      throw new Error("Invalid MEMORY_API_TOKENS entry: token is empty");
    }
    return { token };
  }

  const token = entry.slice(0, colonIndex).trim();
  const organizationId = entry.slice(colonIndex + 1).trim();

  if (token.length === 0) {
    throw new Error("Invalid MEMORY_API_TOKENS entry: token is empty");
  }
  if (organizationId.length === 0) {
    throw new Error(
      "Invalid MEMORY_API_TOKENS entry: organization id is empty",
    );
  }

  return { token, organizationId };
}

// Compare fixed-width token digests and scan the whole configured token list.
// This avoids leaking configured token length or match position through obvious
// early-exit timing differences while still returning the matched binding.
export function matchBearer(
  authHeader: string | undefined,
  tokens: readonly BearerToken[],
): BearerToken | null {
  if (tokens.length === 0) {
    return null;
  }
  const provided = extractBearerValue(authHeader);
  if (!provided) {
    return null;
  }

  const providedDigest = tokenDigest(provided);
  let matched: BearerToken | null = null;

  for (const entry of tokens) {
    const entryDigest = tokenDigest(entry.token);
    if (timingSafeEqual(entryDigest, providedDigest) && matched === null) {
      matched = entry;
    }
  }

  return matched;
}

export async function authenticateBearer(
  authHeader: string | undefined,
  tokens: readonly BearerToken[],
  oauthVerifier: OAuthTokenVerifier | null,
): Promise<BearerToken | null> {
  const staticMatch = matchBearer(authHeader, tokens);
  if (staticMatch) {
    return { ...staticMatch, authType: "static" };
  }

  const provided = extractBearerValue(authHeader);
  if (!provided || !oauthVerifier) {
    return null;
  }

  const oauthMatch = await oauthVerifier.verify(provided);
  return oauthMatch ? { ...oauthMatch, token: provided, authType: "oauth" } : null;
}

export function matchBearerFromRequest(
  req: IncomingMessage,
  tokens: readonly BearerToken[],
): BearerToken | null {
  const header = req.headers.authorization;
  return matchBearer(typeof header === "string" ? header : undefined, tokens);
}

// Backward-compatible boolean check used by older call sites.
export function checkBearer(
  authHeader: string | undefined,
  tokens: readonly BearerToken[],
): boolean {
  return matchBearer(authHeader, tokens) !== null;
}

export function checkBearerFromRequest(
  req: IncomingMessage,
  tokens: readonly BearerToken[],
): boolean {
  return matchBearerFromRequest(req, tokens) !== null;
}

function extractBearerValue(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const provided = authHeader.slice("Bearer ".length).trim();
  return provided.length > 0 ? provided : null;
}

function tokenDigest(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}
