import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  createSafeCanvasWorkspaceProjectionDiagnostic,
  validateCanvasWorkspaceProjectionRequest,
  validateCanvasWorkspaceProjectionResult,
  type CanvasWorkspaceProjectionDiagnostic,
  type CanvasWorkspaceProjectionRequest,
  type CanvasWorkspaceProjectionResult,
} from '@neko/shared';
export interface WorkspaceBoardDeliveryPort {
  enqueue(
    request: CanvasWorkspaceProjectionRequest,
  ): Promise<readonly CanvasWorkspaceProjectionResult[]>;
}

export interface WorkspaceBoardProjectorOptions {
  readonly getCoordinator: (workspaceId: string) => WorkspaceBoardDeliveryPort;
}

export class WorkspaceBoardProjector {
  constructor(private readonly options: WorkspaceBoardProjectorOptions) {}

  async project(
    request: CanvasWorkspaceProjectionRequest,
  ): Promise<CanvasWorkspaceProjectionResult> {
    const diagnostics = validateCanvasWorkspaceProjectionRequest(request);
    if (diagnostics.length > 0) return blocked(diagnostics, request.process?.deliveryId);

    try {
      const results = await this.options
        .getCoordinator(request.target.workspaceId)
        .enqueue(request);
      const result = results.find((entry) => entry.deliveryId === request.process.deliveryId);
      if (!result) {
        return blocked(
          [
            {
              code: 'delivery-claim-conflict',
              severity: 'error',
              message: 'Workspace Board delivery is queued behind another active writer.',
            },
          ],
          request.process.deliveryId,
        );
      }
      return validateResult(result);
    } catch (error) {
      return blocked([toProjectionDiagnostic(error)], request.process.deliveryId);
    }
  }
}

function blocked(
  diagnostics: readonly CanvasWorkspaceProjectionDiagnostic[],
  deliveryId?: string,
): CanvasWorkspaceProjectionResult {
  return validateResult({
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    ...(deliveryId ? { deliveryId } : {}),
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
  const code = /stale-writer/iu.test(message)
    ? 'stale-writer'
    : /stale-revision|stale-board-target/iu.test(message)
      ? 'stale-revision'
      : /projection-conflict/iu.test(message)
        ? 'projection-conflict'
        : /metadata|sqlite|ledger/iu.test(message)
          ? 'delivery-ledger-unavailable'
          : 'projection-write-failed';
  return createSafeCanvasWorkspaceProjectionDiagnostic(code);
}
