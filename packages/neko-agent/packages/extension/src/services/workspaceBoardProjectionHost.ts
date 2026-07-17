import * as vscode from 'vscode';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  createGeneratedAssetWorkspaceProjectionRequest,
  NEKO_EXTENSION_IDS,
  type CanvasWorkspaceProjectionDiagnostic,
  type CanvasWorkspaceProjectionResult,
  type GeneratedAsset,
  type NekoCanvasAPI,
} from '@neko/shared';

export interface WorkspaceBoardProjectionHostOptions {
  readonly getCanvasApi?: () => Promise<Pick<NekoCanvasAPI, 'boards'> | undefined>;
  readonly getWorkspaceUris?: () => readonly string[];
}

export class WorkspaceBoardProjectionHost {
  constructor(private readonly options: WorkspaceBoardProjectionHostOptions = {}) {}

  async projectGeneratedAssets(
    assets: readonly GeneratedAsset[],
  ): Promise<readonly CanvasWorkspaceProjectionResult[]> {
    if (assets.length === 0) return [];
    const workspaceUris = this.options.getWorkspaceUris?.() ?? readWorkspaceUris();
    if (workspaceUris.length !== 1) {
      return assets.map(() =>
        blocked('workspace-required', 'Canvas projection requires one workspace.'),
      );
    }
    const canvasApi = await (this.options.getCanvasApi?.() ?? getCanvasApi());
    if (!canvasApi?.boards?.project) {
      return assets.map(() =>
        blocked(
          'projection-write-failed',
          'Canvas authoring capability is unavailable; generated output remains in the workspace.',
        ),
      );
    }

    return Promise.all(
      assets.map(async (asset) => {
        if (!asset.lifecycle) {
          return blocked(
            'invalid-resource-ref',
            `Generated output ${asset.id} has no durable lifecycle reference.`,
          );
        }
        return canvasApi.boards.project(
          createGeneratedAssetWorkspaceProjectionRequest(asset, workspaceUris[0]!),
        );
      }),
    );
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
