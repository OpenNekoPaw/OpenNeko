import { isWebviewLikeRuntimeValue } from './content-access';
import type { ResourceRef } from './resource-cache';

export const CANVAS_CREATIVE_SCOPE_KINDS = [
  'episode',
  'sequence',
  'scene',
  'shot-cluster',
  'interactive-narrative',
  'generic',
] as const;

export const CANVAS_RELATED_BOARD_ROLES = [
  'parent',
  'child',
  'sibling',
  'source',
  'derived',
  'sequence',
  'scene',
  'shot-cluster',
  'interactive-narrative',
] as const;

export type CanvasCreativeScopeKind = (typeof CANVAS_CREATIVE_SCOPE_KINDS)[number];
export type CanvasRelatedBoardRole = (typeof CANVAS_RELATED_BOARD_ROLES)[number];

export type CanvasBoardRef =
  | {
      readonly kind: 'workspace-path';
      readonly path: string;
    }
  | {
      readonly kind: 'resource';
      readonly resourceRef: ResourceRef;
    }
  | {
      readonly kind: 'project';
      readonly projectId: string;
      readonly canvasId?: string;
    }
  | {
      readonly kind: 'uri';
      readonly uri: string;
    };

export interface CanvasCreativeScope {
  readonly kind: CanvasCreativeScopeKind;
  readonly workId?: string;
  readonly title?: string;
  readonly projectId?: string;
  readonly seriesId?: string;
  readonly seasonId?: string;
  readonly episodeId?: string;
  readonly episodeNumber?: number;
  readonly sequenceId?: string;
  readonly sequenceNumber?: number;
  readonly sceneIds?: readonly string[];
  readonly shotIds?: readonly string[];
  readonly narrativeGraphId?: string;
  readonly sourceStoryboardRef?: string;
  readonly description?: string;
}

export interface CanvasRelatedBoardRef {
  readonly boardId?: string;
  readonly role: CanvasRelatedBoardRole;
  readonly ref: CanvasBoardRef;
  readonly scope?: Pick<
    CanvasCreativeScope,
    'kind' | 'workId' | 'title' | 'episodeId' | 'sequenceId' | 'sceneIds' | 'shotIds'
  >;
  readonly label?: string;
}

export interface CanvasBoardSummary {
  readonly canvasId?: string;
  readonly name: string;
  readonly scope?: CanvasCreativeScope;
  readonly relatedBoards?: readonly CanvasRelatedBoardRef[];
  readonly nodeTypeSummary?: Readonly<Record<string, number>>;
  readonly updatedAt?: string;
}

export interface CanvasBoardIndexEntry {
  readonly canvasId?: string;
  readonly name: string;
  readonly scopeKind: CanvasCreativeScopeKind | 'unknown';
  readonly workId?: string;
  readonly title?: string;
  readonly episodeId?: string;
  readonly sequenceId?: string;
  readonly sceneIds?: readonly string[];
  readonly shotIds?: readonly string[];
  readonly relatedBoardCount: number;
  readonly nodeTypeSummary?: Readonly<Record<string, number>>;
  readonly updatedAt?: string;
}

export type CanvasBoardNavigationDiagnosticCode =
  | 'missing-board'
  | 'unsafe-board-ref'
  | 'unresolved-board-ref';

export interface CanvasBoardNavigationDiagnostic {
  readonly code: CanvasBoardNavigationDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly boardId?: string;
  readonly role?: CanvasRelatedBoardRole;
}

export function validateCanvasBoardRef(
  ref: CanvasBoardRef,
): readonly CanvasBoardNavigationDiagnostic[] {
  switch (ref.kind) {
    case 'workspace-path':
      return isUnsafeBoardString(ref.path)
        ? [
            {
              code: 'unsafe-board-ref',
              severity: 'error',
              message: 'Canvas board references must use workspace-relative durable paths.',
            },
          ]
        : [];
    case 'uri':
      return isUnsafeBoardString(ref.uri)
        ? [
            {
              code: 'unsafe-board-ref',
              severity: 'error',
              message: 'Canvas board references must not persist runtime or local-only URIs.',
            },
          ]
        : [];
    case 'resource':
    case 'project':
      return [];
  }
}

export function summarizeCanvasBoard(input: {
  readonly canvasId?: string;
  readonly name: string;
  readonly scope?: CanvasCreativeScope;
  readonly relatedBoards?: readonly CanvasRelatedBoardRef[];
  readonly nodeTypeSummary?: Readonly<Record<string, number>>;
  readonly updatedAt?: string;
}): CanvasBoardSummary {
  return {
    ...(input.canvasId ? { canvasId: input.canvasId } : {}),
    name: input.name,
    ...(input.scope ? { scope: input.scope } : {}),
    ...(input.relatedBoards ? { relatedBoards: input.relatedBoards } : {}),
    ...(input.nodeTypeSummary ? { nodeTypeSummary: input.nodeTypeSummary } : {}),
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  };
}

export function projectCanvasBoardSummaryForIndex(
  summary: CanvasBoardSummary,
): CanvasBoardIndexEntry {
  const scope = summary.scope;
  return {
    ...(summary.canvasId ? { canvasId: summary.canvasId } : {}),
    name: summary.name,
    scopeKind: scope?.kind ?? 'unknown',
    ...(scope?.workId ? { workId: scope.workId } : {}),
    ...(scope?.title ? { title: scope.title } : {}),
    ...(scope?.episodeId ? { episodeId: scope.episodeId } : {}),
    ...(scope?.sequenceId ? { sequenceId: scope.sequenceId } : {}),
    ...(scope?.sceneIds ? { sceneIds: scope.sceneIds } : {}),
    ...(scope?.shotIds ? { shotIds: scope.shotIds } : {}),
    relatedBoardCount: summary.relatedBoards?.length ?? 0,
    ...(summary.nodeTypeSummary ? { nodeTypeSummary: summary.nodeTypeSummary } : {}),
    ...(summary.updatedAt ? { updatedAt: summary.updatedAt } : {}),
  };
}

function isUnsafeBoardString(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length === 0 ||
    isWebviewLikeRuntimeValue(trimmed) ||
    /^vscode-webview:\/\//i.test(trimmed) ||
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(trimmed) ||
    /^file:\/\//i.test(trimmed) ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith('/')
  );
}
