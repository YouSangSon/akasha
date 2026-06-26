import { describe, expect, it } from "vitest";
import {
  buildOAuthInsufficientScopeHeader,
  buildOAuthWwwAuthenticateHeader,
  buildProtectedResourceMetadataUrl,
  loadOAuthProtectedResourceConfig,
} from "../../src/app/oauth-protected-resource.js";

describe("loadOAuthProtectedResourceConfig", () => {
  it("returns null when authorization servers are not configured", () => {
    expect(loadOAuthProtectedResourceConfig({})).toBeNull();
    expect(
      loadOAuthProtectedResourceConfig({
        MCP_OAUTH_AUTHORIZATION_SERVERS: " , ",
      }),
    ).toBeNull();
  });

  it("builds protected resource metadata with default scopes", () => {
    const config = loadOAuthProtectedResourceConfig({
      MCP_OAUTH_AUTHORIZATION_SERVERS:
        "https://auth-a.example.com, https://auth-b.example.com/issuer",
      MCP_OAUTH_RESOURCE_URL: "https://akasha.example.com/mcp",
    });

    expect(config).not.toBeNull();
    expect(config!.metadata).toEqual({
      resource: "https://akasha.example.com/mcp",
      authorization_servers: [
        "https://auth-a.example.com/",
        "https://auth-b.example.com/issuer",
      ],
      bearer_methods_supported: ["header"],
      scopes_supported: ["akasha:memory"],
    });
    expect(config!.metadataUrl).toBe(
      "https://akasha.example.com/.well-known/oauth-protected-resource/mcp",
    );
  });

  it("includes configured scopes and human-readable resource fields", () => {
    const config = loadOAuthProtectedResourceConfig({
      MCP_OAUTH_AUTHORIZATION_SERVERS: "https://auth.example.com",
      MCP_OAUTH_RESOURCE_URL: "https://akasha.example.com/mcp",
      MCP_OAUTH_SCOPES: "akasha:memory,akasha:write",
      MCP_OAUTH_RESOURCE_NAME: "Akasha Memory",
      MCP_OAUTH_RESOURCE_DOCUMENTATION_URL: "https://docs.example.com/akasha",
    });

    expect(config!.metadata).toMatchObject({
      scopes_supported: ["akasha:memory", "akasha:write"],
      resource_name: "Akasha Memory",
      resource_documentation: "https://docs.example.com/akasha",
    });
  });

  it("requires a resource URL when authorization servers are configured", () => {
    expect(() =>
      loadOAuthProtectedResourceConfig({
        MCP_OAUTH_AUTHORIZATION_SERVERS: "https://auth.example.com",
      }),
    ).toThrow(/MCP_OAUTH_RESOURCE_URL/);
  });

  it("rejects non-HTTPS OAuth discovery URLs", () => {
    expect(() =>
      loadOAuthProtectedResourceConfig({
        MCP_OAUTH_AUTHORIZATION_SERVERS: "https://auth.example.com",
        MCP_OAUTH_RESOURCE_URL: "http://akasha.example.com/mcp",
      }),
    ).toThrow(/MCP_OAUTH_RESOURCE_URL/);

    expect(() =>
      loadOAuthProtectedResourceConfig({
        MCP_OAUTH_AUTHORIZATION_SERVERS: "http://auth.example.com",
        MCP_OAUTH_RESOURCE_URL: "https://akasha.example.com/mcp",
      }),
    ).toThrow(/MCP_OAUTH_AUTHORIZATION_SERVERS/);
  });

  it("rejects unsupported resource paths and invalid scope tokens", () => {
    expect(() =>
      loadOAuthProtectedResourceConfig({
        MCP_OAUTH_AUTHORIZATION_SERVERS: "https://auth.example.com",
        MCP_OAUTH_RESOURCE_URL: "https://akasha.example.com/custom/mcp",
      }),
    ).toThrow(/path must be/);

    expect(() =>
      loadOAuthProtectedResourceConfig({
        MCP_OAUTH_AUTHORIZATION_SERVERS: "https://auth.example.com",
        MCP_OAUTH_RESOURCE_URL: "https://akasha.example.com/mcp",
        MCP_OAUTH_SCOPES: "akasha:memory, bad scope",
      }),
    ).toThrow(/MCP_OAUTH_SCOPES/);
  });

  it("rejects resource URLs with query strings", () => {
    for (const resourceUrl of [
      "https://akasha.example.com/mcp?tenant=alpha",
      "https://akasha.example.com/?resource=mcp",
    ]) {
      expect(() =>
        loadOAuthProtectedResourceConfig({
          MCP_OAUTH_AUTHORIZATION_SERVERS: "https://auth.example.com",
          MCP_OAUTH_RESOURCE_URL: resourceUrl,
        }),
      ).toThrow(/query string/);
    }
  });
});

describe("OAuth protected resource challenge helpers", () => {
  it("derives the well-known URL from the protected MCP resource", () => {
    expect(buildProtectedResourceMetadataUrl("https://akasha.example.com/mcp")).toBe(
      "https://akasha.example.com/.well-known/oauth-protected-resource/mcp",
    );
    expect(buildProtectedResourceMetadataUrl("https://akasha.example.com/")).toBe(
      "https://akasha.example.com/.well-known/oauth-protected-resource",
    );
  });

  it("builds a Bearer challenge with metadata and scope parameters", () => {
    const config = loadOAuthProtectedResourceConfig({
      MCP_OAUTH_AUTHORIZATION_SERVERS: "https://auth.example.com",
      MCP_OAUTH_RESOURCE_URL: "https://akasha.example.com/mcp",
      MCP_OAUTH_SCOPES: "akasha:memory,akasha:write",
    });

    expect(buildOAuthWwwAuthenticateHeader(config!)).toBe(
      'Bearer resource_metadata="https://akasha.example.com/.well-known/oauth-protected-resource/mcp", scope="akasha:memory akasha:write"',
    );
  });

  it("builds an insufficient_scope Bearer challenge", () => {
    const config = loadOAuthProtectedResourceConfig({
      MCP_OAUTH_AUTHORIZATION_SERVERS: "https://auth.example.com",
      MCP_OAUTH_RESOURCE_URL: "https://akasha.example.com/mcp",
      MCP_OAUTH_SCOPES: "akasha:read,akasha:write",
    });

    expect(buildOAuthInsufficientScopeHeader(config!, "akasha:write")).toBe(
      'Bearer error="insufficient_scope", resource_metadata="https://akasha.example.com/.well-known/oauth-protected-resource/mcp", scope="akasha:write"',
    );
  });
});
