import fs from "node:fs/promises";
import path from "node:path";
import { assertNonBlankText } from "../store/memory-content.js";

export type LifecycleInitInput = {
  repoDir: string;
  outDir?: string;
  projectKey: string;
  organizationId?: string;
  userScopeId?: string;
  task?: string;
  force?: boolean;
};

export type LifecycleInitFile = {
  path: string;
  executable?: boolean;
  content: string;
};

export type LifecycleInitResult = {
  ok: true;
  outDir: string;
  files: Array<{
    path: string;
    action: "created" | "updated" | "skipped";
  }>;
  commands: {
    mcpServer: string;
    sessionStart: string;
    sessionEnd: string;
  };
};

const DEFAULT_OUT_DIR = ".akasha";
const DEFAULT_TASK = "continue implementation";

export async function writeLifecycleInit(
  input: LifecycleInitInput,
): Promise<LifecycleInitResult> {
  const normalized = normalizeLifecycleInput(input);
  const files = buildLifecycleFiles(normalized);
  const written: LifecycleInitResult["files"] = [];

  for (const file of files) {
    await fs.mkdir(path.dirname(file.path), { recursive: true });
    const exists = await fileExists(file.path);
    if (exists && !normalized.force) {
      written.push({ path: file.path, action: "skipped" });
      continue;
    }

    await fs.writeFile(file.path, file.content, {
      encoding: "utf8",
      mode: file.executable ? 0o755 : 0o644,
    });
    if (file.executable) {
      await fs.chmod(file.path, 0o755);
    }
    written.push({ path: file.path, action: exists ? "updated" : "created" });
  }

  return {
    ok: true,
    outDir: normalized.outDir,
    files: written,
    commands: {
      mcpServer: path.join(normalized.outDir, "bin", "mcp-server.sh"),
      sessionStart: path.join(normalized.outDir, "hooks", "session-start.sh"),
      sessionEnd: path.join(normalized.outDir, "hooks", "session-end.sh"),
    },
  };
}

export function buildLifecycleFiles(
  input: Required<Pick<LifecycleInitInput, "projectKey" | "repoDir">> &
    Omit<LifecycleInitInput, "projectKey" | "repoDir"> & {
      outDir: string;
      task: string;
      force: boolean;
    },
): LifecycleInitFile[] {
  const repoDir = path.resolve(input.repoDir);
  const outDir = path.resolve(repoDir, input.outDir);
  const mcpWrapperPath = path.join(outDir, "bin", "mcp-server.sh");
  const sessionStartPath = path.join(outDir, "hooks", "session-start.sh");
  const sessionEndPath = path.join(outDir, "hooks", "session-end.sh");

  return [
    {
      path: mcpWrapperPath,
      executable: true,
      content: renderMcpServerWrapper(repoDir),
    },
    {
      path: sessionStartPath,
      executable: true,
      content: renderSessionStartHook(repoDir, input),
    },
    {
      path: sessionEndPath,
      executable: true,
      content: renderSessionEndHook(repoDir, input),
    },
    {
      path: path.join(outDir, "mcp", "claude-desktop.json"),
      content: renderClaudeDesktopConfig(mcpWrapperPath),
    },
    {
      path: path.join(outDir, "mcp", "codex.toml"),
      content: renderCodexConfig(mcpWrapperPath),
    },
    {
      path: path.join(outDir, "README.md"),
      content: renderLifecycleReadme({
        projectKey: input.projectKey,
        organizationId: input.organizationId,
        task: input.task,
        repoDir,
        outDir,
      }),
    },
  ];
}

