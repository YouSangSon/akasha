import { describe, expect, it, vi } from "vitest";
import {
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
});
