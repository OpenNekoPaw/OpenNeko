import {
  isCreativeEntityRef,
  type CreativeEntityChangedRef,
  type CreativeEntityRef,
} from '@neko/shared';

export interface CanvasEntityBackfillDiagnostic {
  readonly code: 'duplicate-candidate-ref' | 'invalid-candidate-ref' | 'no-matching-shot-character';
  readonly message: string;
  readonly candidateId?: string;
}

export interface CanvasEntityBackfillResult {
  readonly data: Record<string, unknown>;
  readonly updated: boolean;
  readonly matchedCount: number;
  readonly diagnostics: readonly CanvasEntityBackfillDiagnostic[];
}

export interface CanvasEntityPendingBackfill {
  readonly changedRefs: readonly CreativeEntityChangedRef[];
  readonly diagnostics: readonly CanvasEntityBackfillDiagnostic[];
}

export interface CanvasEntityPendingBackfillMergeResult {
  readonly pending: readonly CanvasEntityPendingBackfill[];
  readonly queued: boolean;
}

export function applyCandidateEntityBackfill(
  canvasData: Record<string, unknown>,
  changedRefs: readonly CreativeEntityChangedRef[],
): CanvasEntityBackfillResult {
  const diagnostics: CanvasEntityBackfillDiagnostic[] = [];
  const refByCandidateId = collectConfirmedCandidateRefs(changedRefs, diagnostics);
  if (refByCandidateId.size === 0) {
    return { data: canvasData, updated: false, matchedCount: 0, diagnostics };
  }

  const nodes = Array.isArray(canvasData['nodes']) ? canvasData['nodes'] : [];
  let matchedCount = 0;
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (!isRecord(node) || node['type'] !== 'shot') return node;
    const data = isRecord(node['data']) ? node['data'] : undefined;
    const characters = Array.isArray(data?.['characters']) ? data['characters'] : undefined;
    if (!data || !characters) return node;

    let nodeChanged = false;
    const nextCharacters = characters.map((character) => {
      if (!isRecord(character)) return character;
      const candidateId = readString(character['candidateId']);
      if (!candidateId) return character;
      const entityRef = refByCandidateId.get(candidateId);
      if (!entityRef) return character;
      matchedCount += 1;
      nodeChanged = true;
      const { candidateId: _candidateId, ...rest } = character;
      return {
        ...rest,
        entityRef,
      };
    });

    if (!nodeChanged) return node;
    changed = true;
    return {
      ...node,
      data: {
        ...data,
        characters: nextCharacters,
      },
    };
  });

  for (const candidateId of refByCandidateId.keys()) {
    if (!hasCandidateMatch(nodes, candidateId)) {
      diagnostics.push({
        code: 'no-matching-shot-character',
        candidateId,
        message: `No open shot character stores candidateId ${candidateId}.`,
      });
    }
  }

  return {
    data: changed ? { ...canvasData, nodes: nextNodes } : canvasData,
    updated: changed,
    matchedCount,
    diagnostics,
  };
}

export function mergePendingCandidateEntityBackfill(
  pending: readonly CanvasEntityPendingBackfill[],
  entry: CanvasEntityPendingBackfill,
): CanvasEntityPendingBackfillMergeResult {
  const blockedCandidateIds = new Set(
    entry.diagnostics
      .filter(
        (diagnostic) =>
          diagnostic.code === 'duplicate-candidate-ref' ||
          diagnostic.code === 'invalid-candidate-ref',
      )
      .map((diagnostic) => diagnostic.candidateId)
      .filter((candidateId): candidateId is string => candidateId !== undefined),
  );
  const existingKeys = new Set<string>();
  for (const pendingEntry of pending) {
    for (const changedRef of pendingEntry.changedRefs) {
      const key = createPendingBackfillKey(changedRef);
      if (key) existingKeys.add(key);
    }
  }

  const incomingKeys = new Set<string>();
  let queued = false;
  const changedRefs = entry.changedRefs.filter((changedRef) => {
    if (blockedCandidateIds.has(changedRef.id)) return false;
    const key = createPendingBackfillKey(changedRef);
    if (!key || existingKeys.has(key) || incomingKeys.has(key)) return false;
    incomingKeys.add(key);
    queued = true;
    return true;
  });

  if (changedRefs.length === 0) {
    return { pending: [...pending], queued: false };
  }
  return { pending: [...pending, { changedRefs, diagnostics: entry.diagnostics }], queued };
}

function collectConfirmedCandidateRefs(
  changedRefs: readonly CreativeEntityChangedRef[],
  diagnostics: CanvasEntityBackfillDiagnostic[],
): Map<string, CreativeEntityRef> {
  const refs = new Map<string, CreativeEntityRef>();
  const duplicateIds = new Set<string>();
  for (const changedRef of changedRefs) {
    if (changedRef.kind !== 'candidate') continue;
    if (!changedRef.id || !isCreativeEntityRef(changedRef.entityRef)) {
      diagnostics.push({
        code: 'invalid-candidate-ref',
        candidateId: changedRef.id,
        message: 'Candidate change ref needs an entityRef for Canvas backfill.',
      });
      continue;
    }
    const existing = refs.get(changedRef.id);
    if (existing && !sameEntityRef(existing, changedRef.entityRef)) {
      duplicateIds.add(changedRef.id);
      diagnostics.push({
        code: 'duplicate-candidate-ref',
        candidateId: changedRef.id,
        message: `Candidate ${changedRef.id} resolved to multiple entity refs.`,
      });
      continue;
    }
    refs.set(changedRef.id, changedRef.entityRef);
  }
  for (const candidateId of duplicateIds) {
    refs.delete(candidateId);
  }
  return refs;
}

function hasCandidateMatch(nodes: readonly unknown[], candidateId: string): boolean {
  return nodes.some((node) => {
    if (!isRecord(node) || node['type'] !== 'shot') return false;
    const data = isRecord(node['data']) ? node['data'] : undefined;
    const characters = Array.isArray(data?.['characters']) ? data['characters'] : [];
    return characters.some(
      (character) => isRecord(character) && readString(character['candidateId']) === candidateId,
    );
  });
}

function sameEntityRef(left: CreativeEntityRef, right: CreativeEntityRef): boolean {
  return left.entityId === right.entityId && left.entityKind === right.entityKind;
}

function createPendingBackfillKey(changedRef: CreativeEntityChangedRef): string | undefined {
  if (
    changedRef.kind !== 'candidate' ||
    !changedRef.id ||
    !isCreativeEntityRef(changedRef.entityRef)
  ) {
    return undefined;
  }
  return JSON.stringify([
    changedRef.id,
    changedRef.entityRef.entityKind,
    changedRef.entityRef.entityId,
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