function normalizeLifecycleInput(input: LifecycleInitInput) {
  assertNonBlankText(input.repoDir, "repoDir");
  if (typeof input.projectKey !== "string") {
    throw new Error("projectKey must be a string");
  }
  if (!input.projectKey.trim()) {
    throw new Error("projectKey is required for lifecycle init.");
  }
  if (input.outDir !== undefined) {
    assertNonBlankText(input.outDir, "outDir");
  }
  if (input.organizationId !== undefined) {
    assertNonBlankText(input.organizationId, "organizationId");
  }
  if (input.userScopeId !== undefined) {
    assertNonBlankText(input.userScopeId, "userScopeId");
  }
  if (input.task !== undefined) {
    assertNonBlankText(input.task, "task");
  }

  const repoDir = path.resolve(input.repoDir);
  return {
    repoDir,
    outDir: path.resolve(repoDir, input.outDir ?? DEFAULT_OUT_DIR),
    projectKey: input.projectKey,
    organizationId: input.organizationId,
    userScopeId: input.userScopeId,
    task: input.task ?? DEFAULT_TASK,
    force: input.force ?? false,
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function renderMcpServerWrapper(repoDir: string): string {
  return `#!/usr/bin/env sh
set -eu

REPO_DIR=${shellQuote(repoDir)}
cd "$REPO_DIR"

if [ -f "$REPO_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_DIR/.env"
  set +a
fi

export DMO_CWD="\${DMO_CWD:-$REPO_DIR}"
if [ -z "\${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgres://\${POSTGRES_USER:-memory}:\${POSTGRES_PASSWORD:-memory}@127.0.0.1:\${POSTGRES_PORT:-5432}/\${POSTGRES_DB:-memory_os}"
fi

if [ "\${VECTOR_BACKEND:-qdrant}" = "qdrant" ]; then
  export QDRANT_URL="\${QDRANT_URL:-http://127.0.0.1:6333}"
  export QDRANT_API_KEY="\${QDRANT_API_KEY:-local-qdrant-key}"
fi

exec node "$REPO_DIR/dist/src/mcp/server.js" "$@"
`;
}

function renderSessionStartHook(
  repoDir: string,
  input: Pick<
    LifecycleInitInput,
    "organizationId" | "projectKey" | "task" | "userScopeId"
  >,
): string {
  return `#!/usr/bin/env sh
set -eu

REPO_DIR=${shellQuote(repoDir)}
DEFAULT_PROJECT_KEY=${shellQuote(input.projectKey)}
DEFAULT_TASK=${shellQuote(input.task ?? DEFAULT_TASK)}
DEFAULT_ORGANIZATION_ID=${shellQuote(input.organizationId ?? "")}
DEFAULT_USER_SCOPE_ID=${shellQuote(input.userScopeId ?? "")}

cd "$REPO_DIR"
if [ -f "$REPO_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_DIR/.env"
  set +a
fi

export DMO_CWD="\${DMO_CWD:-$REPO_DIR}"
if [ -z "\${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgres://\${POSTGRES_USER:-memory}:\${POSTGRES_PASSWORD:-memory}@127.0.0.1:\${POSTGRES_PORT:-5432}/\${POSTGRES_DB:-memory_os}"
fi

PROJECT_KEY="\${AKASHA_PROJECT_KEY:-$DEFAULT_PROJECT_KEY}"
TASK="\${1:-\${AKASHA_TASK:-$DEFAULT_TASK}}"
ORG_ID="\${AKASHA_ORGANIZATION_ID:-$DEFAULT_ORGANIZATION_ID}"
USER_SCOPE_ID="\${AKASHA_USER_SCOPE_ID:-$DEFAULT_USER_SCOPE_ID}"

set -- pack --project "$PROJECT_KEY" --task "$TASK"
if [ -n "$ORG_ID" ]; then
  set -- "$@" --organization-id "$ORG_ID"
fi
if [ -n "$USER_SCOPE_ID" ]; then
  set -- "$@" --user "$USER_SCOPE_ID"
fi

exec node "$REPO_DIR/dist/src/cli.js" "$@"
`;
}

function renderSessionEndHook(
  repoDir: string,
  input: Pick<LifecycleInitInput, "organizationId" | "projectKey" | "userScopeId">,
): string {
  return `#!/usr/bin/env sh
set -eu

REPO_DIR=${shellQuote(repoDir)}
DEFAULT_PROJECT_KEY=${shellQuote(input.projectKey)}
DEFAULT_ORGANIZATION_ID=${shellQuote(input.organizationId ?? "")}
DEFAULT_USER_SCOPE_ID=${shellQuote(input.userScopeId ?? "")}

cd "$REPO_DIR"
if [ -f "$REPO_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$REPO_DIR/.env"
  set +a
fi

export DMO_CWD="\${DMO_CWD:-$REPO_DIR}"
if [ -z "\${DATABASE_URL:-}" ]; then
  export DATABASE_URL="postgres://\${POSTGRES_USER:-memory}:\${POSTGRES_PASSWORD:-memory}@127.0.0.1:\${POSTGRES_PORT:-5432}/\${POSTGRES_DB:-memory_os}"
fi

CONTENT_FILE="$(mktemp "\${TMPDIR:-/tmp}/akasha-session-end.XXXXXX")"
trap 'rm -f "$CONTENT_FILE"' EXIT HUP INT TERM

if [ "$#" -gt 0 ]; then
  printf '%s\\n' "$*" > "$CONTENT_FILE"
elif [ -n "\${AKASHA_MEMORY_CONTENT:-}" ]; then
  printf '%s\\n' "$AKASHA_MEMORY_CONTENT" > "$CONTENT_FILE"
elif [ ! -t 0 ]; then
  cat > "$CONTENT_FILE"
fi

if [ ! -s "$CONTENT_FILE" ]; then
  echo "Provide session summary text as arguments, stdin, or AKASHA_MEMORY_CONTENT." >&2
  exit 64
fi

PROJECT_KEY="\${AKASHA_PROJECT_KEY:-$DEFAULT_PROJECT_KEY}"
ORG_ID="\${AKASHA_ORGANIZATION_ID:-$DEFAULT_ORGANIZATION_ID}"
USER_SCOPE_ID="\${AKASHA_USER_SCOPE_ID:-$DEFAULT_USER_SCOPE_ID}"
KIND="\${AKASHA_MEMORY_KIND:-summary}"

set -- remember --project "$PROJECT_KEY" --kind "$KIND" --content-file "$CONTENT_FILE"
if [ -n "$ORG_ID" ]; then
  set -- "$@" --organization-id "$ORG_ID"
fi
if [ -n "$USER_SCOPE_ID" ]; then
  set -- "$@" --user "$USER_SCOPE_ID"
fi

exec node "$REPO_DIR/dist/src/cli.js" "$@"
`;
}

function renderClaudeDesktopConfig(commandPath: string): string {
  return `${JSON.stringify(
    {
      mcpServers: {
        akasha: {
          command: commandPath,
          args: [],
        },
      },
    },
    null,
    2,
  )}\n`;
}

function renderCodexConfig(commandPath: string): string {
  return `[mcp_servers.akasha]
command = ${JSON.stringify(commandPath)}
args = []
`;
}

function renderLifecycleReadme(input: {
  projectKey: string;
  organizationId?: string;
  task: string;
  repoDir: string;
  outDir: string;
}): string {
  const displayOut = displayOutDir(input.repoDir, input.outDir);
  return `# Akasha lifecycle init

Generated files for wiring Akasha into MCP clients and agent lifecycle hooks.

## MCP clients

- Claude Desktop / Claude Code config snippet: \`${displayOut}/mcp/claude-desktop.json\`
- Codex CLI TOML snippet: \`${displayOut}/mcp/codex.toml\`
- Shared MCP server wrapper: \`${displayOut}/bin/mcp-server.sh\`

The wrapper sources \`.env\` at runtime and then starts \`dist/src/mcp/server.js\`.
Secrets stay in \`.env\`; they are not copied into the generated JSON/TOML.

## Lifecycle helpers

Session start:

\`\`\`bash
${displayOut}/hooks/session-start.sh "${input.task}"
\`\`\`

Session end:

\`\`\`bash
printf '%s\\n' "Summary: ..." | ${displayOut}/hooks/session-end.sh
\`\`\`

Defaults:

- project: \`${input.projectKey}\`
- organization: \`${input.organizationId ?? "(unset)"}\`

Override with \`AKASHA_PROJECT_KEY\`, \`AKASHA_ORGANIZATION_ID\`,
\`AKASHA_USER_SCOPE_ID\`, \`AKASHA_TASK\`, or \`AKASHA_MEMORY_KIND\`.
`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function displayOutDir(repoDir: string, outDir: string): string {
  const relative = path.relative(repoDir, outDir);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative;
  }
  return outDir;
}
