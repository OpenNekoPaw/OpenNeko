import type * as vscode from 'vscode';
import {
  ENTITY_FACADE_COMMANDS,
  isCreativeEntityRef,
  isEntityFacadeCommandError,
  isEntityRepresentationBinding,
  type CreativeEntity,
  type CreativeEntityCandidate,
  type CreativeEntityRef,
  type EntityFacadeEntityDetailResult,
  type EntityRepresentationBindingAvailability,
  type EntityRepresentationRole,
  type EntityRepresentationTarget,
} from '@neko/shared';

export type CanvasEntityRouteType = 'entity.summary' | 'entity.confirmCandidate' | 'entity.inspect';

export interface CanvasEntityRouteMessage {
  readonly type: CanvasEntityRouteType;
  readonly _requestId?: number;
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly characterName?: string;
}

export interface CanvasEntitySummary {
  readonly status: 'confirmed' | 'candidate' | 'unlinked';
  readonly displayName: string;
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly kind?: CreativeEntityRef['entityKind'];
  readonly aliases?: readonly string[];
  readonly metadata?: {
    readonly appearanceSummary?: string;
    readonly visualSummary?: string;
    readonly appearanceNotes?: string;
  };
  readonly candidateCount?: number;
  readonly defaultRepresentation?: {
    readonly role: EntityRepresentationRole;
    readonly representation: EntityRepresentationTarget;
    readonly availability: EntityRepresentationBindingAvailability;
    readonly orphanedAt?: string;
  };
}

export interface CanvasEntityRouteResult {
  readonly ok: boolean;
  readonly summary?: CanvasEntitySummary;
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly message?: string;
  readonly diagnostics?: readonly string[];
}

export interface CanvasEntityRouteContext {
  readonly projectRoot?: string;
  readonly contextUri?: string;
  readonly surfaceNodeId?: string;
}

export interface CanvasEntityRouteDeps {
  readonly executeCommand: typeof vscode.commands.executeCommand;
  readonly translate?: CanvasEntityRouteTranslate;
}

export type CanvasEntityRouteTranslate = (message: string, ...args: readonly unknown[]) => string;

export function isCanvasEntityRouteMessage(value: unknown): value is CanvasEntityRouteMessage {
  if (!isRecord(value)) return false;
  if (
    value['type'] !== 'entity.summary' &&
    value['type'] !== 'entity.confirmCandidate' &&
    value['type'] !== 'entity.inspect'
  ) {
    return false;
  }
  return (
    (value['_requestId'] === undefined || typeof value['_requestId'] === 'number') &&
    (value['entityRef'] === undefined || isCreativeEntityRef(value['entityRef'])) &&
    (value['candidateId'] === undefined || isNonEmptyString(value['candidateId'])) &&
    (value['characterName'] === undefined || typeof value['characterName'] === 'string')
  );
}

export async function handleCanvasEntityRoute(
  message: CanvasEntityRouteMessage,
  context: CanvasEntityRouteContext,
  deps: CanvasEntityRouteDeps,
): Promise<CanvasEntityRouteResult> {
  try {
    switch (message.type) {
      case 'entity.summary':
        return await handleSummary(message, context, deps);
      case 'entity.confirmCandidate':
        return await handleConfirmCandidate(message, context, deps);
      case 'entity.inspect':
        return await handleInspect(message, context, deps);
    }
  } catch (error) {
    return routeFailure(error);
  }
}

async function handleSummary(
  message: CanvasEntityRouteMessage,
  context: CanvasEntityRouteContext,
  deps: CanvasEntityRouteDeps,
): Promise<CanvasEntityRouteResult> {
  if (message.entityRef) {
    const detail = await deps.executeCommand<EntityFacadeEntityDetailResult | unknown>(
      ENTITY_FACADE_COMMANDS.getEntityDetail,
      {
        ...context,
        entityRef: message.entityRef,
      },
    );
    if (isEntityFacadeCommandError(detail)) return commandErrorResult(detail);
    return {
      ok: true,
      summary: summarizeEntityDetail(message.entityRef, detail),
    };
  }

  if (message.candidateId) {
    const candidates = await deps.executeCommand<readonly CreativeEntityCandidate[] | unknown>(
      ENTITY_FACADE_COMMANDS.listCandidates,
      context,
    );
    if (isEntityFacadeCommandError(candidates)) return commandErrorResult(candidates);
    const candidate = Array.isArray(candidates)
      ? candidates.find((entry) => entry.id === message.candidateId)
      : undefined;
    return {
      ok: true,
      summary: candidate
        ? summarizeCandidate(candidate)
        : {
            status: 'candidate',
            candidateId: message.candidateId,
            displayName: message.characterName ?? message.candidateId,
          },
    };
  }

  return {
    ok: true,
    summary: {
      status: 'unlinked',
      displayName: message.characterName ?? 'Unlinked character',
    },
  };
}

