import * as vscode from 'vscode';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  createSafeCanvasWorkspaceProjectionDiagnostic,
  isNekoCanvasAPI,
  NEKO_EXTENSION_IDS,
  type CanvasWorkspaceDeliveryBatch,
  type CanvasWorkspaceProjectionArtifact,
  type CanvasWorkspaceProjectionDiagnostic,
  type CanvasWorkspaceProjectionResult,
  type NekoCanvasAPI,
} from '@neko/shared';
import { resolveNekoExtension } from '@neko/shared/vscode/extension';
import type { CreatorVisibleArtifactCandidate } from '@neko/agent/runtime';

export interface WorkspaceBoardProjectionHostOptions {
  readonly workspaceId?: string;
  readonly getCanvasApi?: () => Promise<Pick<NekoCanvasAPI, 'boards'> | undefined>;
  readonly getWorkspaceUris?: () => readonly string[];
}

export class WorkspaceBoardProjectionHost {
  constructor(private readonly options: WorkspaceBoardProjectionHostOptions = {}) {}

  async deliverCreatorVisibleArtifacts(input: {
    readonly deliveryId: string;
    readonly createdAt: string;
    readonly artifacts: readonly CreatorVisibleArtifactCandidate[];
    readonly taskId?: string;
    readonly runId?: string;
  }): Promise<readonly CanvasWorkspaceProjectionResult[]> {
    if (input.artifacts.length === 0) return [];
    return this.deliverBatch({
      process: {
        deliveryId: input.deliveryId,
        sourceHost: 'vscode',
        createdAt: input.createdAt,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
      },
      artifacts: input.artifacts.map((artifact) => toProjectionArtifact(artifact, input)),
    });
  }

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
    } catch {
      return [blocked('projection-write-failed')];
    }
  }
}

function toProjectionArtifact(
  artifact: CreatorVisibleArtifactCandidate,
  input: {
    readonly deliveryId: string;
    readonly createdAt: string;
    readonly taskId?: string;
    readonly runId?: string;
  },
): CanvasWorkspaceProjectionArtifact {
  const provenance = {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    deliveryId: input.deliveryId,
    artifactId: artifact.artifactId,
    revision: artifact.revision,
    kind: artifact.kind,
    role: artifact.role,
    sourceId: artifact.sourceId,
    ...(artifact.sourceArtifactIds ? { sourceArtifactIds: artifact.sourceArtifactIds } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    createdAt: input.createdAt,
  };
  if (artifact.kind === 'markdown') {
    if (!artifact.markdown) {
      throw new Error(`Markdown artifact ${artifact.artifactId} has no durable body.`);
    }
    return {
      kind: 'markdown',
      title: artifact.title,
      markdown: artifact.markdown,
      provenance,
    };
  }
  return {
    kind: artifact.kind,
    title: artifact.title,
    ...(artifact.resourceRef ? { resourceRef: artifact.resourceRef } : {}),
    ...(artifact.documentResourceRef ? { documentResourceRef: artifact.documentResourceRef } : {}),
    ...(artifact.intrinsicDimensions ? { intrinsicDimensions: artifact.intrinsicDimensions } : {}),
    provenance,
  };
}

async function getCanvasApi(): Promise<Pick<NekoCanvasAPI, 'boards'> | undefined> {
  const extension = resolveNekoExtension(NEKO_EXTENSION_IDS.NEKO_CANVAS, (id) =>
    vscode.extensions.getExtension(id),
  );
  if (!extension) return undefined;
  const api = extension.isActive ? extension.exports : await extension.activate();
  return isNekoCanvasAPI(api) ? api : undefined;
}

function readWorkspaceUris(): readonly string[] {
  return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.toString());
}

function blocked(
  code: CanvasWorkspaceProjectionDiagnostic['code'],
  message?: string,
): CanvasWorkspaceProjectionResult {
  return {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    status: 'blocked',
    diagnostics: [
      message
        ? { code, severity: 'error', message }
        : createSafeCanvasWorkspaceProjectionDiagnostic(code),
    ],
  };
}
