import type { VectorPoint } from "./vector-index.js";

export function assertVectorOrganizationId(organizationId: string): void {
  if (organizationId.trim().length === 0) {
    throw new Error("organizationId must not be blank");
  }
}

export function assertVectorPointOrganizationIds(
  points: readonly VectorPoint[],
): void {
  for (const point of points) {
    const organizationId = point.payload.organization_id;
    if (typeof organizationId !== "string") {
      throw new Error(
        `upsert: point "${point.id}" must include string payload.organization_id`,
      );
    }

    assertVectorOrganizationId(organizationId);
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
