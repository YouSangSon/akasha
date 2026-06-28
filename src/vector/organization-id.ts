export function assertVectorOrganizationId(organizationId: string): void {
  if (organizationId.trim().length === 0) {
    throw new Error("organizationId must not be blank");
  }
}

export function assertOptionalVectorOrganizationId(
  organizationId: string | undefined,
): void {
  if (organizationId === undefined || organizationId === "") {
    return;
  }

  assertVectorOrganizationId(organizationId);
}
