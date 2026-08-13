import {
  CUT_DRAFT_DOCUMENT_ID_PREFIX,
  createCutHostSessionId,
  type CutHostRuntimeIdentity,
} from './host-runtime-contract';

export interface CutDraftOwner {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly windowId: string;
  readonly parentViewId: string;
  readonly viewInstanceId: string;
  readonly rendererSessionId: string;
  readonly workbenchInstanceId: string;
}

export interface CutDraftPlan {
  readonly workbenchInstanceId: string;
  readonly label: string;
  readonly identity: CutHostRuntimeIdentity;
}

export interface CutDraftTransactionPorts<TProjection> {
  createSession(plan: CutDraftPlan): void;
  openPresentation(plan: CutDraftPlan): Promise<TProjection>;
  discardSession(identity: CutHostRuntimeIdentity): void;
}

export interface CutCanvasSourceIdentity {
  readonly projectId: string;
  readonly workspaceId: string;
  readonly windowId: string;
  readonly viewId: string;
  readonly viewInstanceId: string;
  readonly rendererSessionId: string;
}

export interface CutCanvasActiveViewCandidate {
  readonly kind: 'cut';
  readonly projectId: string;
  readonly workspaceId: string;
  readonly viewId: string;
  readonly viewInstanceId: string;
  readonly documentId?: string;
  readonly ownerId: string;
}

export type CutCanvasHandoffTarget =
  | {
      readonly kind: 'existing-cut';
      readonly workbenchInstanceId: string;
      readonly viewId: string;
      readonly viewInstanceId: string;
      readonly documentId: string;
      readonly sessionId: string;
    }
  | {
      readonly kind: 'new-cut-draft';
      readonly workbenchInstanceId: string;
    };

export class CutDraftApplicationService {
  constructor(private readonly createIdentity: () => string) {}

  async createDraft<TProjection>(
    input: {
      readonly owner: CutDraftOwner;
      readonly existingLabels: readonly string[];
      readonly baseLabel?: string;
    },
    ports: CutDraftTransactionPorts<TProjection>,
  ): Promise<TProjection> {
    const plan = this.planDraft(input);
    ports.createSession(plan);
    try {
      return await ports.openPresentation(plan);
    } catch (error) {
      ports.discardSession(plan.identity);
      throw error;
    }
  }

  planDraft(input: {
    readonly owner: CutDraftOwner;
    readonly existingLabels: readonly string[];
    readonly baseLabel?: string;
  }): CutDraftPlan {
    const owner = parseCutDraftOwner(input.owner);
    const draftId = requireIdentity(this.createIdentity(), 'Cut draft identity is required.');
    const label = nextDraftLabel(input.baseLabel ?? 'Untitled Cut', input.existingLabels);
    const viewId = `cut:${owner.parentViewId}:${draftId}`;
    const identity: CutHostRuntimeIdentity = {
      projectId: owner.projectId,
      workspaceId: owner.workspaceId,
      windowId: owner.windowId,
      viewId,
      viewInstanceId: owner.viewInstanceId,
      documentId: `${CUT_DRAFT_DOCUMENT_ID_PREFIX}${draftId}`,
      sessionId: createCutHostSessionId(viewId, owner.viewInstanceId),
      rendererSessionId: owner.rendererSessionId,
    };
    return { workbenchInstanceId: owner.workbenchInstanceId, label, identity };
  }
}

export function resolveCutCanvasHandoffTarget(input: {
  readonly source: CutCanvasSourceIdentity;
  readonly workbenchInstanceId: string;
  readonly activeCut?: CutCanvasActiveViewCandidate;
}): CutCanvasHandoffTarget {
  const workbenchInstanceId = requireIdentity(
    input.workbenchInstanceId,
    'Cut Canvas handoff Workbench identity is required.',
  );
  const source = parseCutCanvasSourceIdentity(input.source);
  const activeCut = input.activeCut;
  if (!activeCut) return { kind: 'new-cut-draft', workbenchInstanceId };
  if (
    activeCut.kind !== 'cut' ||
    activeCut.projectId !== source.projectId ||
    activeCut.workspaceId !== source.workspaceId ||
    activeCut.viewInstanceId !== source.viewInstanceId ||
    !activeCut.documentId
  ) {
    throw new Error('Cut Canvas handoff target is outside the exact Workspace View.');
  }
  const sessionId = createCutHostSessionId(activeCut.viewId, activeCut.viewInstanceId);
  if (activeCut.ownerId !== sessionId) {
    throw new Error('Cut Canvas handoff target session identity is invalid.');
  }
  return {
    kind: 'existing-cut',
    workbenchInstanceId,
    viewId: activeCut.viewId,
    viewInstanceId: activeCut.viewInstanceId,
    documentId: activeCut.documentId,
    sessionId,
  };
}

