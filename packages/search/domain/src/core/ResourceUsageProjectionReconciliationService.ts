import {
  isResourceUsageProjectionRecord,
  type ResourceUsageProjectionPartition,
  type ResourceUsageProjectionRecord,
  type ResourceUsageProjectionRepository,
  type ResourceUsageProjectionSource,
} from '../contracts/resource-usage-projection';

export interface ResourceUsageProjectionSourceSnapshot {
  readonly source: ResourceUsageProjectionSource;
  readonly complete: boolean;
  readonly records: readonly ResourceUsageProjectionRecord[];
}

export interface ResourceUsageProjectionReader {
  readonly source: ResourceUsageProjectionSource;
  read(signal?: AbortSignal): Promise<ResourceUsageProjectionSourceSnapshot>;
}

export interface ResourceUsageProjectionReconciliationServiceOptions {
  readonly partition: ResourceUsageProjectionPartition;
  readonly repository: Pick<ResourceUsageProjectionRepository, 'replaceSource'>;
  readonly maximumRecordsPerSource: number;
  readonly now?: () => string;
}

export class ResourceUsageProjectionReconciliationService {
  private readonly now: () => string;

  constructor(private readonly options: ResourceUsageProjectionReconciliationServiceOptions) {
    if (
      !Number.isSafeInteger(options.maximumRecordsPerSource) ||
      options.maximumRecordsPerSource <= 0
    ) {
      throw new RangeError('Resource usage reconciliation limit must be a positive integer.');
    }
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async reconcile(reader: ResourceUsageProjectionReader, signal?: AbortSignal): Promise<number> {
    const snapshot = await reader.read(signal);
    if (!sameSource(snapshot.source, reader.source)) {
      throw new Error('Resource usage reader returned a foreign owner-qualified source.');
    }
    if (!snapshot.complete) {
      throw new Error('Resource usage reconciliation requires a complete source snapshot.');
    }
    if (snapshot.records.length > this.options.maximumRecordsPerSource) {
      throw new RangeError(
        `Resource usage source exceeds the ${this.options.maximumRecordsPerSource} record reconciliation limit.`,
      );
    }
    const identities = new Set<string>();
    for (const record of snapshot.records) {
      if (
        !isResourceUsageProjectionRecord(record) ||
        !sameSource(record.source, reader.source) ||
        identities.has(record.projectionId)
      ) {
        throw new Error(
          'Resource usage reader returned an invalid, duplicate, or foreign projection.',
        );
      }
      identities.add(record.projectionId);
    }
    await this.options.repository.replaceSource({
      partition: this.options.partition,
      source: reader.source,
      records: snapshot.records,
      updatedAt: this.now(),
    });
    return snapshot.records.length;
  }
}

function sameSource(
  left: ResourceUsageProjectionSource,
  right: ResourceUsageProjectionSource,
): boolean {
  return left.ownerId === right.ownerId && left.sourceId === right.sourceId;
}
