import { describe, expect, it, vi } from "vitest";
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type FetchImplementation,
  type JWK,
} from "jose";
import {
  acceptedScopesForKind,
  checkOAuthScopes,
  createOAuthTokenVerifier,
  loadOAuthTokenVerifierConfig,
  requiredScopeKindForTool,
} from "../../src/app/middleware/oauth-token-auth.js";
import type { OAuthProtectedResourceConfig } from "../../src/app/oauth-protected-resource.js";

const protectedResource: OAuthProtectedResourceConfig = {
  metadataUrl:
    "https://akasha.example.com/.well-known/oauth-protected-resource/mcp",
  metadata: {
    resource: "https://akasha.example.com/mcp",
    authorization_servers: ["https://auth.example.com/"],
    bearer_methods_supported: ["header"],
    scopes_supported: ["akasha:read", "akasha:write", "akasha:admin"],
  },
};

describe("loadOAuthTokenVerifierConfig", () => {
  it("returns null when OAuth protected-resource metadata is disabled", () => {
    expect(loadOAuthTokenVerifierConfig({}, null)).toBeNull();
  });

  it("builds verifier config from protected-resource metadata", () => {
    const config = loadOAuthTokenVerifierConfig(
      {
        MCP_OAUTH_JWKS_URLS: "https://auth.example.com/jwks",
        MCP_OAUTH_JWT_ALGORITHMS: "RS256,ES256",
        MCP_OAUTH_JWT_CLOCK_TOLERANCE_SECONDS: "15",
        MCP_OAUTH_ORGANIZATION_CLAIM: "tenant",
        MCP_OAUTH_JWT_TYPE: "at+jwt",
      },
      protectedResource,
    );

    expect(config).toMatchObject({
      resource: "https://akasha.example.com/mcp",
      algorithms: ["RS256", "ES256"],
      clockToleranceSeconds: 15,
      organizationClaim: "tenant",
      requiredType: "at+jwt",
      issuers: [
        expect.objectContaining({
          jwksUrl: "https://auth.example.com/jwks",
          issuerCandidates: [
            "https://auth.example.com/",
            "https://auth.example.com",
          ],
        }),
      ],
    });
  });

  it("rejects a JWKS URL count that does not match configured issuers", () => {
    expect(() =>
      loadOAuthTokenVerifierConfig(
        {
          MCP_OAUTH_JWKS_URLS:
            "https://auth.example.com/jwks,https://extra.example.com/jwks",
        },
        protectedResource,
      ),
    ).toThrow(/one JWKS URL per/);
  });
});

describe("OAuth token verifier", () => {
  it("verifies a JWT against JWKS, issuer, audience, and extracts scope/org claims", async () => {
    const fixture = await createJwtFixture({
      scope: "akasha:read akasha:write",
      organization_id: "org-a",
    });
    const verifier = createOAuthTokenVerifier(
      loadOAuthTokenVerifierConfig(
        { MCP_OAUTH_JWKS_URLS: "https://auth.example.com/jwks" },
        protectedResource,
      ),
      { fetch: fixture.fetch },
    );

    const result = await verifier!.verify(fixture.jwt);

    expect(result).toMatchObject({
      token: fixture.jwt,
      authType: "oauth",
      scopes: ["akasha:read", "akasha:write"],
      organizationId: "org-a",
      subject: "user-1",
      issuer: "https://auth.example.com",
      audience: "https://akasha.example.com/mcp",
    });
  });

  it("rejects a token with the wrong audience", async () => {
    const fixture = await createJwtFixture(
      { scope: "akasha:read" },
      { audience: "https://other.example.com/mcp" },
    );
    const verifier = createOAuthTokenVerifier(
      loadOAuthTokenVerifierConfig(
        { MCP_OAUTH_JWKS_URLS: "https://auth.example.com/jwks" },
        protectedResource,
      ),
      { fetch: fixture.fetch },
    );

    await expect(verifier!.verify(fixture.jwt)).resolves.toBeNull();
  });

  it("extracts scopes from the scp array claim", async () => {
    const fixture = await createJwtFixture({
      scp: ["akasha:read", "akasha:admin"],
    });
    const verifier = createOAuthTokenVerifier(
      loadOAuthTokenVerifierConfig(
        { MCP_OAUTH_JWKS_URLS: "https://auth.example.com/jwks" },
        protectedResource,
      ),
      { fetch: fixture.fetch },
    );

    const result = await verifier!.verify(fixture.jwt);

    expect(result!.scopes).toEqual(["akasha:read", "akasha:admin"]);
  });
});

describe("OAuth scope enforcement", () => {
  it("maps tools to read/write/admin scope kinds", () => {
    expect(requiredScopeKindForTool("search_memory", {})).toBe("read");
    expect(requiredScopeKindForTool("build_context_pack", {})).toBe("read");
    expect(requiredScopeKindForTool("add_memory", {})).toBe("write");
    expect(requiredScopeKindForTool("compact_memory", { dryRun: true })).toBe(
      "read",
    );
    expect(requiredScopeKindForTool("compact_memory", { dryRun: false })).toBe(
      "admin",
    );
    expect(requiredScopeKindForTool("list_audit_log", {})).toBe("admin");
  });

  it("treats akasha:memory as the umbrella compatibility scope", () => {
    expect(acceptedScopesForKind("read")).toContain("akasha:memory");
    expect(acceptedScopesForKind("write")).toContain("akasha:memory");
    expect(acceptedScopesForKind("admin")).toContain("akasha:memory");
  });

  it("returns insufficient_scope when an OAuth token lacks the required scope", () => {
    const result = checkOAuthScopes(
      {
        token: "jwt",
        authType: "oauth",
        scopes: ["akasha:read"],
      },
      "add_memory",
      {},
      protectedResource,
    );

    expect(result).toEqual({
      ok: false,
      kind: "write",
      challengeScope: "akasha:write",
    });
  });

  it("does not scope-check static bearer tokens", () => {
    expect(
      checkOAuthScopes(
        { token: "static", authType: "static" },
        "add_memory",
        {},
        protectedResource,
      ),
    ).toEqual({ ok: true });
  });
});

async function createJwtFixture(
  claims: Record<string, unknown>,
  options: { audience?: string; issuer?: string } = {},
): Promise<{ jwt: string; fetch: FetchImplementation }> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = (await exportJWK(publicKey)) as JWK & {
    kid?: string;
    alg?: string;
    use?: string;
  };
  publicJwk.kid = "test-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  const issuer = options.issuer ?? "https://auth.example.com";
  const audience = options.audience ?? "https://akasha.example.com/mcp";
  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  const fetchImpl = vi.fn<FetchImplementation>(async (url) => {
    expect(url).toBe("https://auth.example.com/jwks");
    return new Response(JSON.stringify({ keys: [publicJwk] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  return { jwt, fetch: fetchImpl };
}
