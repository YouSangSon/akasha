export function assertOptionalVectorOrganizationId(
  organizationId: string | undefined,
): void {
  if (organizationId === undefined || organizationId === "") {
    return;
  }

  if (organizationId.trim().length === 0) {
    throw new Error("organizationId must not be blank");
  }
}
