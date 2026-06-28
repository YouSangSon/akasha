import { describe, expect, it, vi } from "vitest";
import {
  type BackupManifest,
  buildRestoreSmokeCommandEnv,
  buildRestoreSmokeToolInput,
  runRestoreSmoke,
} from "../../scripts/restore-smoke.js";

describe("runRestoreSmoke", () => {
  it("restores Postgres and Qdrant, starts the app, then checks one search and one context pack", async () => {
    const events: string[] = [];
    const startEnvironment = vi.fn().mockImplementation(async () => {
      events.push("start");
    });
    const restorePostgres = vi.fn().mockImplementation(async () => {
      events.push("restore-postgres");
    });
    const restoreQdrant = vi.fn().mockImplementation(async () => {
      events.push("restore-qdrant");
    });
    const startApp = vi.fn().mockImplementation(async () => {
      events.push("start-app");
    });
    const callSearch = vi.fn().mockImplementation(async () => {
      events.push("search");
      return [{ id: 12 }];
    });
    const callPack = vi.fn().mockImplementation(async () => {
      events.push("pack");
      return { ok: true };
    });
    const stopEnvironment = vi.fn().mockImplementation(async () => {
      events.push("stop");
    });

    await runRestoreSmoke({
      startEnvironment,
      restorePostgres,
      restoreQdrant,
      startApp,
      callSearch,
      callPack,
      stopEnvironment,
    });

    expect(events).toEqual([
      "start",
      "restore-postgres",
      "restore-qdrant",
      "start-app",
      "search",
      "pack",
      "stop",
    ]);
    expect(stopEnvironment).toHaveBeenCalledTimes(1);
  });

  it("tears the environment down even when a restore step fails", async () => {
    const startEnvironment = vi.fn().mockResolvedValue(undefined);
    const restorePostgres = vi.fn().mockRejectedValue(new Error("pg restore failed"));
    const restoreQdrant = vi.fn().mockResolvedValue(undefined);
    const startApp = vi.fn().mockResolvedValue(undefined);
    const callSearch = vi.fn().mockResolvedValue([{ id: 12 }]);
    const callPack = vi.fn().mockResolvedValue({ ok: true });
    const stopEnvironment = vi.fn().mockResolvedValue(undefined);

    await expect(
      runRestoreSmoke({
        startEnvironment,
        restorePostgres,
        restoreQdrant,
        startApp,
        callSearch,
        callPack,
        stopEnvironment,
      }),
    ).rejects.toThrow("pg restore failed");

    expect(restoreQdrant).not.toHaveBeenCalled();
    expect(startApp).not.toHaveBeenCalled();
    expect(stopEnvironment).toHaveBeenCalledTimes(1);
  });

  it("skips Qdrant restore when the active backend is pgvector", async () => {
    const events: string[] = [];

    await runRestoreSmoke({
      startEnvironment: vi.fn().mockImplementation(async () => {
        events.push("start");
      }),
      restorePostgres: vi.fn().mockImplementation(async () => {
        events.push("restore-postgres");
      }),
      startApp: vi.fn().mockImplementation(async () => {
        events.push("start-app");
      }),
      callSearch: vi.fn().mockResolvedValue([{ id: 12 }]),
      callPack: vi.fn().mockResolvedValue({ ok: true }),
      stopEnvironment: vi.fn().mockImplementation(async () => {
        events.push("stop");
      }),
    });

    expect(events).toEqual([
      "start",
      "restore-postgres",
      "start-app",
      "stop",
    ]);
  });
});

