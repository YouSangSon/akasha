import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("docker/app.Dockerfile hardening", () => {
  const dockerfile = fs.readFileSync("docker/app.Dockerfile", "utf8");
  const ciWorkflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");
  const installScript = fs.readFileSync("install.sh", "utf8");
  const npmCiCommands = dockerfile
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("RUN ") && line.includes("npm ci"));
  const ciInstallCommands = ciWorkflow
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("run: ") && line.includes("npm ci"));
  const localInstallCommands = installScript
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line === "npm install" || line.endsWith(" npm install"));

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

  it("skips onnxruntime-node CUDA downloads during builder and runner installs", () => {
    expect(npmCiCommands).toHaveLength(2);
    expect(npmCiCommands[0]).toContain("ONNXRUNTIME_NODE_INSTALL_CUDA=skip");
    expect(npmCiCommands[1]).toContain("ONNXRUNTIME_NODE_INSTALL_CUDA=skip");
    expect(npmCiCommands[1]).toContain("--omit=dev");
    expect(dockerfile).not.toContain("--onnxruntime-node-install-cuda=skip");
  });

  it("uses the onnxruntime-node CUDA skip environment variable in CI", () => {
    expect(ciInstallCommands).toHaveLength(3);
    for (const command of ciInstallCommands) {
      expect(command).toContain("ONNXRUNTIME_NODE_INSTALL_CUDA=skip");
    }
    expect(ciWorkflow).not.toContain("--onnxruntime-node-install-cuda=skip");
  });

  it("uses the onnxruntime-node CUDA skip environment variable in install.sh", () => {
    expect(localInstallCommands).toEqual([
      "ONNXRUNTIME_NODE_INSTALL_CUDA=skip npm install",
    ]);
    expect(installScript).not.toContain("--onnxruntime-node-install-cuda=skip");
  });
});
