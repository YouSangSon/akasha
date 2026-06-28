import {
  createRemoteJWKSet,
  customFetch,
  decodeJwt,
  jwtVerify,
  type FetchImplementation,
  type JWTPayload,
} from "jose";
import type { JWTVerifyGetKey } from "jose/jwt/verify";

import type { BearerToken, OAuthTokenVerifier } from "./bearer-auth.js";
import type { ToolName } from "../../mcp/tool-schemas.js";
import type { OAuthProtectedResourceConfig } from "../oauth-protected-resource.js";

const DEFAULT_JWT_ALGORITHMS = [
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
] as const;

const DEFAULT_CLOCK_TOLERANCE_SECONDS = 60;
const DEFAULT_ORGANIZATION_CLAIM = "organization_id";
const MAX_TIMER_TIMEOUT_MS = 2_147_483_647;

type JwksResolver = JWTVerifyGetKey;

type IssuerVerifierConfig = {
  authorizationServer: string;
  issuerCandidates: readonly string[];
  metadataUrls: readonly string[];
  jwksUrl?: string;
};

export type OAuthTokenVerifierConfig = {
  resource: string;
  issuers: readonly IssuerVerifierConfig[];
  algorithms: readonly string[];
  clockToleranceSeconds: number;
  organizationClaim?: string;
  requiredType?: string;
  jwksTimeoutMs: number;
};

export type OAuthTokenVerifierOptions = {
  fetch?: FetchImplementation;
};

export type OAuthScopeKind = "read" | "write" | "admin";

export type OAuthScopeCheck =
  | { ok: true }
  | { ok: false; kind: OAuthScopeKind; challengeScope: string };

export function loadOAuthTokenVerifierConfig(
  env: NodeJS.ProcessEnv,
  protectedResource: OAuthProtectedResourceConfig | null,
): OAuthTokenVerifierConfig | null {
  if (!protectedResource) {
    return null;
  }

  const authorizationServers = protectedResource.metadata.authorization_servers;
  if (authorizationServers.length === 0) {
    return null;
  }

  const jwksUrls = parseCommaList(env.MCP_OAUTH_JWKS_URLS).map((value) =>
    requireHttpsUrl(value, "MCP_OAUTH_JWKS_URLS"),
  );
  if (jwksUrls.length > 0 && jwksUrls.length !== authorizationServers.length) {
    throw new Error(
      "Invalid MCP_OAUTH_JWKS_URLS: when set, provide one JWKS URL per MCP_OAUTH_AUTHORIZATION_SERVERS entry",
    );
  }

  const algorithms = parseAlgorithms(env.MCP_OAUTH_JWT_ALGORITHMS);
  const clockToleranceSeconds = parseNonNegativeInt(
    env.MCP_OAUTH_JWT_CLOCK_TOLERANCE_SECONDS,
    DEFAULT_CLOCK_TOLERANCE_SECONDS,
    "MCP_OAUTH_JWT_CLOCK_TOLERANCE_SECONDS",
  );
  const jwksTimeoutMs = parsePositiveInt(
    env.MCP_OAUTH_JWKS_TIMEOUT_MS,
    5000,
    "MCP_OAUTH_JWKS_TIMEOUT_MS",
    MAX_TIMER_TIMEOUT_MS,
  );
  const organizationClaim =
    parseOptionalString(env.MCP_OAUTH_ORGANIZATION_CLAIM) ??
    DEFAULT_ORGANIZATION_CLAIM;
  const requiredType = parseOptionalString(env.MCP_OAUTH_JWT_TYPE);

  return {
    resource: protectedResource.metadata.resource,
    issuers: authorizationServers.map((authorizationServer, index) => ({
      authorizationServer,
      issuerCandidates: buildIssuerCandidates(authorizationServer),
      metadataUrls: buildAuthorizationServerMetadataUrls(authorizationServer),
      ...(jwksUrls[index] ? { jwksUrl: jwksUrls[index] } : {}),
    })),
    algorithms,
    clockToleranceSeconds,
    organizationClaim,
    requiredType,
    jwksTimeoutMs,
  };
}

export function createOAuthTokenVerifier(
  config: OAuthTokenVerifierConfig | null,
  options: OAuthTokenVerifierOptions = {},
): OAuthTokenVerifier | null {
  if (!config) {
    return null;
  }
  return new RemoteJwksOAuthTokenVerifier(config, options);
}

