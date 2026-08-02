import type { MarkdownDiagnostic } from './diagnostics';
import type { NormalizedMarkdownDocument } from './document';
import type {
  MarkdownAnnotationId,
  MarkdownNodeId,
  MarkdownRevision,
  MarkdownSessionId,
} from './identity';
import { MarkdownContractError } from './source-range';

export interface MarkdownStableRef {
  readonly kind: string;
  readonly id: string;
  readonly namespace?: string;
}

export type MarkdownReferenceStatus = 'unresolved' | 'ambiguous' | 'resolved' | 'unauthorized';

interface MarkdownResolutionBase {
  readonly status: MarkdownReferenceStatus;
  readonly ref?: MarkdownStableRef;
  readonly candidates: readonly MarkdownStableRef[];
}

export interface MarkdownNodeResolution extends MarkdownResolutionBase {
  readonly kind: 'node';
  readonly nodeId: MarkdownNodeId;
  readonly renderUri?: string;
  readonly authorized?: boolean;
}

export interface MarkdownAnnotationResolution extends MarkdownResolutionBase {
  readonly kind: 'annotation';
  readonly annotationId: MarkdownAnnotationId;
}

export type MarkdownResolution = MarkdownNodeResolution | MarkdownAnnotationResolution;

export interface MarkdownHandoffReference {
  readonly source: 'markdown';
  readonly ref: MarkdownStableRef;
  readonly token: string;
  readonly placementHint?: string;
}

export interface MarkdownResolutionSnapshot {
  readonly sessionId: MarkdownSessionId;
  readonly revision: MarkdownRevision;
  readonly resolutions: readonly MarkdownResolution[];
  readonly handoffRefs: readonly MarkdownHandoffReference[];
  readonly diagnostics: readonly MarkdownDiagnostic[];
}

export function assertMarkdownResolutionAssociation(
  snapshot: MarkdownResolutionSnapshot,
  sessionId: MarkdownSessionId,
  revision: MarkdownRevision,
): void {
  if (snapshot.sessionId !== sessionId || snapshot.revision !== revision) {
    throw new MarkdownContractError(
      `Markdown resolution snapshot ${snapshot.sessionId}@${snapshot.revision} cannot be associated ` +
        `with ${sessionId}@${revision}.`,
    );
  }
}

export function validateMarkdownResolutionSnapshot(
  document: NormalizedMarkdownDocument,
  snapshot: MarkdownResolutionSnapshot,
): void {
  assertMarkdownResolutionAssociation(snapshot, document.sessionId, document.revision);
  const nodeIds = collectNodeIds(document.root);
  const annotationIds = new Set(document.annotations.map((annotation) => annotation.id));
  const resolvedTargets = new Set<string>();

  for (const resolution of snapshot.resolutions) {
    const target =
      resolution.kind === 'node'
        ? `node:${resolution.nodeId}`
        : `annotation:${resolution.annotationId}`;
    if (resolvedTargets.has(target)) {
      throw new MarkdownContractError(`Duplicate Markdown resolution target: ${target}`);
    }
    resolvedTargets.add(target);
    if (resolution.kind === 'node' && !nodeIds.has(resolution.nodeId)) {
      throw new MarkdownContractError(
        `Markdown resolution targets unknown node ${resolution.nodeId}.`,
      );
    }
    if (resolution.kind === 'annotation' && !annotationIds.has(resolution.annotationId)) {
      throw new MarkdownContractError(
        `Markdown resolution targets unknown annotation ${resolution.annotationId}.`,
      );
    }
    validateResolutionState(resolution);
  }
}

function validateResolutionState(resolution: MarkdownResolution): void {
  if (resolution.status === 'resolved' && !resolution.ref) {
    throw new MarkdownContractError(
      'Resolved Markdown resolution must include a stable reference.',
    );
  }
  if (resolution.status === 'ambiguous' && resolution.candidates.length < 2) {
    throw new MarkdownContractError(
      'Ambiguous Markdown resolution must include at least two candidates.',
    );
  }
  if (
    resolution.status === 'unauthorized' &&
    resolution.kind === 'node' &&
    resolution.authorized === true
  ) {
    throw new MarkdownContractError(
      'Unauthorized Markdown node resolution cannot be marked authorized.',
    );
  }
}

function collectNodeIds(root: import('./nodes').MarkdownNode): ReadonlySet<string> {
  const nodeIds = new Set<string>();
  visit(root);
  return nodeIds;

  function visit(node: import('./nodes').MarkdownNode): void {
    nodeIds.add(node.id);
    if ('children' in node) {
      for (const child of node.children) visit(child);
    }
  }
}

export interface MarkdownResolutionProjection {
  readonly resolutions: readonly MarkdownResolution[];
  readonly handoffRefs: readonly MarkdownHandoffReference[];
  readonly diagnostics: readonly MarkdownDiagnostic[];
}

export interface MarkdownResolutionResolver<TContext> {
  resolve(
    document: NormalizedMarkdownDocument,
    context: TContext,
    signal: AbortSignal,
  ): Promise<MarkdownResolutionProjection>;
}

export interface ResolveMarkdownSnapshotOptions<TContext> {
  readonly document: NormalizedMarkdownDocument;
  readonly context: TContext;
  readonly resolver: MarkdownResolutionResolver<TContext>;
  readonly signal?: AbortSignal;
  readonly isCurrent?: (sessionId: MarkdownSessionId, revision: MarkdownRevision) => boolean;
}

export type MarkdownResolutionRunResult =
  | { readonly status: 'ready'; readonly snapshot: MarkdownResolutionSnapshot }
  | { readonly status: 'discarded'; readonly reason: 'cancelled' | 'stale' };

export async function resolveMarkdownSnapshot<TContext>(
  options: ResolveMarkdownSnapshotOptions<TContext>,
): Promise<MarkdownResolutionRunResult> {
  const controller = options.signal ? undefined : new AbortController();
  const signal = options.signal ?? controller?.signal;
  if (!signal) throw new MarkdownContractError('Markdown resolution requires an abort signal.');
  if (signal.aborted) return { status: 'discarded', reason: 'cancelled' };

  const projection = await options.resolver.resolve(options.document, options.context, signal);
  if (signal.aborted) return { status: 'discarded', reason: 'cancelled' };
  if (
    options.isCurrent &&
    !options.isCurrent(options.document.sessionId, options.document.revision)
  ) {
    return { status: 'discarded', reason: 'stale' };
  }

  const snapshot: MarkdownResolutionSnapshot = Object.freeze({
    sessionId: options.document.sessionId,
    revision: options.document.revision,
    resolutions: Object.freeze([...projection.resolutions]),
    handoffRefs: Object.freeze([...projection.handoffRefs]),
    diagnostics: Object.freeze([...projection.diagnostics]),
  });
  validateMarkdownResolutionSnapshot(options.document, snapshot);
  return { status: 'ready', snapshot };
}
