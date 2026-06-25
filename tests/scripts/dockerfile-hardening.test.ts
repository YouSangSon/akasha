import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("docker/app.Dockerfile hardening", () => {
  const dockerfile = fs.readFileSync("docker/app.Dockerfile", "utf8");

  it("runs the runtime image as the non-root akasha user", () => {
    expect(dockerfile).toContain("addgroup -S -g 10001 akasha");
    expect(dockerfile).toContain("adduser -S -D -H -u 10001 -G akasha akasha");
    expect(dockerfile).toContain("USER akasha");
  });

  it("creates a writable backup directory before switching users", () => {
    expect(dockerfile).toContain(
      "mkdir -p /var/lib/developer-memory-os/backups",
    );
    expect(dockerfile).toContain(
      "chown -R akasha:akasha /app /var/lib/developer-memory-os",
    );
  });
});