export function checkOAuthScopes(
  auth: BearerToken | null | undefined,
  toolName: ToolName,
  input: Record<string, unknown>,
  protectedResource: OAuthProtectedResourceConfig | null,
): OAuthScopeCheck {
  if (auth?.authType !== "oauth") {
    return { ok: true };
  }

  const kind = requiredScopeKindForTool(toolName, input);
  const acceptedScopes = acceptedScopesForKind(kind);
  const tokenScopes = new Set(auth.scopes ?? []);
  if (acceptedScopes.some((scope) => tokenScopes.has(scope))) {
    return { ok: true };
  }

  return {
    ok: false,
    kind,
    challengeScope: selectChallengeScope(kind, protectedResource),
  };
}

export function requiredScopeKindForTool(
  toolName: ToolName,
  input: Record<string, unknown>,
): OAuthScopeKind {
  switch (toolName) {
    case "add_memory":
    case "add_memory_interactive":
      return "write";
    case "start_goal_run":
    case "record_iteration":
    case "complete_goal_run":
    case "abandon_goal_run":
      return "write";
    case "compact_memory":
      return input.dryRun === false ? "admin" : "read";
    case "reindex_memory":
    case "unarchive_memory":
    case "list_audit_log":
    case "update_memory":
    case "delete_memory":
    case "tag_memory":
      return "admin";
    case "search_memory":
    case "list_memory":
    case "inspect_memory_graph":
    case "build_context_pack":
    case "list_workspace_roots":
    case "classify_memory_candidate":
    case "get_goal_run":
    case "list_goal_runs":
    case "build_goal_context":
    case "check_repeat_attempt":
      return "read";
  }
}

export function acceptedScopesForKind(kind: OAuthScopeKind): readonly string[] {
  switch (kind) {
    case "read":
      return ["akasha:memory", "akasha:read", "akasha:admin"];
    case "write":
      return ["akasha:memory", "akasha:write", "akasha:admin"];
    case "admin":
      return ["akasha:memory", "akasha:admin"];
  }
}

function selectChallengeScope(
  kind: OAuthScopeKind,
  protectedResource: OAuthProtectedResourceConfig | null,
): string {
  const preferred =
    kind === "read"
      ? "akasha:read"
      : kind === "write"
        ? "akasha:write"
        : "akasha:admin";
  const supported = protectedResource?.metadata.scopes_supported ?? [];
  if (supported.includes(preferred)) {
    return preferred;
  }
  if (supported.includes("akasha:memory")) {
    return "akasha:memory";
  }
  return preferred;
}

class RemoteJwksOAuthTokenVerifier implements OAuthTokenVerifier {
  private readonly issuerStates: IssuerState[];

  constructor(
    private readonly config: OAuthTokenVerifierConfig,
    private readonly options: OAuthTokenVerifierOptions,
  ) {
    this.issuerStates = config.issuers.map((issuer) => ({
      ...issuer,
      jwks: issuer.jwksUrl
        ? this.createJwksResolver(issuer.jwksUrl)
        : undefined,
    }));
  }

  async verify(token: string): Promise<BearerToken | null> {
    const decoded = safelyDecodeJwt(token);
    if (!decoded || typeof decoded.iss !== "string") {
      return null;
    }

    const issuer = this.findIssuer(decoded.iss);
    if (!issuer) {
      return null;
    }

    try {
      const jwks = await this.getJwks(issuer);
      const { payload } = await jwtVerify(token, jwks, {
        issuer: [...issuer.issuerCandidates],
        audience: this.config.resource,
        algorithms: [...this.config.algorithms],
        clockTolerance: this.config.clockToleranceSeconds,
        ...(this.config.requiredType ? { typ: this.config.requiredType } : {}),
      });

      const scopes = extractScopes(payload);
      const organizationId = extractOrganizationId(
        payload,
        this.config.organizationClaim,
      );
      return {
        token,
        authType: "oauth",
        scopes,
        ...(organizationId ? { organizationId } : {}),
        ...(typeof payload.sub === "string" ? { subject: payload.sub } : {}),
        issuer: decoded.iss,
        ...(payload.aud ? { audience: payload.aud } : {}),
      };
    } catch {
      return null;
    }
  }

  private findIssuer(issuer: string): IssuerState | null {
    return (
      this.issuerStates.find((candidate) =>
        candidate.issuerCandidates.includes(issuer),
      ) ?? null
    );
  }

  private async getJwks(issuer: IssuerState): Promise<JwksResolver> {
    if (issuer.jwks) {
      return issuer.jwks;
    }

    const jwksUrl = await discoverJwksUrl(issuer);
    issuer.jwks = this.createJwksResolver(jwksUrl);
    return issuer.jwks;
  }

