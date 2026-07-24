import type { DomainActivityCommand, ExportDomainActivityItem } from '@neko/shared/domain-activity';
import type { ExportJobSnapshot } from './contracts';

export function projectExportJobActivity(snapshot: ExportJobSnapshot): ExportDomainActivityItem {
  return Object.freeze({
    jobKind: 'export',
    jobId: snapshot.ref.jobId,
    phase: snapshot.phase,
    jobRevision: snapshot.revision,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    label: `${snapshot.request.config.format.toUpperCase()} export`,
    format: snapshot.request.config.format,
    progress: Object.freeze({
      stage: snapshot.progress.stage,
      percent: snapshot.progress.percent,
    }),
    supportedCommands: supportedExportCommands(snapshot),
    ...(snapshot.retryOf ? { retryOf: snapshot.retryOf } : {}),
    ...(snapshot.failure ? { failure: snapshot.failure } : {}),
  });
}

function supportedExportCommands(snapshot: ExportJobSnapshot): readonly DomainActivityCommand[] {
  if (snapshot.phase === 'failed' || snapshot.phase === 'cancelled') return ['retry'];
  if (snapshot.phase === 'outcome-unknown') {
    return snapshot.engineJobId ? ['reconcile', 'retry'] : ['retry'];
  }
  if (snapshot.phase === 'running') {
    return snapshot.engineJobId ? ['cancel', 'reconcile'] : [];
  }
  return [];
}
