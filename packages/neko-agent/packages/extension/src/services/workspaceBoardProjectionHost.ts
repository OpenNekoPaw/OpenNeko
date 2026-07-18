import * as vscode from 'vscode';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  NEKO_EXTENSION_IDS,
  type CanvasWorkspaceDeliveryBatch,
  type CanvasWorkspaceProjectionDiagnostic,
  type CanvasWorkspaceProjectionResult,
  type NekoCanvasAPI,
} from '@neko/shared';

export interface WorkspaceBoardProjectionHostOptions {
  readonly workspaceId?: string;
  readonly getCanvasApi?: () => Promise<Pick<NekoCanvasAPI, 'boards'> | undefined>;
  readonly getWorkspaceUris?: () => readonly string[];
}

export class WorkspaceBoardProjectionHost {
  constructor(private readonly options: WorkspaceBoardProjectionHostOptions = {}) {}

  async deliverBatch(
    batch: CanvasWorkspaceDeliveryBatch,
  ): Promise<readonly CanvasWorkspaceProjectionResult[]> {
    if (batch.artifacts.length === 0) return [];
    const workspaceUris = this.options.getWorkspaceUris?.() ?? readWorkspaceUris();
    if (workspaceUris.length !== 1 || !this.options.workspaceId) {
      return [blocked('workspace-required', 'Canvas delivery requires one resolved workspace.')];
    }
    const canvasApi = await (this.options.getCanvasApi?.() ?? getCanvasApi());
    if (!canvasApi?.boards?.project) {
      return [
        blocked(
          'projection-write-failed',
          'Canvas delivery is unavailable; generated output remains durable in the workspace.',
        ),
      ];
    }

    try {
      const result = await canvasApi.boards.project({
        version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
        target: {
          workspaceId: this.options.workspaceId,
          workspaceUri: workspaceUris[0]!,
        },
        process: batch.process,
        artifacts: batch.artifacts,
      });
      return [result];
    } catch (error) {
      return [
        blocked('projection-write-failed', error instanceof Error ? error.message : String(error)),
      ];
    }
  }
}

async function getCanvasApi(): Promise<Pick<NekoCanvasAPI, 'boards'> | undefined> {
  const extension = vscode.extensions.getExtension<NekoCanvasAPI>(NEKO_EXTENSION_IDS.NEKO_CANVAS);
  if (!extension) return undefined;
  if (!extension.isActive) await extension.activate();
  return extension.exports;
}

function readWorkspaceUris(): readonly string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.toString());
}

function blocked(
  code: CanvasWorkspaceProjectionDiagnostic['code'],
  message: string,
): CanvasWorkspaceProjectionResult {
  return {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    status: 'blocked',
    diagnostics: [{ code, severity: 'error', message }],
  };
}
