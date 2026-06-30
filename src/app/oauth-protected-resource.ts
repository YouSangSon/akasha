import type { ServerResponse } from "node:http";

const DEFAULT_SCOPES = ["akasha:memory"] as const;
const WELL_KNOWN_BASE = "/.well-known/oauth-protected-resource";

export type OAuthProtectedResourceMetadata = {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: ["header"];
  scopes_supported: string[];
  resource_name?: string;
  resource_documentation?: string;
};

export type OAuthProtectedResourceConfig = {
  metadata: OAuthProtectedResourceMetadata;
  metadataUrl: string;
};

export function loadOAuthProtectedResourceConfig(
  env: NodeJS.ProcessEnv,
): OAuthProtectedResourceConfig | null {
  const authorizationServers = parseCommaList(
    env.MCP_OAUTH_AUTHORIZATION_SERVERS,
    "MCP_OAUTH_AUTHORIZATION_SERVERS",
  );
  if (authorizationServers.length === 0) {
    return null;
  }

  const resource = requireHttpsUrl(
    env.MCP_OAUTH_RESOURCE_URL,
    "MCP_OAUTH_RESOURCE_URL",
  );
  assertSupportedResourceUrl(resource);

  const scopes = parseScopes(env.MCP_OAUTH_SCOPES);
  const resourceName = parseOptionalString(
    env.MCP_OAUTH_RESOURCE_NAME,
    "MCP_OAUTH_RESOURCE_NAME",
  );
  const documentationUrl = parseOptionalString(
    env.MCP_OAUTH_RESOURCE_DOCUMENTATION_URL,
    "MCP_OAUTH_RESOURCE_DOCUMENTATION_URL",
  );

  const metadata: OAuthProtectedResourceMetadata = {
    resource,
    authorization_servers: authorizationServers.map((value) =>
      requireHttpsUrl(value, "MCP_OAUTH_AUTHORIZATION_SERVERS"),
    ),
    bearer_methods_supported: ["header"],
    scopes_supported: scopes,
  };

  if (resourceName) {
    metadata.resource_name = resourceName;
  }
  if (documentationUrl) {
    metadata.resource_documentation = requireHttpsUrl(
      documentationUrl,
      "MCP_OAUTH_RESOURCE_DOCUMENTATION_URL",
    );
  }

  return {
    metadata,
    metadataUrl: buildProtectedResourceMetadataUrl(resource),
  };
}

export function isOAuthProtectedResourceMetadataPath(
  url: string | undefined,
): boolean {
  if (!url) {
    return false;
  }
  if (typeof url !== "string") {
    return false;
  }
  const path = parseRequestPath(url);
  return path === WELL_KNOWN_BASE || path === `${WELL_KNOWN_BASE}/mcp`;
}

export function sendOAuthProtectedResourceMetadata(
  res: ServerResponse,
  config: OAuthProtectedResourceConfig,
): void {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(config.metadata));
}

export function setOAuthWwwAuthenticateHeader(
  res: ServerResponse,
  config: OAuthProtectedResourceConfig | null,
): void {
  if (!config) {
    return;
  }
  res.setHeader("WWW-Authenticate", buildOAuthWwwAuthenticateHeader(config));
}

export function setOAuthInsufficientScopeHeader(
  res: ServerResponse,
  config: OAuthProtectedResourceConfig | null,
  scope: string,
): void {
  if (!config) {
    return;
  }
  res.setHeader(
    "WWW-Authenticate",
    buildOAuthInsufficientScopeHeader(config, scope),
  );
}

export function buildOAuthWwwAuthenticateHeader(
  config: OAuthProtectedResourceConfig,
): string {
  assertOAuthProtectedResourceConfig(config);
  const scope = config.metadata.scopes_supported.join(" ");
  return `Bearer resource_metadata="${quoteAuthParam(config.metadataUrl)}", scope="${quoteAuthParam(scope)}"`;
}

export function buildOAuthInsufficientScopeHeader(
  config: OAuthProtectedResourceConfig,
  scope: string,
): string {
  assertOAuthProtectedResourceConfig(config);
  assertString(scope, "scope");
  return `Bearer error="insufficient_scope", resource_metadata="${quoteAuthParam(config.metadataUrl)}", scope="${quoteAuthParam(scope)}"`;
}

export function buildProtectedResourceMetadataUrl(resource: string): string {
  assertString(resource, "resource");
  const parsed = new URL(resource);
  const path = parsed.pathname === "/mcp" ? "/mcp" : "";
  return `${parsed.origin}${WELL_KNOWN_BASE}${path}`;
}

function parseRequestPath(url: string): string {
  return new URL(url, "http://localhost").pathname;
}

function parseCommaList(value: string | undefined, name: string): string[] {
  if (value === undefined) {
    return [];
  }
  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.some((entry) => entry.length === 0)) {
    throw new Error(`Invalid ${name}: entries must not be blank`);
  }
  return entries;
}

function parseScopes(value: string | undefined): string[] {
  const scopes = parseCommaList(value, "MCP_OAUTH_SCOPES");
  if (scopes.length === 0) {
    return [...DEFAULT_SCOPES];
  }

  for (const scope of scopes) {
    if (/\s/.test(scope) || /["\\]/.test(scope)) {
      throw new Error(
        `Invalid MCP_OAUTH_SCOPES entry: "${scope}" contains unsupported characters`,
      );
    }
  }

  return scopes;
}

function parseOptionalString(
  value: string | undefined,
  name: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Invalid ${name}: must contain non-whitespace text`);
  }
  return trimmed;
}

function requireHttpsUrl(value: string | undefined, name: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

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

function assertSupportedResourceUrl(resource: string): void {
  const parsed = new URL(resource);
  if (parsed.search) {
    throw new Error(
      `Invalid MCP_OAUTH_RESOURCE_URL: URL must not include a query string`,
    );
  }

  const path = parsed.pathname;
  if (path !== "/" && path !== "/mcp") {
    throw new Error(
      `Invalid MCP_OAUTH_RESOURCE_URL: path must be "/" or "/mcp"`,
    );
  }
}

export function assertOAuthProtectedResourceConfig(
  config: unknown,
): asserts config is OAuthProtectedResourceConfig {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new Error("OAuth protected resource config must be an object");
  }

  const candidate = config as Record<string, unknown>;
  assertString(candidate.metadataUrl, "metadataUrl");

  if (
    typeof candidate.metadata !== "object" ||
    candidate.metadata === null ||
    Array.isArray(candidate.metadata)
  ) {
    throw new Error("metadata must be an object");
  }

  const metadata = candidate.metadata as Record<string, unknown>;
  assertString(metadata.resource, "metadata.resource");
  if (!Array.isArray(metadata.authorization_servers)) {
    throw new Error("metadata.authorization_servers must be an array");
  }
  for (const [index, server] of metadata.authorization_servers.entries()) {
    assertString(server, `metadata.authorization_servers[${index}]`);
  }
  if (
    !Array.isArray(metadata.bearer_methods_supported) ||
    metadata.bearer_methods_supported.length !== 1 ||
    metadata.bearer_methods_supported[0] !== "header"
  ) {
    throw new Error('metadata.bearer_methods_supported must be ["header"]');
  }
  if (!Array.isArray(metadata.scopes_supported)) {
    throw new Error("metadata.scopes_supported must be an array");
  }

  for (const [index, scope] of metadata.scopes_supported.entries()) {
    assertString(scope, `metadata.scopes_supported[${index}]`);
  }
}

function assertString(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
}

function quoteAuthParam(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
