import * as path from 'node:path';
import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import {
  createGeneratedAssetRevisionRef,
  createGeneratedAssetWorkspaceDeliveryRequest,
  type GeneratedImage,
} from '@neko/shared';
import type { WorkspaceBoardProjector } from '../services/workspaceBoardProjector';

const WORKSPACE_BOARD_FUNCTIONAL_ACCEPTANCE_COMMAND =
  'neko.canvas.debug.projectWorkspaceBoardGeneratedImage';

export function registerWorkspaceBoardFunctionalAcceptance(options: {
  readonly context: vscode.ExtensionContext;
  readonly projector: Pick<WorkspaceBoardProjector, 'project'>;
  readonly getWorkspaceId: () => string | undefined;
  readonly getActiveDocumentUri: () => vscode.Uri | undefined;
  readonly revealDocument: (uri: vscode.Uri) => Promise<void>;
}): void {
  options.context.subscriptions.push(
    vscode.commands.registerCommand(
      WORKSPACE_BOARD_FUNCTIONAL_ACCEPTANCE_COMMAND,
      async (value: unknown) => {
        const input = parseInput(value);
        const workspaceId = options.getWorkspaceId();
        if (!workspaceId) throw new Error('Workspace Board acceptance requires a workspace ID.');
        const workspaceUri = resolveFixtureWorkspace(options.getActiveDocumentUri());
        const sourceUri = resolveGeneratedImageSource(workspaceUri, input.relativePath);
        const bytes = await vscode.workspace.fs.readFile(sourceUri);
        const contentDigest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        const lifecycle = createGeneratedAssetRevisionRef({
          assetId: input.assetId,
          contentDigest,
          mediaKind: 'image',
          mimeType: input.mimeType,
          generation: { taskId: input.taskId },
        });
        const asset: GeneratedImage = {
          id: input.assetId,
          type: 'generated-image',
          path: sourceUri.fsPath,
          assetRef: {
            assetId: input.assetId,
            uri: `generated-assets/${input.assetId}${path.extname(sourceUri.fsPath)}`,
            mimeType: input.mimeType,
          },
          lifecycle,
          mimeType: input.mimeType,
          generatedAt: input.generatedAt,
          prompt: input.title,
          width: input.width,
          height: input.height,
          ratio: `${input.width}:${input.height}`,
        };
        const result = await options.projector.project(
          createGeneratedAssetWorkspaceDeliveryRequest(asset, {
            workspaceId,
            workspaceUri: workspaceUri.toString(),
            sourceHost: 'vscode',
          }),
        );
        if (result.target?.documentUri) {
          await options.revealDocument(vscode.Uri.parse(result.target.documentUri));
        }
        return result;
      },
    ),
  );
}

interface WorkspaceBoardFunctionalAcceptanceInput {
  readonly assetId: string;
  readonly relativePath: string;
  readonly title: string;
  readonly mimeType: string;
  readonly taskId: string;
  readonly generatedAt: string;
  readonly width: number;
  readonly height: number;
}

function parseInput(value: unknown): WorkspaceBoardFunctionalAcceptanceInput {
  if (!isRecord(value)) throw new Error('Workspace Board acceptance input must be an object.');
  return {
    assetId: requireString(value['assetId'], 'assetId'),
    relativePath: requireString(value['relativePath'], 'relativePath'),
    title: requireString(value['title'], 'title'),
    mimeType: requireString(value['mimeType'], 'mimeType'),
    taskId: requireString(value['taskId'], 'taskId'),
    generatedAt: requireString(value['generatedAt'], 'generatedAt'),
    width: requirePositiveNumber(value['width'], 'width'),
    height: requirePositiveNumber(value['height'], 'height'),
  };
}

function resolveFixtureWorkspace(activeDocumentUri: vscode.Uri | undefined): vscode.Uri {
  if (!activeDocumentUri || activeDocumentUri.scheme !== 'file') {
    throw new Error('Workspace Board acceptance requires an active local Canvas document.');
  }
  const workspaceRoot = path.dirname(path.dirname(path.dirname(activeDocumentUri.fsPath)));
  const relativeDocumentPath = path
    .relative(workspaceRoot, activeDocumentUri.fsPath)
    .split(path.sep)
    .join('/');
  if (relativeDocumentPath !== 'neko/boards/workspace.nkc') {
    throw new Error(
      'Workspace Board acceptance requires the active document to be neko/boards/workspace.nkc.',
    );
  }
  return vscode.Uri.file(workspaceRoot);
}

function resolveGeneratedImageSource(workspaceUri: vscode.Uri, relativePath: string): vscode.Uri {
  const normalized = relativePath.replace(/\\/gu, '/');
  if (!normalized.startsWith('neko/generated/image/') || normalized.includes('../')) {
    throw new Error('Workspace Board acceptance source must be under neko/generated/image/.');
  }
  const workspaceRoot = path.resolve(workspaceUri.fsPath);
  const sourcePath = path.resolve(workspaceRoot, normalized);
  const relative = path.relative(workspaceRoot, sourcePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Workspace Board acceptance source escapes the workspace.');
  }
  return vscode.Uri.file(sourcePath);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Workspace Board acceptance ${field} must be a non-empty string.`);
  }
  return value;
}

function requirePositiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Workspace Board acceptance ${field} must be a positive number.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
