import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  ProjectFileStore,
  createDefaultProjectFormatCodecRegistry,
  createEmptyCanvasData,
  hashStableValue,
  planCanvasWorkspaceBoardProjection,
  resolveCanvasWorkspaceBoardDocumentUri,
  validateCanvasWorkspaceProjectionRequest,
  type CanvasData,
  type CanvasWorkspaceProjectionDiagnostic,
  type CanvasWorkspaceProjectionRequest,
  type CanvasWorkspaceProjectionResult,
} from '@neko/shared';

export class NodeWorkspaceBoardProjector {
  private readonly workspaceRoot: string;
  private readonly store = new ProjectFileStore({
    registry: createDefaultProjectFormatCodecRegistry(),
    fileOps: {
      readFile: fs.readFile,
      writeFile: async (filePath, content) => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content);
      },
      deleteFile: fs.unlink,
      renameFile: async (fromPath, toPath) => fs.rename(fromPath, toPath),
    },
  });

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  async project(
    request: CanvasWorkspaceProjectionRequest,
  ): Promise<CanvasWorkspaceProjectionResult> {
    const diagnostics = validateCanvasWorkspaceProjectionRequest(request);
    if (diagnostics.length > 0) return blocked(diagnostics);

    const requestWorkspaceRoot = path.resolve(fileURLToPath(request.target.workspaceUri));
    if (requestWorkspaceRoot !== this.workspaceRoot) {
      return blocked([
        {
          code: 'workspace-required',
          severity: 'error',
          message: 'Canvas projection workspace does not match the TUI session workspace.',
        },
      ]);
    }

    const explicit = request.target.documentUri;
    const documentUri = explicit ?? resolveCanvasWorkspaceBoardDocumentUri(request.target.workspaceUri);
    const filePath = fileURLToPath(documentUri);
    const exists = await fileExists(filePath);
    if (!exists && explicit) {
      return blocked([
        {
          code: 'projection-write-failed',
          severity: 'error',
          message: 'Explicit Canvas target does not exist.',
        },
      ]);
    }

    let canvasData: CanvasData;
    if (exists) {
      const loaded = await this.store.load<CanvasData>({ filePath, formatId: 'nkc' });
      if (!loaded.ok || !loaded.document) {
        return blocked([
          {
            code: 'projection-write-failed',
            severity: 'error',
            message: formatDiagnostics(loaded.diagnostics),
          },
        ]);
      }
      canvasData = loaded.document;
    } else {
      canvasData = createEmptyCanvasData('Workspace');
    }

    try {
      const plan = planCanvasWorkspaceBoardProjection(canvasData, request);
      if (plan.status === 'projected') {
        const saved = await this.store.save({
          filePath,
          formatId: 'nkc',
          document: plan.canvasData,
          saveReason: 'agent-edit',
          indent: 2,
          atomic: true,
        });
        if (!saved.ok || !saved.written) {
          return blocked([
            {
              code: 'projection-write-failed',
              severity: 'error',
              message: formatDiagnostics(saved.diagnostics),
            },
          ]);
        }
      }
      return {
        version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
        status: plan.status,
        target: { kind: explicit ? 'explicit' : 'workspace', documentUri },
        revision: `nkc:${hashStableValue(plan.canvasData)}`,
        nodeIds: plan.nodeIds,
        diagnostics: [],
      };
    } catch (error) {
      return blocked([
        {
          code: /projection-conflict/iu.test(toErrorMessage(error))
            ? 'projection-conflict'
            : 'projection-write-failed',
          severity: 'error',
          message: toErrorMessage(error),
        },
      ]);
    }
  }

  workspaceUri(): string {
    return pathToFileURL(`${this.workspaceRoot}${path.sep}`).toString();
  }
}

function blocked(
  diagnostics: readonly CanvasWorkspaceProjectionDiagnostic[],
): CanvasWorkspaceProjectionResult {
  return { version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION, status: 'blocked', diagnostics };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}

function formatDiagnostics(diagnostics: readonly { readonly message: string }[]): string {
  return diagnostics.map((entry) => entry.message).join('; ') || 'Canvas project file failed.';
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
