import type {
  DomainActivityCommand,
  GenerationDomainActivityItem,
} from '@neko/shared/domain-activity';
import type { GenerationJobSnapshot } from './contracts';

export function projectGenerationJobActivity(
  snapshot: GenerationJobSnapshot,
): GenerationDomainActivityItem {
  if (snapshot.lifecycleMode !== 'detached') {
    throw new Error(
      `Linked Generation Job ${snapshot.ref.jobId} belongs only to its caller projection.`,
    );
  }
  return Object.freeze({
    jobKind: 'generation',
    jobId: snapshot.ref.jobId,
    phase: snapshot.phase,
    jobRevision: snapshot.revision,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    label: `${generationMediaKind(snapshot)} generation`,
    mediaKind: generationMediaKind(snapshot),
    progress: Object.freeze({ ...snapshot.progress }),
    supportedCommands: supportedGenerationCommands(snapshot),
    ...(snapshot.retryOf ? { retryOf: snapshot.retryOf } : {}),
    ...(snapshot.resultRefs ? { resultRefs: snapshot.resultRefs } : {}),
    ...(snapshot.failure ? { failure: snapshot.failure } : {}),
  });
}

function generationMediaKind(
  snapshot: GenerationJobSnapshot,
): GenerationDomainActivityItem['mediaKind'] {
  const type = snapshot.request.generationType;
  if (type.includes('video')) return 'video';
  if (type.includes('audio') || type.includes('music')) return 'audio';
  return 'image';
}

function supportedGenerationCommands(
  snapshot: GenerationJobSnapshot,
): readonly DomainActivityCommand[] {
  if (snapshot.phase === 'failed' || snapshot.phase === 'cancelled') return ['retry'];
  if (snapshot.phase === 'outcome-unknown') {
    return snapshot.providerTask ? ['reconcile', 'retry'] : ['retry'];
  }
  if (snapshot.phase === 'pending') return [];
  if (snapshot.phase === 'running') {
    return snapshot.providerTask ? ['cancel', 'reconcile'] : [];
  }
  return [];
}
