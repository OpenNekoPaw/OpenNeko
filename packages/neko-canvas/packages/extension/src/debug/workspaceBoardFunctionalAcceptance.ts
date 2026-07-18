import * as path from 'node:path';
import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import {
  createGeneratedAssetRevisionRef,
  createGeneratedAssetWorkspaceDeliveryRequest,
  type CanvasWorkspaceDeliveryHost,
  type CanvasWorkspaceProjectionRequest,
  type CanvasWorkspaceProjectionResult,
  type GeneratedImage,
} from '@neko/shared';
import type { WorkspaceBoardProjector } from '../services/workspaceBoardProjector';

const WORKSPACE_BOARD_FUNCTIONAL_ACCEPTANCE_COMMAND =
  'neko.canvas.debug.exerciseWorkspaceBoardDelivery';

interface WorkspaceBoardFunctionalAcceptanceCoordinator {
  acquireWriterOwnership(): Promise<boolean>;
  enqueue(
    request: CanvasWorkspaceProjectionRequest,
  ): Promise<readonly CanvasWorkspaceProjectionResult[]>;
  flush(): Promise<readonly CanvasWorkspaceProjectionResult[]>;
}

export function registerWorkspaceBoardFunctionalAcceptance(options: {
  readonly context: Pick<vscode.ExtensionContext, 'subscriptions'>;
  readonly projector: Pick<WorkspaceBoardProjector, 'project'>;
  readonly competingHostCoordinator: Pick<WorkspaceBoardFunctionalAcceptanceCoordinator, 'enqueue'>;
  readonly editorOwnerCoordinator: Pick<
    WorkspaceBoardFunctionalAcceptanceCoordinator,
    'acquireWriterOwnership' | 'flush'
  >;
  readonly whenEditorOwnerIdle: () => Promise<void>;
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
        const generatedAssetRequest = createGeneratedAssetWorkspaceDeliveryRequest(asset, {
          workspaceId,
          workspaceUri: workspaceUri.toString(),
          sourceHost: input.sourceHost,
        });
        const request = input.sourceTitle
          ? withCreativeSourceRelation(generatedAssetRequest, input.sourceTitle)
          : generatedAssetRequest;
        await options.whenEditorOwnerIdle();
        const result = await runAcceptanceAction(input.action, request, options);
        if (result.target?.documentUri) {
          await options.revealDocument(vscode.Uri.parse(result.target.documentUri));
        }
        return result;
      },
    ),
  );
}

type WorkspaceBoardFunctionalAcceptanceAction =
  'enqueue-competing-host' | 'flush-editor-owner' | 'project-editor-owner';

interface WorkspaceBoardFunctionalAcceptanceInput {
  readonly action: WorkspaceBoardFunctionalAcceptanceAction;
  readonly sourceHost: CanvasWorkspaceDeliveryHost;
  readonly assetId: string;
  readonly relativePath: string;
  readonly title: string;
  readonly mimeType: string;
  readonly taskId: string;
  readonly generatedAt: string;
  readonly width: number;
  readonly height: number;
  readonly sourceTitle?: string;
}

function parseInput(value: unknown): WorkspaceBoardFunctionalAcceptanceInput {
  if (!isRecord(value)) throw new Error('Workspace Board acceptance input must be an object.');
  return {
    action: requireAction(value['action']),
    sourceHost: requireSourceHost(value['sourceHost']),
    assetId: requireString(value['assetId'], 'assetId'),
    relativePath: requireString(value['relativePath'], 'relativePath'),
    title: requireString(value['title'], 'title'),
    mimeType: requireString(value['mimeType'], 'mimeType'),
    taskId: requireString(value['taskId'], 'taskId'),
    generatedAt: requireString(value['generatedAt'], 'generatedAt'),
    width: requirePositiveNumber(value['width'], 'width'),
    height: requirePositiveNumber(value['height'], 'height'),
    ...(value['sourceTitle'] === undefined
      ? {}
      : { sourceTitle: requireString(value['sourceTitle'], 'sourceTitle') }),
  };
}

function withCreativeSourceRelation(
  request: CanvasWorkspaceProjectionRequest,
  sourceTitle: string,
): CanvasWorkspaceProjectionRequest {
  const output = request.artifacts[0];
  if (!output) throw new Error('Workspace Board acceptance output artifact is missing.');
  const sourceArtifactId = `${output.provenance.artifactId}:source`;
  const sourceDigest = createHash('sha256').update(sourceTitle).digest('hex');
  const deliveryDigest = createHash('sha256')
    .update(`${request.process.deliveryId}:${sourceDigest}`)
    .digest('hex')
    .slice(0, 12);
  const deliveryId = `functional-creative-batch:${deliveryDigest}`;
  return {
    ...request,
    process: { ...request.process, deliveryId },
    artifacts: [
      {
        kind: 'markdown',
        title: sourceTitle,
        markdown: `# ${sourceTitle}`,
        provenance: {
          ...output.provenance,
          deliveryId,
          artifactId: sourceArtifactId,
          revision: `markdown:sha256:${sourceDigest}`,
          kind: 'markdown',
          role: 'source',
          sourceId: `functional-source:${sourceArtifactId}`,
        },
      },
      {
        ...output,
        provenance: {
          ...output.provenance,
          deliveryId,
          sourceArtifactIds: [sourceArtifactId],
        },
      },
    ],
  };
}

async function runAcceptanceAction(
  action: WorkspaceBoardFunctionalAcceptanceAction,
  request: CanvasWorkspaceProjectionRequest,
  options: {
    readonly projector: Pick<WorkspaceBoardProjector, 'project'>;
    readonly competingHostCoordinator: Pick<
      WorkspaceBoardFunctionalAcceptanceCoordinator,
      'enqueue'
    >;
    readonly editorOwnerCoordinator: Pick<
      WorkspaceBoardFunctionalAcceptanceCoordinator,
      'acquireWriterOwnership' | 'flush'
    >;
  },
): Promise<CanvasWorkspaceProjectionResult> {
  if (action === 'project-editor-owner') return options.projector.project(request);
  if (action === 'enqueue-competing-host') {
    const acquired = await options.editorOwnerCoordinator.acquireWriterOwnership();
    if (!acquired) {
      throw new Error(
        'Workspace Board acceptance editor owner could not acquire the writer lease.',
      );
    }
  }
  const results =
    action === 'enqueue-competing-host'
      ? await options.competingHostCoordinator.enqueue(request)
      : await options.editorOwnerCoordinator.flush();
  const result = results.find((entry) => entry.deliveryId === request.process.deliveryId);
  if (!result) {
    throw new Error(
      `Workspace Board acceptance ${action} returned no result for ${request.process.deliveryId}.`,
    );
  }
  return result;
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

function requireAction(value: unknown): WorkspaceBoardFunctionalAcceptanceAction {
  if (
    value === 'enqueue-competing-host' ||
    value === 'flush-editor-owner' ||
    value === 'project-editor-owner'
  ) {
    return value;
  }
  throw new Error('Workspace Board acceptance action is invalid.');
}

function requireSourceHost(value: unknown): CanvasWorkspaceDeliveryHost {
  if (value === 'vscode' || value === 'tui' || value === 'headless') return value;
  throw new Error('Workspace Board acceptance sourceHost is invalid.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