describe("buildRestoreSmokeCommandEnv", () => {
  const baseManifest: BackupManifest = {
    createdAt: "2026-06-27T00:00:00Z",
    vectorBackend: "qdrant" as const,
    postgres: {
      fileName: "postgres-20260627-0000.sql.gz",
      sha256: "pg-sha",
    },
    qdrant: {
      fileName: "qdrant-20260627-0000.snapshot",
      sha256: "qdrant-sha",
      metadataFileName: "qdrant-custom_chunks-20260627-0000.json",
    },
  };

  function buildQdrantEnv(input: {
    env?: NodeJS.ProcessEnv;
    manifest?: BackupManifest;
  }) {
    return buildRestoreSmokeCommandEnv({
      env: input.env,
      databaseUrl: "postgres://memory:memory@127.0.0.1:15432/memory_os",
      vectorBackend: "qdrant",
      qdrantUrl: "http://127.0.0.1:16333",
      manifest: input.manifest ?? baseManifest,
      manifestPath: "/backups/manifest-20260627-0000.json",
      postgresArtifactPath: "/backups/postgres-20260627-0000.sql.gz",
      qdrantArtifactPath: "/backups/qdrant-20260627-0000.snapshot",
      qdrantMetadataPath: "/backups/qdrant-custom_chunks-20260627-0000.json",
    });
  }

  it("passes the manifest Qdrant collection and artifact paths to restore commands", () => {
    const env = buildQdrantEnv({
      env: {
        QDRANT_COLLECTION_NAME: "env_chunks",
      },
      manifest: {
        ...baseManifest,
        qdrant: {
          ...baseManifest.qdrant,
          fileName: "qdrant-20260627-0000.snapshot",
          sha256: "qdrant-sha",
          metadataFileName: "qdrant-custom_chunks-20260627-0000.json",
          collectionName: "custom_chunks",
        },
      },
    });

    expect(env.RESTORE_SMOKE_QDRANT_COLLECTION_NAME).toBe("custom_chunks");
    expect(env.QDRANT_COLLECTION_NAME).toBe("custom_chunks");
    expect(env.RESTORE_SMOKE_QDRANT_ARTIFACT_PATH).toBe(
      "/backups/qdrant-20260627-0000.snapshot",
    );
    expect(env.RESTORE_SMOKE_QDRANT_METADATA_PATH).toBe(
      "/backups/qdrant-custom_chunks-20260627-0000.json",
    );
  });

  it("falls back to QDRANT_COLLECTION_NAME for old manifests", () => {
    const env = buildQdrantEnv({
      env: {
        QDRANT_COLLECTION_NAME: "env_chunks",
      },
    });

    expect(env.RESTORE_SMOKE_QDRANT_COLLECTION_NAME).toBe("env_chunks");
    expect(env.QDRANT_COLLECTION_NAME).toBe("env_chunks");
  });

  it("falls back to the default collection for old manifests without env", () => {
    const env = buildQdrantEnv({
      env: {},
    });

    expect(env.RESTORE_SMOKE_QDRANT_COLLECTION_NAME).toBe("memory_chunks_v1");
    expect(env.QDRANT_COLLECTION_NAME).toBe("memory_chunks_v1");
  });

  it("rejects whitespace-only manifest collection names instead of falling back", () => {
    expect(() =>
      buildQdrantEnv({
        env: {
          QDRANT_COLLECTION_NAME: "env_chunks",
        },
        manifest: {
          ...baseManifest,
          qdrant: {
            ...baseManifest.qdrant,
            fileName: "qdrant-20260627-0000.snapshot",
            sha256: "qdrant-sha",
            collectionName: " \n\t ",
          },
        },
      }),
    ).toThrow("manifest qdrant.collectionName must contain non-whitespace text");
  });

  it("rejects whitespace-only QDRANT_COLLECTION_NAME instead of using the default", () => {
    expect(() =>
      buildQdrantEnv({
        env: {
          QDRANT_COLLECTION_NAME: " \n\t ",
        },
      }),
    ).toThrow("QDRANT_COLLECTION_NAME must contain non-whitespace text");
  });

  it("does not validate Qdrant collection settings in pgvector mode", () => {
    const env = buildRestoreSmokeCommandEnv({
      env: {
        QDRANT_COLLECTION_NAME: " \n\t ",
      },
      databaseUrl: "postgres://memory:memory@127.0.0.1:15432/memory_os",
      vectorBackend: "pgvector",
      manifest: {
        ...baseManifest,
        vectorBackend: "pgvector",
        qdrant: {
          ...baseManifest.qdrant,
          fileName: "qdrant-20260627-0000.snapshot",
          sha256: "qdrant-sha",
          collectionName: " \n\t ",
        },
      },
      manifestPath: "/backups/manifest-20260627-0000.json",
      postgresArtifactPath: "/backups/postgres-20260627-0000.sql.gz",
      qdrantArtifactPath: "",
      qdrantMetadataPath: "",
    });

    expect(env.RESTORE_SMOKE_QDRANT_COLLECTION_NAME).toBeUndefined();
    expect(env.QDRANT_COLLECTION_NAME).toBe(" \n\t ");
  });
});

describe("buildRestoreSmokeToolInput", () => {
  it("passes organizationId through to strict restore-smoke read calls", () => {
    expect(
      buildRestoreSmokeToolInput({
        projectKey: "project-alpha",
        userScopeId: "alice",
        organizationId: "org-a",
      }),
    ).toEqual({
      projectKey: "project-alpha",
      userScopeId: "alice",
      organizationId: "org-a",
    });
  });

  it("omits optional fields when restore smoke runs in legacy mode", () => {
    expect(buildRestoreSmokeToolInput({ projectKey: "project-alpha" })).toEqual({
      projectKey: "project-alpha",
    });
  });

  it.each([
    ["projectKey", { projectKey: " \n\t " }],
    [
      "userScopeId",
      {
        projectKey: "project-alpha",
        userScopeId: " \n\t ",
      },
    ],
    [
      "organizationId",
      {
        projectKey: "project-alpha",
        organizationId: " \n\t ",
      },
    ],
  ] satisfies Array<[string, Parameters<typeof buildRestoreSmokeToolInput>[0]]>)(
    "rejects whitespace-only %s before registry dispatch",
    (field, input) => {
      expect(() => buildRestoreSmokeToolInput(input)).toThrow(
        `${field} must contain non-whitespace text`,
      );
    },
  );
});