  private createJwksResolver(jwksUrl: string): JwksResolver {
    return createRemoteJWKSet(new URL(jwksUrl), {
      timeoutDuration: this.config.jwksTimeoutMs,
      ...(this.options.fetch ? { [customFetch]: this.options.fetch } : {}),
    });
  }
}

type IssuerState = IssuerVerifierConfig & {
  jwks?: JwksResolver;
};

async function discoverJwksUrl(issuer: IssuerVerifierConfig): Promise<string> {
  for (const metadataUrl of issuer.metadataUrls) {
    const jwksUrl = await tryDiscoverJwksUrl(metadataUrl);
    if (jwksUrl) {
      return jwksUrl;
    }
  }

  throw new Error(
    `Unable to discover JWKS URI for authorization server ${issuer.authorizationServer}`,
  );
}

async function tryDiscoverJwksUrl(metadataUrl: string): Promise<string | null> {
  try {
    const response = await fetch(metadataUrl, {
      headers: { accept: "application/json" },
      redirect: "error",
    });
    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as Record<string, unknown>;
    return typeof body.jwks_uri === "string"
      ? requireHttpsUrl(body.jwks_uri, "jwks_uri")
      : null;
  } catch {
    return null;
  }
}

function safelyDecodeJwt(token: string): JWTPayload | null {
  try {
    return decodeJwt(token);
  } catch {
    return null;
  }
}

function extractScopes(payload: JWTPayload): string[] {
  const scopes = new Set<string>();
  const scope = payload.scope;
  if (typeof scope === "string") {
    for (const entry of scope.split(/\s+/)) {
      if (entry.length > 0) {
        scopes.add(entry);
      }
    }
  }

  const scp = payload.scp;
  if (typeof scp === "string") {
    for (const entry of scp.split(/\s+/)) {
      if (entry.length > 0) {
        scopes.add(entry);
      }
    }
  }
  if (Array.isArray(scp)) {
    for (const entry of scp) {
      if (typeof entry === "string" && entry.length > 0) {
        scopes.add(entry);
      }
    }
  }

  return [...scopes];
}

function extractOrganizationId(
  payload: JWTPayload,
  claim: string | undefined,
): string | undefined {
  if (!claim) {
    return undefined;
  }
  if (!Object.hasOwn(payload, claim)) {
    return undefined;
  }

  const value = payload[claim];
  if (typeof value !== "string") {
    throw new Error(`OAuth organization claim "${claim}" must be a string`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`OAuth organization claim "${claim}" must not be blank`);
  }
  return trimmed;
}

function buildIssuerCandidates(authorizationServer: string): string[] {
  const parsed = new URL(authorizationServer);
  const normalized = parsed.toString();
  const candidates = new Set([normalized]);
  if (normalized.endsWith("/")) {
    candidates.add(normalized.slice(0, -1));
  }
  return [...candidates];
}

function buildAuthorizationServerMetadataUrls(
  authorizationServer: string,
): string[] {
  const parsed = new URL(authorizationServer);
  const origin = parsed.origin;
  const path = parsed.pathname.replace(/\/$/, "");

  if (path.length > 0) {
    return [
      `${origin}/.well-known/oauth-authorization-server${path}`,
      `${origin}/.well-known/openid-configuration${path}`,
      `${origin}${path}/.well-known/openid-configuration`,
    ];
  }

  return [
    `${origin}/.well-known/oauth-authorization-server`,
    `${origin}/.well-known/openid-configuration`,
  ];
}

function parseCommaList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseAlgorithms(value: string | undefined): readonly string[] {
  const parsed = parseCommaList(value);
  if (parsed.length === 0) {
    return [...DEFAULT_JWT_ALGORITHMS];
  }
  for (const algorithm of parsed) {
    if (/\s/.test(algorithm) || /["\\]/.test(algorithm)) {
      throw new Error(
        `Invalid MCP_OAUTH_JWT_ALGORITHMS entry: "${algorithm}" contains unsupported characters`,
      );
    }
  }
  return parsed;
}

function parseOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function parseNonNegativeInt(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Invalid ${name}: expected a non-negative integer`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid ${name}: expected a non-negative integer`);
  }
  return parsed;
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  name: string,
  max?: number,
): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Invalid ${name}: expected a positive integer`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer`);
  }
  if (max !== undefined && parsed > max) {
    throw new Error(`Invalid ${name}: expected a positive integer up to ${max}`);
  }
  return parsed;
}

function requireHttpsUrl(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(`Invalid ${name}: expected an absolute HTTPS URL`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`Invalid ${name}: expected an HTTPS URL`);
  }
  if (parsed.hash) {
    throw new Error(`Invalid ${name}: URL must not include a fragment`);
  }

  return parsed.toString();
}
