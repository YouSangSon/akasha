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
  const resourceName = parseOptionalString(env.MCP_OAUTH_RESOURCE_NAME);
  const documentationUrl = parseOptionalString(
    env.MCP_OAUTH_RESOURCE_DOCUMENTATION_URL,
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

export function buildOAuthWwwAuthenticateHeader(
  config: OAuthProtectedResourceConfig,
): string {
  const scope = config.metadata.scopes_supported.join(" ");
  return `Bearer resource_metadata="${quoteAuthParam(config.metadataUrl)}", scope="${quoteAuthParam(scope)}"`;
}

export function buildProtectedResourceMetadataUrl(resource: string): string {
  const parsed = new URL(resource);
  const path = parsed.pathname === "/mcp" ? "/mcp" : "";
  return `${parsed.origin}${WELL_KNOWN_BASE}${path}`;
}

function parseRequestPath(url: string): string {
  return new URL(url, "http://localhost").pathname;
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

function parseScopes(value: string | undefined): string[] {
  const scopes = parseCommaList(value);
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

function parseOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
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

function quoteAuthParam(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
