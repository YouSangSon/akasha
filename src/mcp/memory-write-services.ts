import type { CanonicalMemoryRepository, IngestJob } from "../types.js";
import { createPendingIndexJob } from "../store/memory-write-coordinator.js";
import type { CanonicalServices, WithCanonicalServices } from "./types.js";

export function withMemoryRecordWrite<T>(
  withServices: WithCanonicalServices,
  organizationId: string,
  recordIds: readonly number[],
  work: (services: CanonicalServices) => Promise<T>,
): Promise<T> {
  return withServices((services) => services.writes
    ? services.writes.record(organizationId, recordIds, (scope) => work({ ...services, ...scope }))
    : work(services));
}

export async function updateWithIndexIntent(
  services: CanonicalServices,
  input: Parameters<CanonicalMemoryRepository["updateMemoryRecord"]>[0],
  refresh: boolean,
) {
  let job: IngestJob | undefined;
  const memory = services.writes && refresh
    ? await services.repository.updateMemoryRecord(input, async (record) => {
      job = await createPendingIndexJob(services.ingestJobs, record.id, input.organizationId);
    })
    : await services.repository.updateMemoryRecord(input);
  return { memory, job };
}