async function handleConfirmCandidate(
  message: CanvasEntityRouteMessage,
  context: CanvasEntityRouteContext,
  deps: CanvasEntityRouteDeps,
): Promise<CanvasEntityRouteResult> {
  if (!message.candidateId) {
    return { ok: false, message: translateRoute(deps, 'candidateId is required.') };
  }
  const result = await deps.executeCommand<unknown>(ENTITY_FACADE_COMMANDS.confirmCandidate, {
    ...context,
    candidateId: message.candidateId,
  });
  if (isEntityFacadeCommandError(result)) return commandErrorResult(result);
  const entityRef = readConfirmedEntityRef(result);
  return {
    ok: true,
    candidateId: message.candidateId,
    ...(entityRef ? { entityRef } : {}),
  };
}

function translateRoute(
  deps: Pick<CanvasEntityRouteDeps, 'translate'>,
  message: string,
  ...args: readonly unknown[]
): string {
  return deps.translate?.(message, ...args) ?? message;
}

async function handleInspect(
  message: CanvasEntityRouteMessage,
  context: CanvasEntityRouteContext,
  deps: CanvasEntityRouteDeps,
): Promise<CanvasEntityRouteResult> {
  const { surfaceNodeId, ...projectContext } = context;
  const result = await deps.executeCommand<unknown>(ENTITY_FACADE_COMMANDS.inspectEntity, {
    ...projectContext,
    context: {
      ...projectContext,
      surface: 'canvas',
      ...(surfaceNodeId ? { nodeId: surfaceNodeId } : {}),
    },
    ...(message.entityRef ? { entityRef: message.entityRef } : {}),
    ...(message.candidateId ? { candidateId: message.candidateId } : {}),
  });
  if (isEntityFacadeCommandError(result)) return commandErrorResult(result);
  return { ok: true };
}

function summarizeEntityDetail(entityRef: CreativeEntityRef, detail: unknown): CanvasEntitySummary {
  const record = isRecord(detail) ? detail : {};
  const entity = isCreativeEntity(record['entity']) ? record['entity'] : undefined;
  const candidates = Array.isArray(record['candidates']) ? record['candidates'] : [];
  const bindings = Array.isArray(record['bindings']) ? record['bindings'] : [];
  const defaultRepresentation = summarizeDefaultRepresentation(bindings);
  return {
    status: 'confirmed',
    entityRef,
    kind: entityRef.entityKind,
    displayName: entity?.displayName ?? entity?.canonicalName ?? entityRef.entityId,
    ...(entity?.aliases ? { aliases: entity.aliases.slice(0, 5) } : {}),
    ...shortMetadata(entity),
    candidateCount: candidates.length,
    ...(defaultRepresentation ? { defaultRepresentation } : {}),
  };
}

function summarizeCandidate(candidate: CreativeEntityCandidate): CanvasEntitySummary {
  return {
    status: 'candidate',
    candidateId: candidate.id,
    kind: candidate.kind,
    displayName: candidate.name,
    ...(candidate.aliases ? { aliases: candidate.aliases.slice(0, 5) } : {}),
    ...shortMetadata(candidate),
  };
}

function shortMetadata(source: { readonly metadata?: Record<string, unknown> } | undefined): {
  readonly metadata?: CanvasEntitySummary['metadata'];
} {
  const metadata = source?.metadata;
  if (!metadata) return {};
  const summary = {
    appearanceSummary: readString(metadata['appearanceSummary']),
    visualSummary: readString(metadata['visualSummary']),
    appearanceNotes: readString(metadata['appearanceNotes']),
  };
  const compact = Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== undefined),
  ) as NonNullable<CanvasEntitySummary['metadata']>;
  return Object.keys(compact).length > 0 ? { metadata: compact } : {};
}

function summarizeDefaultRepresentation(
  bindings: readonly unknown[],
): CanvasEntitySummary['defaultRepresentation'] | undefined {
  const validBindings = bindings.filter(isEntityRepresentationBinding);
  const binding =
    validBindings.find((candidate) => candidate.isDefault === true) ??
    validBindings.find(
      (candidate) => candidate.status === 'confirmed' && candidate.availability === 'orphaned',
    );
  if (!binding) return undefined;
  return {
    role: binding.role,
    representation: binding.representation,
    availability: binding.availability,
    ...(binding.orphanedAt ? { orphanedAt: binding.orphanedAt } : {}),
  };
}

function commandErrorResult(error: {
  readonly message: string;
  readonly diagnostics?: readonly string[];
}): CanvasEntityRouteResult {
  return { ok: false, message: error.message, diagnostics: error.diagnostics };
}

function routeFailure(error: unknown): CanvasEntityRouteResult {
  return { ok: false, message: error instanceof Error ? error.message : String(error) };
}

function readConfirmedEntityRef(value: unknown): CreativeEntityRef | undefined {
  const record = isRecord(value) ? value : {};
  const changedRefs = Array.isArray(record['changedRefs']) ? record['changedRefs'] : [];
  for (const changedRef of changedRefs) {
    if (!isRecord(changedRef)) continue;
    const entityRef = changedRef['entityRef'];
    if (isCreativeEntityRef(entityRef)) return entityRef;
  }
  return undefined;
}

function isCreativeEntity(value: unknown): value is CreativeEntity {
  return (
    isRecord(value) &&
    isNonEmptyString(value['id']) &&
    isNonEmptyString(value['kind']) &&
    isNonEmptyString(value['canonicalName']) &&
    Array.isArray(value['aliases'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
