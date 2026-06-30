import type { CreateToolRegistryOptions } from "./types.js";

export function assertCreateToolRegistryOptions(
  value: unknown,
): asserts value is CreateToolRegistryOptions {
  const candidate = assertObject(value, "tool registry options");

  assertOptionalNonBlankString(candidate.cwd, "cwd");
  assertOptionalNonBlankString(
    candidate.defaultUserScopeId,
    "defaultUserScopeId",
  );
  assertOptionalNonBlankString(candidate.defaultActor, "defaultActor");

  assertOptionalObject(candidate.repository, "repository");
  assertOptionalObject(candidate.projectRepository, "projectRepository");
  assertOptionalObject(candidate.userRepository, "userRepository");
  assertOptionalObject(candidate.logger, "logger");
  assertOptionalObject(candidate.auditLog, "auditLog");

  assertOptionalFunction(candidate.resolveRepository, "resolveRepository");
  assertOptionalFunction(
    candidate.resolveCanonicalServices,
    "resolveCanonicalServices",
  );
  assertOptionalFunction(candidate.withCanonicalServices, "withCanonicalServices");
  assertOptionalFunction(candidate.retrieveMemory, "retrieveMemory");
}

export function assertObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function assertNonBlankString(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must contain non-whitespace text`);
  }
}

export function assertFunction(value: unknown, fieldName: string): void {
  if (typeof value !== "function") {
    throw new Error(`${fieldName} must be a function`);
  }
}

function assertOptionalObject(value: unknown, fieldName: string): void {
  if (value !== undefined) {
    assertObject(value, fieldName);
  }
}

function assertOptionalNonBlankString(value: unknown, fieldName: string): void {
  if (value !== undefined) {
    assertNonBlankString(value, fieldName);
  }
}

function assertOptionalFunction(value: unknown, fieldName: string): void {
  if (value !== undefined) {
    assertFunction(value, fieldName);
  }
}
