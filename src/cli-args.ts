export type ParsedCliArgs =
  | {
      command: "pack";
      projectKey: string;
      userScopeId?: string;
      organizationId?: string;
      task: string;
      maxOutputBytes?: number;
    }
  | {
      command: "reindex";
      projectKey: string;
      userScopeId?: string;
      organizationId?: string;
    }
  | {
      command: "remember";
      projectKey: string;
      userScopeId?: string;
      organizationId?: string;
      kind: string;
      content?: string;
      contentFile?: string;
    }
  | {
      command: "init";
      projectKey: string;
      userScopeId?: string;
      organizationId?: string;
      task?: string;
      outDir?: string;
      force: boolean;
    }
  | {
      command: "backup-verify";
    }
  | {
      command: "restore-smoke";
    };

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  assertStringArray(argv, "argv");
  const [command, ...rest] = argv;

  if (command === "backup-verify" || command === "restore-smoke") {
    if (rest.length > 0) {
      throw new Error(`Unsupported argument: ${rest[0]}`);
    }

    return { command };
  }

  if (command === "init") {
    return parseInitArgs(rest);
  }

  if (command === "remember") {
    return parseRememberArgs(rest);
  }

  if (command !== "pack" && command !== "reindex") {
    throw new Error(`Unsupported command: ${command ?? "(missing)"}`);
  }

  let projectKey: string | undefined;
  let userScopeId: string | undefined;
  let task: string | undefined;
  let organizationId: string | undefined;
  let maxOutputBytes: number | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];

    if (token === "--project") {
      projectKey = requireNonBlankFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--max-output-bytes" && command === "pack") {
      const raw = requireNonBlankFlagValue(token, value);
      maxOutputBytes = /^\d+$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) {
        throw new Error("--max-output-bytes must be a positive safe integer");
      }
      index += 1;
      continue;
    }

    if (token === "--task") {
      task = requireNonBlankFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--user") {
      userScopeId = requireNonBlankFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--organization-id") {
      organizationId = requireNonBlankFlagValue(token, value);
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${token}`);
  }

  if (!projectKey) {
    throw new Error("Missing required --project argument");
  }

  if (command === "pack" && !task) {
    throw new Error("Missing required --task argument");
  }

  if (command === "reindex") {
    return {
      command,
      projectKey,
      userScopeId,
      organizationId,
    };
  }

  return {
    command: "pack",
    projectKey,
    userScopeId,
    organizationId,
    task: task!,
    ...(maxOutputBytes === undefined ? {} : { maxOutputBytes }),
  };
}

function assertStringArray(
  value: unknown,
  fieldName: string,
): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string") {
      throw new Error(`${fieldName}[${index}] must be a string`);
    }
  }
}

function parseRememberArgs(rest: string[]): ParsedCliArgs {
  let projectKey: string | undefined;
  let userScopeId: string | undefined;
  let organizationId: string | undefined;
  let kind: string | undefined;
  let content: string | undefined;
  let contentFile: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];

    if (token === "--project") {
      projectKey = requireNonBlankFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--user") {
      userScopeId = requireNonBlankFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--organization-id") {
      organizationId = requireNonBlankFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--kind") {
      kind = requireNonBlankFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--content") {
      content = requireNonBlankFlagValue(token, value, {
        allowLeadingDash: true,
      });
      index += 1;
      continue;
    }

    if (token === "--content-file") {
      contentFile = requireNonBlankFlagValue(token, value);
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${token}`);
  }

  if (!projectKey) {
    throw new Error("Missing required --project argument");
  }
  if (!kind) {
    throw new Error("Missing required --kind argument");
  }
  if (!content && !contentFile) {
    throw new Error("Missing required --content or --content-file argument");
  }
  if (content && contentFile) {
    throw new Error("Use either --content or --content-file, not both");
  }

  return {
    command: "remember",
    projectKey,
    userScopeId,
    organizationId,
    kind,
    content,
    contentFile,
  };
}

function parseInitArgs(rest: string[]): ParsedCliArgs {
  let projectKey: string | undefined;
  let userScopeId: string | undefined;
  let organizationId: string | undefined;
  let task: string | undefined;
  let outDir: string | undefined;
  let force = false;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];

    if (token === "--project") {
      projectKey = requireNonBlankFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--user") {
      userScopeId = requireNonBlankFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--organization-id") {
      organizationId = requireNonBlankFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--task") {
      task = requireNonBlankFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--out-dir") {
      outDir = requireNonBlankFlagValue(token, value);
      index += 1;
      continue;
    }

    if (token === "--force") {
      force = true;
      continue;
    }

    throw new Error(`Unsupported argument: ${token}`);
  }

  if (!projectKey) {
    throw new Error("Missing required --project argument");
  }

  return {
    command: "init",
    projectKey,
    userScopeId,
    organizationId,
    task,
    outDir,
    force,
  };
}

function requireFlagValue(
  flag: string,
  value: string | undefined,
  options: { allowLeadingDash?: boolean } = {},
): string {
  if (!value || (!options.allowLeadingDash && value.startsWith("--"))) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function requireNonBlankFlagValue(
  flag: string,
  value: string | undefined,
  options: { allowLeadingDash?: boolean } = {},
): string {
  const resolved = requireFlagValue(flag, value, options);
  if (resolved.trim().length === 0) {
    throw new Error(`${flag} must contain non-whitespace text`);
  }
  return resolved;
}
