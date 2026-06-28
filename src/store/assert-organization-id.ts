/**
 * Shared guard for org-scoped read methods (listMemory, getMemoryRecordsByIds,
 * retrieveMemory). Throws when organizationId is blank, or when it is undefined
 * and the legacy anonymous escape hatch has not been opted into.
 *
 * Production wiring sets allowLegacyAnonymous from
 * `process.env.LEGACY_ANONYMOUS_SEARCH === "true"` at call time.
 */
import { assertNonBlankText } from "./memory-content.js";

export function assertOrganizationId(
  organizationId: string | undefined,
  allowLegacyAnonymous: boolean | undefined,
  fnName: string,
): void {
  if (organizationId === undefined) {
    if (allowLegacyAnonymous) {
      return;
    }
    throw new Error(
      `${fnName} requires organizationId. Bind your bearer token to ` +
        "an org with the `token:org` syntax in MEMORY_API_TOKENS, send the " +
        "`x-organization-id` header (or `organizationId` in the request " +
        "body), or opt into the legacy single-tenant org-blind read by " +
        "setting LEGACY_ANONYMOUS_SEARCH=true in the server's environment.",
    );
  }
  assertNonBlankText(organizationId, "organizationId");
}