export function createCutCanvasHandoffPayload(
  target: CutCanvasHandoffTarget,
): Readonly<Record<string, unknown>> {
  return { target };
}

export function parseCutCanvasHandoffPayload(
  value: Readonly<Record<string, unknown>>,
): CutCanvasHandoffTarget {
  const payloadKeys = Object.keys(value);
  if (payloadKeys.length !== 1 || payloadKeys[0] !== 'target') {
    throw new Error('Cut Canvas handoff payload is invalid.');
  }
  const target = requireRecord(value['target'], 'Cut Canvas handoff target is required.');
  const kind = target['kind'];
  if (kind === 'new-cut-draft') {
    requireExactKeys(target, ['kind', 'workbenchInstanceId']);
    return {
      kind,
      workbenchInstanceId: requireIdentity(
        target['workbenchInstanceId'],
        'Cut Canvas handoff Workbench identity is required.',
      ),
    };
  }
  if (kind !== 'existing-cut') throw new Error('Cut Canvas handoff target kind is invalid.');
  requireExactKeys(target, [
    'kind',
    'workbenchInstanceId',
    'viewId',
    'viewInstanceId',
    'documentId',
    'sessionId',
  ]);
  return {
    kind,
    workbenchInstanceId: requireIdentity(
      target['workbenchInstanceId'],
      'Cut Canvas handoff Workbench identity is required.',
    ),
    viewId: requireIdentity(target['viewId'], 'Cut Canvas handoff View identity is required.'),
    viewInstanceId: requireIdentity(
      target['viewInstanceId'],
      'Cut Canvas handoff View instance identity is required.',
    ),
    documentId: requireIdentity(
      target['documentId'],
      'Cut Canvas handoff document identity is required.',
    ),
    sessionId: requireIdentity(
      target['sessionId'],
      'Cut Canvas handoff session identity is required.',
    ),
  };
}

export function sameCutCanvasHandoffTarget(
  left: CutCanvasHandoffTarget,
  right: CutCanvasHandoffTarget,
): boolean {
  if (left.kind !== right.kind || left.workbenchInstanceId !== right.workbenchInstanceId) {
    return false;
  }
  if (left.kind === 'new-cut-draft' || right.kind === 'new-cut-draft') return true;
  return (
    left.viewId === right.viewId &&
    left.viewInstanceId === right.viewInstanceId &&
    left.documentId === right.documentId &&
    left.sessionId === right.sessionId
  );
}

function nextDraftLabel(baseLabel: string, existingLabels: readonly string[]): string {
  const canonicalBase = requireIdentity(baseLabel, 'Cut draft base label is required.');
  const existing = new Set(existingLabels);
  let label = canonicalBase;
  for (let suffix = 2; existing.has(label); suffix += 1) {
    label = `${canonicalBase} ${String(suffix)}`;
  }
  return label;
}

function parseCutDraftOwner(owner: CutDraftOwner): CutDraftOwner {
  return {
    projectId: requireIdentity(owner.projectId, 'Cut draft Project identity is required.'),
    workspaceId: requireIdentity(owner.workspaceId, 'Cut draft Workspace identity is required.'),
    windowId: requireIdentity(owner.windowId, 'Cut draft Window identity is required.'),
    parentViewId: requireIdentity(
      owner.parentViewId,
      'Cut draft parent View identity is required.',
    ),
    viewInstanceId: requireIdentity(
      owner.viewInstanceId,
      'Cut draft View instance identity is required.',
    ),
    rendererSessionId: requireIdentity(
      owner.rendererSessionId,
      'Cut draft renderer identity is required.',
    ),
    workbenchInstanceId: requireIdentity(
      owner.workbenchInstanceId,
      'Cut draft Workbench identity is required.',
    ),
  };
}

function parseCutCanvasSourceIdentity(source: CutCanvasSourceIdentity): CutCanvasSourceIdentity {
  return {
    projectId: requireIdentity(source.projectId, 'Cut Canvas source Project identity is required.'),
    workspaceId: requireIdentity(
      source.workspaceId,
      'Cut Canvas source Workspace identity is required.',
    ),
    windowId: requireIdentity(source.windowId, 'Cut Canvas source Window identity is required.'),
    viewId: requireIdentity(source.viewId, 'Cut Canvas source View identity is required.'),
    viewInstanceId: requireIdentity(
      source.viewInstanceId,
      'Cut Canvas source View instance identity is required.',
    ),
    rendererSessionId: requireIdentity(
      source.rendererSessionId,
      'Cut Canvas source renderer identity is required.',
    ),
  };
}

function requireRecord(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireExactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): void {
  const expected = new Set(keys);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !expected.has(key))) {
    throw new Error('Cut Canvas handoff target has unknown or missing fields.');
  }
}

function requireIdentity(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(message);
  return value;
}
