import { execFile } from "node:child_process";
import fs from "node:fs";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}

describe("owned local Qdrant backup/restore runner", () => {
  it("generates executable wrappers with shebangs that ignore caller URLs", async () => {
    const runner = read("tests/eval/run-backup-restore.sh");
    const wrapperStart = runner.indexOf('mkdir -p "$wrapper_dir"');
    const wrapperEnd = runner.indexOf("\nnpm run build", wrapperStart);
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "akasha-wrapper-test-"));
    tempDirs.push(tempDir);
    const wrapperDir = path.join(tempDir, "bin");
    const fakeBin = path.join(tempDir, "fake-bin");
    const logPath = path.join(tempDir, "docker.log");
    const wrapperEnv = {
      ...process.env,
      wrapper_dir: wrapperDir,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      AKASHA_BACKUP_CONTAINER_CLI: "docker",
      AKASHA_BACKUP_SOURCE_PROJECT: "akasha-backup-restore-123",
      AKASHA_BACKUP_SOURCE_DATABASE: "akasha_backup_restore_123",
      AKASHA_BACKUP_RESTORE_PROJECT: "akasha-restore-123",
      AKASHA_WRAPPER_LOG: logPath,
    };

    expect(wrapperStart).toBeGreaterThanOrEqual(0);
    expect(wrapperEnd).toBeGreaterThan(wrapperStart);

    await fs.promises.mkdir(fakeBin);
    await writeFile(
      path.join(fakeBin, "docker"),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "$AKASHA_WRAPPER_LOG"\n`,
    );
    await chmod(path.join(fakeBin, "docker"), 0o700);

    await execFileAsync("sh", ["-c", runner.slice(wrapperStart, wrapperEnd)], {
      env: wrapperEnv,
    });

    const pgDump = path.join(wrapperDir, "pg_dump");
    const psql = path.join(wrapperDir, "psql");
    await expect(readFile(pgDump, "utf8")).resolves.toBe(
      '#!/bin/sh\nset -eu\nexec "$AKASHA_BACKUP_CONTAINER_CLI" compose -f compose.yaml -p "$AKASHA_BACKUP_SOURCE_PROJECT" exec -T postgres pg_dump -U memory "$AKASHA_BACKUP_SOURCE_DATABASE"\n',
    );
    await expect(readFile(psql, "utf8")).resolves.toBe(
      '#!/bin/sh\nset -eu\nexec "$AKASHA_BACKUP_CONTAINER_CLI" compose -f compose.yaml -f compose.restore-smoke.yaml -p "$AKASHA_BACKUP_RESTORE_PROJECT" exec -T postgres psql -X -v ON_ERROR_STOP=1 -U memory -d memory_os\n',
    );
    await execFileAsync("sh", ["-n", pgDump]);
    await execFileAsync("sh", ["-n", psql]);
    await execFileAsync(pgDump, ["postgres://caller.invalid/ignored"], {
      env: wrapperEnv,
    });
    await execFileAsync(psql, ["postgres://caller.invalid/ignored"], {
      env: wrapperEnv,
    });

    await expect(readFile(logPath, "utf8")).resolves.toBe(
      [
        "compose -f compose.yaml -p akasha-backup-restore-123 exec -T postgres pg_dump -U memory akasha_backup_restore_123",
        "compose -f compose.yaml -f compose.restore-smoke.yaml -p akasha-restore-123 exec -T postgres psql -X -v ON_ERROR_STOP=1 -U memory -d memory_os",
        "",
      ].join("\n"),
    );
  }, 15_000);

  it("does not execute SQL after a corrupt compressed backup", async () => {
    const runner = read("tests/eval/run-backup-restore.sh");
    const commandLine = runner.split("\n").find((line) => line.startsWith("export RESTORE_SMOKE_POSTGRES_RESTORE_CMD="));
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "akasha-corrupt-backup-"));
    tempDirs.push(tempDir);
    await fs.promises.mkdir(path.join(tempDir, "bin"));
    const sqlCalled = path.join(tempDir, "sql-called");
    await writeFile(path.join(tempDir, "bin", "psql"), '#!/bin/sh\ntouch "$BACKUP_DIR/sql-called"\n');
    await chmod(path.join(tempDir, "bin", "psql"), 0o700);
    const artifact = path.join(tempDir, "broken.sql.gz");
    await writeFile(artifact, "not gzip");
    await expect(execFileAsync("sh", ["-c", `${commandLine}\nsh -c "$RESTORE_SMOKE_POSTGRES_RESTORE_CMD"`], {
      env: { ...process.env, BACKUP_DIR: tempDir, wrapper_dir: path.join(tempDir, "bin"), RESTORE_SMOKE_POSTGRES_ARTIFACT_PATH: artifact },
    })).rejects.toThrow();
    expect(fs.existsSync(sqlCalled)).toBe(false);
  }, 15_000);

  it("isolates its disposable services, credentials, ports, and backup directory", () => {
    const runner = read("tests/eval/run-backup-restore.sh");

    expect(runner).toContain("mktemp -d");
    expect(runner).toContain("akasha-backup-restore-");
    expect(runner).toContain("akasha-restore-");
    expect(runner).toContain('wrapper_dir="$backup_dir/bin"');
    expect(runner).toContain('PATH="$wrapper_dir:$PATH"');
    expect(runner).toContain("AKASHA_BACKUP_SOURCE_PROJECT");
    expect(runner).toContain("AKASHA_BACKUP_RESTORE_PROJECT");
    expect(runner).toContain('exec "$AKASHA_BACKUP_CONTAINER_CLI" compose');
    expect(runner).toContain('exec -T postgres pg_dump -U memory "$AKASHA_BACKUP_SOURCE_DATABASE"');
    expect(runner).toContain('exec -T postgres psql -X -v ON_ERROR_STOP=1 -U memory -d memory_os');
    expect(runner).not.toContain('for command in "$container_cli" curl lsof pg_dump psql');
    expect(runner).toContain("assert_valid_port");
    expect(runner).toContain("assert_port_free");
    expect(runner).toContain('"$source_postgres_port"');
    expect(runner).toContain('"$source_qdrant_port"');
    expect(runner).toContain('"$restore_postgres_port"');
    expect(runner).toContain('"$restore_qdrant_port"');
    expect(runner).toContain('"$restore_app_port"');
    expect(runner).toContain("export POSTGRES_USER=memory");
    expect(runner).toContain("export POSTGRES_PASSWORD=memory");
    expect(runner).toContain("export QDRANT_API_KEY=local-qdrant-key");
    expect(runner).toContain("export EMBEDDING_PROVIDER=transformers");
    expect(runner).toContain("unset BACKUP_TARGET_HOST BACKUP_TARGET_DIR");
    expect(runner).toContain(
      "unset BACKUP_ENCRYPTION_KEY_FILE BACKUP_ENCRYPTION_KEEP_PLAINTEXT",
    );
    expect(runner).toContain("unset OPENAI_API_KEY OPENAI_EMBEDDING_MODEL");
    expect(runner).toContain("127.0.0.1");
    expect(runner).toContain("npm run backup:create:qdrant");
    expect(runner).toContain("npm run restore:smoke");
    expect(runner).toContain('gunzip -c "$RESTORE_SMOKE_POSTGRES_ARTIFACT_PATH"');
    expect(runner).toContain("down -v --remove-orphans");
    expect(runner).toContain('rm -rf -- "$backup_dir"');
    expect(runner.indexOf("export AKASHA_BACKUP_ORGANIZATION_ID=")).toBeLessThan(
      runner.indexOf("./node_modules/.bin/tsx -e"),
    );
    expect(runner).toContain("async function seedBackupProof()");
    expect(runner).toContain("seedBackupProof().catch");
    expect(runner).toContain(
      'import { bootstrapCanonicalServices } from "./src/mcp/canonical-services.ts";',
    );
    expect(runner).toContain(
      "resolveCanonicalServices: bootstrapCanonicalServices",
    );
    expect(runner).not.toContain("process.exit(");
    expect(runner.indexOf("unset BACKUP_TARGET_HOST BACKUP_TARGET_DIR")).toBeLessThan(
      runner.indexOf("npm run build"),
    );
    expect(runner.match(/source_compose down -v --remove-orphans/g)).toHaveLength(2);
    expect(runner.lastIndexOf("source_compose down -v --remove-orphans")).toBeLessThan(
      runner.indexOf("npm run restore:smoke"),
    );
  });

  it("documents an authenticated Qdrant snapshot upload for the restore smoke", () => {
    for (const path of [
      "docs/self-hosted-operations.md",
      "docs/self-hosted-operations.ko.md",
    ]) {
      const text = read(path);

      expect(text).toContain("QDRANT_API_KEY");
      expect(text).toContain('-H "api-key: $QDRANT_API_KEY"');
      expect(text).toContain("run-backup-restore.sh");
    }
  });
});
