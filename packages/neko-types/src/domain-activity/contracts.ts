import type { ResourceRef } from '../types/resource-cache';
import type { JobFailureSummary, JobPhase, JobRef } from '../job-lifecycle/contracts';

export type DomainActivityJobKind = 'generation' | 'export';
export type DomainActivityCommand = 'cancel' | 'retry' | 'reconcile';

export interface DomainActivityProgress {
  readonly stage: string;
  readonly percent: number;
}

export interface DomainActivityItemBase<K extends DomainActivityJobKind> {
  readonly jobKind: K;
  readonly jobId: string;
  readonly phase: JobPhase;
  readonly jobRevision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly label: string;
  readonly progress: DomainActivityProgress;
  readonly supportedCommands: readonly DomainActivityCommand[];
  readonly retryOf?: JobRef<K>;
  readonly resultRefs?: readonly ResourceRef[];
  readonly failure?: JobFailureSummary;
}

export interface GenerationDomainActivityItem extends DomainActivityItemBase<'generation'> {
  readonly mediaKind: 'image' | 'video' | 'audio';
}

export interface ExportDomainActivityItem extends DomainActivityItemBase<'export'> {
  readonly format: string;
}

export type DomainActivityItem = GenerationDomainActivityItem | ExportDomainActivityItem;

export interface DomainActivitySnapshot {
  readonly projectionVersion: number;
  readonly items: readonly DomainActivityItem[];
}

export interface DomainActivityPatch {
  readonly baseProjectionVersion: number;
  readonly projectionVersion: number;
  readonly upserts: readonly DomainActivityItem[];
  readonly removed: readonly JobRef<DomainActivityJobKind>[];
}

export interface DomainActivitySource {
  getSnapshot(): DomainActivitySnapshot;
  observe(afterProjectionVersion: number): AsyncIterable<DomainActivityPatch>;
}

export interface DomainActivityPublisher {
  publish(item: DomainActivityItem): void;
  remove(ref: JobRef<DomainActivityJobKind>): void;
}

export interface DomainActivityCommandInput {
  readonly jobKind: DomainActivityJobKind;
  readonly jobId: string;
  readonly expectedRevision: number;
  readonly command: DomainActivityCommand;
}

export interface DomainActivityCommandExecutor {
  execute(input: DomainActivityCommandInput): Promise<DomainActivityItem>;
}

export interface DomainActivityHost extends DomainActivityCommandExecutor {
  readonly source: DomainActivitySource;
  readonly publisher: DomainActivityPublisher;
  installExportCommandExecutor(executor: DomainActivityCommandExecutor): {
    dispose(): void;
  };
}
