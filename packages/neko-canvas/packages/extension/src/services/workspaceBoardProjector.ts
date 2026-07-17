import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  resolveCanvasWorkspaceBoardDocumentUri,
  validateCanvasWorkspaceProjectionRequest,
  validateCanvasWorkspaceProjectionResult,
  type CanvasWorkspaceProjectionDiagnostic,
  type CanvasWorkspaceProjectionRequest,
  type CanvasWorkspaceProjectionResult,
} from '@neko/shared';
import type {
  CanvasProjectAuthoringService,
  CanvasWorkspaceBoardAuthoringResult,
} from './canvasProjectAuthoringService';

export interface WorkspaceBoardProjectorOptions {
  readonly authoring: Pick<CanvasProjectAuthoringService, 'projectWorkspaceBoard'>;
}

export class WorkspaceBoardProjector {
  constructor(private readonly options: WorkspaceBoardProjectorOptions) {}

  async project(
    request: CanvasWorkspaceProjectionRequest,
  ): Promise<CanvasWorkspaceProjectionResult> {
    const diagnostics = validateCanvasWorkspaceProjectionRequest(request);
    if (diagnostics.length > 0) return blocked(diagnostics);

    const explicit = request.target.documentUri;
    const documentUri =
      explicit ?? resolveCanvasWorkspaceBoardDocumentUri(request.target.workspaceUri);
    try {
      const authored = await this.options.authoring.projectWorkspaceBoard({
        request,
        documentUri,
        createIfMissing: explicit === undefined,
      });
      return validateResult({
        version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
        status: authored.status === 'noop' ? 'noop' : 'projected',
        target: { kind: explicit ? 'explicit' : 'workspace', documentUri: authored.documentUri },
        revision: authored.projectRef.projectRevision,
        nodeIds: authored.nodeIds,
        diagnostics: [],
      });
    } catch (error) {
      return blocked([toProjectionDiagnostic(error)]);
    }
  }
}

function blocked(
  diagnostics: readonly CanvasWorkspaceProjectionDiagnostic[],
): CanvasWorkspaceProjectionResult {
  return validateResult({
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    status: 'blocked',
    diagnostics,
  });
}

function validateResult(result: CanvasWorkspaceProjectionResult): CanvasWorkspaceProjectionResult {
  const diagnostics = validateCanvasWorkspaceProjectionResult(result);
  if (diagnostics.length > 0) {
    throw new Error(diagnostics.map((entry) => entry.message).join('; '));
  }
  return result;
}

function toProjectionDiagnostic(error: unknown): CanvasWorkspaceProjectionDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: /projection-conflict|stale-board-target/iu.test(message)
      ? 'projection-conflict'
      : 'projection-write-failed',
    severity: 'error',
    message,
  };
}

export type { CanvasWorkspaceBoardAuthoringResult };
