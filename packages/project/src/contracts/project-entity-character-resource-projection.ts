import { parseCharacterProductHandoff, type CharacterProductHandoff } from '@neko/chara/contracts';

export interface ProjectEntityCharacterResourceProjection {
  readonly entityId: string;
  readonly characterProjectId: string;
  readonly displayName?: string;
  readonly placement: 'project-local';
  readonly availability: 'available' | 'needs-attention';
  readonly handoffs: readonly CharacterProductHandoff[];
  readonly publishedVersionCount: number;
  readonly interactionStatus: 'select-version' | 'unavailable';
  readonly diagnostic?: string;
}

export function parseProjectEntityCharacterResourceProjection(
  value: unknown,
): ProjectEntityCharacterResourceProjection {
  const record = requireExactRecord(value, [
    'entityId',
    'characterProjectId',
    'displayName',
    'placement',
    'availability',
    'handoffs',
    'publishedVersionCount',
    'interactionStatus',
    'diagnostic',
  ]);
  const availability = record['availability'];
  if (availability !== 'available' && availability !== 'needs-attention') {
    throw new Error('Project Entity Character resource availability is invalid.');
  }
  if (record['placement'] !== 'project-local') {
    throw new Error('Project Entity Character resource placement is invalid.');
  }
  const interactionStatus = record['interactionStatus'];
  if (interactionStatus !== 'select-version' && interactionStatus !== 'unavailable') {
    throw new Error('Project Entity Character resource interaction status is invalid.');
  }
  const publishedVersionCount = record['publishedVersionCount'];
  if (!Number.isSafeInteger(publishedVersionCount) || (publishedVersionCount as number) < 0) {
    throw new Error('Project Entity Character published version count is invalid.');
  }
  if (!Array.isArray(record['handoffs'])) {
    throw new Error('Project Entity Character handoffs must be an array.');
  }
  const result: ProjectEntityCharacterResourceProjection = {
    entityId: requireIdentity(record['entityId'], 'Project Entity'),
    characterProjectId: requireIdentity(record['characterProjectId'], 'CharacterProject'),
    ...(record['displayName'] === undefined
      ? {}
      : { displayName: requireIdentity(record['displayName'], 'Character display name') }),
    placement: 'project-local',
    availability,
    handoffs: record['handoffs'].map(parseCharacterProductHandoff),
    publishedVersionCount: publishedVersionCount as number,
    interactionStatus,
    ...(record['diagnostic'] === undefined
      ? {}
      : { diagnostic: requireIdentity(record['diagnostic'], 'Character diagnostic') }),
  };
  assertProjectionConsistency(result);
  return result;
}

function assertProjectionConsistency(projection: ProjectEntityCharacterResourceProjection): void {
  if (projection.availability === 'needs-attention') {
    if (
      projection.handoffs.length > 0 ||
      projection.publishedVersionCount !== 0 ||
      projection.interactionStatus !== 'unavailable' ||
      projection.diagnostic === undefined
    ) {
      throw new Error('Unavailable Project Entity Character resource exposes usable operations.');
    }
    return;
  }
  if (projection.diagnostic !== undefined || projection.displayName === undefined) {
    throw new Error('Available Project Entity Character resource is incomplete.');
  }
  const handoffKinds = new Set(projection.handoffs.map((handoff) => handoff.kind));
  if (
    projection.handoffs.length !== 2 ||
    handoffKinds.size !== 2 ||
    !handoffKinds.has('open-character') ||
    !handoffKinds.has('open-character-studio') ||
    projection.handoffs.some(
      (handoff) => handoff.characterProjectId !== projection.characterProjectId,
    )
  ) {
    throw new Error('Project Entity Character resource handoffs are invalid.');
  }
  const expectedInteractionStatus =
    projection.publishedVersionCount > 0 ? 'select-version' : 'unavailable';
  if (projection.interactionStatus !== expectedInteractionStatus) {
    throw new Error('Project Entity Character interaction status is inconsistent.');
  }
}

function requireExactRecord(
  value: unknown,
  allowedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Project Entity Character resource projection must be an object.');
  }
  const record = value as Readonly<Record<string, unknown>>;
  const allowed = new Set(allowedKeys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error('Project Entity Character resource projection contains unsupported fields.');
  }
  return record;
}

function requireIdentity(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} identity is required.`);
  }
  return value;
}
