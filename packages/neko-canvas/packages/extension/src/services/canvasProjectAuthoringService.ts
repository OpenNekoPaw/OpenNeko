import * as path from 'path';
import * as vscode from 'vscode';
import {
  applyCanvasHeadlessAuthoringOperations,
  assertNoRuntimeResourceIdentity,
  createDefaultProjectFormatCodecRegistry,
  createEmptyCanvasData,
  hashStableValue,
  nkcSourcePathPolicy,
  planCanvasBlockUpdate,
  planCanvasAgentContentApplication,
  planCanvasCompositeCreation,
  planCanvasConnectionCreation,
  planCanvasNodeCreation,
  planCanvasStoryboardSceneShotCreation,
  planCanvasWorkspaceBoardProjection,
  ProjectFileStore,
  type CanvasCreateCompositeRequest,
  type CanvasCreateCompositeResult,
  type CanvasCreateConnectionRequest,
  type CanvasCreateConnectionResult,
  type CanvasData,
  type CanvasImportAssetRequest,
  type CanvasImportAssetResult,
  type CanvasProjectAuthoringImportAssetRequest,
  type CanvasProjectAuthoringImportAssetResult,
  type QualityProjectRef,
  type CanvasAgentApplyContentResult,
  type CanvasAgentContentPayload,
  type CanvasHeadlessApplyOperationsRequest,
  type CanvasHeadlessApplyOperationsResult,
  type CanvasHeadlessApplyAgentContentAuthoringResult,
  type CanvasHeadlessAuthoringResultBase,
  type CanvasHeadlessAuthoringOperation,
  type CanvasHeadlessAuthoringTarget,
  type CanvasHeadlessCreateCompositeAuthoringResult,
  type CanvasHeadlessCreateConnectionResult,
  type CanvasHeadlessCreateNodeResult,
  type CanvasHeadlessCreateStoryboardAuthoringRequest,
  type CanvasHeadlessCreateStoryboardAuthoringResult,
  type CanvasHeadlessUpdateBlockAuthoringResult,
  type CanvasNodeCreateSpec,
  type CanvasWorkspaceProjectionRequest,
  type CanvasUpdateBlockRequest,
  type CanvasUpdateBlockResult,
  type ResolvedCanvasHeadlessAuthoringTarget,
} from '@neko/shared';
import type { ILogger } from '@neko/shared';
import { createVSCodeProjectFileIoAdapter } from '@neko/shared/vscode/extension';
import type { CanvasEditorProvider } from '../editor';

export interface CanvasProjectAuthoringServiceOptions {
  readonly context: vscode.ExtensionContext;
  readonly canvasEditorProvider: Pick<
    CanvasEditorProvider,
    'getActiveCanvasDocumentUri' | 'applyHostCanvasData' | 'revealCanvasDocument'
  >;
  readonly logger?: Pick<ILogger, 'debug' | 'info' | 'warn' | 'error'>;
}

interface LoadedCanvasTarget {
  readonly target: ResolvedCanvasHeadlessAuthoringTarget;
  readonly uri: vscode.Uri;
  readonly canvasData: CanvasData;
}

export interface CanvasWorkspaceBoardAuthoringResult {
  readonly status: 'projected' | 'noop';
  readonly documentUri: string;
  readonly nodeIds: readonly string[];
  readonly projectRef: QualityProjectRef;
}

interface CanvasWorkspaceBoardMutationResult extends CanvasHeadlessAuthoringResultBase {
  readonly workspaceBoardStatus: 'projected' | 'noop';
  readonly workspaceBoardNodeIds: readonly string[];
}

const STABLE_VARIABLE_PATH_PATTERN = /^\$\{[A-Z][A-Z0-9_]*\}\//;
const PROJECT_RELATIVE_PATH_PATTERN = /^(?:\.\/)?(?!\/)(?![a-zA-Z]:[\\/])[^:?#]+$/;

export class CanvasProjectAuthoringService {
  private readonly projectFileAdapter = createVSCodeProjectFileIoAdapter({ vscodeApi: vscode });
  private readonly projectFileStore = new ProjectFileStore({
    registry: createDefaultProjectFormatCodecRegistry(),
    fileOps: this.projectFileAdapter.fileOps,
    logger: this.options.logger,
  });

  constructor(private readonly options: CanvasProjectAuthoringServiceOptions) {}

  async resolveTarget(
    target: CanvasHeadlessAuthoringTarget | undefined,
    fallbackTitle = 'Agent Canvas',
  ): Promise<{ readonly target: ResolvedCanvasHeadlessAuthoringTarget; readonly uri: vscode.Uri }> {
    if (target?.documentUri) {
      const uri = vscode.Uri.parse(target.documentUri);
      assertCanvasDocumentUri(uri);
      return {
        uri,
        target: {
          kind: target.kind ?? 'file',
          documentUri: uri.toString(),
          title: target.title,
          created: false,
          reveal: target.reveal === true,
        },
      };
    }

    if (target?.kind === 'new') {
      return this.createNewTarget(target.title ?? fallbackTitle, target.reveal === true);
    }

    const activeUri = this.options.canvasEditorProvider.getActiveCanvasDocumentUri();
    if (activeUri) {
      return {
        uri: activeUri,
        target: {
          kind: 'active',
          documentUri: activeUri.toString(),
          title: target?.title,
          created: false,
          reveal: target?.reveal === true,
        },
      };
    }

    if (target?.kind === 'active') {
      throw new Error('No active Canvas document is available for the requested target.');
    }

    return this.createNewTarget(target?.title ?? fallbackTitle, target?.reveal === true);
  }

  async applyOperations(
    request: CanvasHeadlessApplyOperationsRequest & { readonly fallbackTitle?: string },
  ): Promise<CanvasHeadlessApplyOperationsResult> {
    return this.withMutation(request.target, request.fallbackTitle, (canvasData) => {
      const nextCanvasData = applyCanvasHeadlessAuthoringOperations(canvasData, request.operations);
      return {
        canvasData: nextCanvasData,
        result: {
          version: 1,
          status: 'success',
          documentUri: '',
          target: emptyResolvedTarget(),
          diagnostics: [],
          canvasData: nextCanvasData,
        } satisfies CanvasHeadlessApplyOperationsResult,
      };
    });
  }

  async projectWorkspaceBoard(input: {
    readonly request: CanvasWorkspaceProjectionRequest;
    readonly documentUri: string;
    readonly createIfMissing: boolean;
  }): Promise<CanvasWorkspaceBoardAuthoringResult> {
    const uri = vscode.Uri.parse(input.documentUri);
    assertCanvasDocumentUri(uri);
    if (input.createIfMissing) {
      await this.ensureCanvasDocument(uri, 'Workspace');
    }
    const result = await this.withMutation<CanvasWorkspaceBoardMutationResult>(
      { kind: 'file', documentUri: uri.toString() },
      undefined,
      (canvasData) => {
        const plan = planCanvasWorkspaceBoardProjection(canvasData, input.request);
        return {
          canvasData: plan.canvasData,
          result: {
            version: 1,
            status: plan.status === 'noop' ? 'noop' : 'success',
            documentUri: '',
            target: emptyResolvedTarget(),
            diagnostics: [],
            workspaceBoardStatus: plan.status,
            workspaceBoardNodeIds: plan.nodeIds,
          } satisfies CanvasWorkspaceBoardMutationResult,
        };
      },
    );
    if (!result.projectRef) {
      throw new Error('Workspace Board projection did not return a project revision.');
    }
    return {
      status: result.workspaceBoardStatus,
      documentUri: result.documentUri,
      nodeIds: result.workspaceBoardNodeIds,
      projectRef: result.projectRef,
    };
  }

  async createNode(input: {
    readonly target?: CanvasHeadlessAuthoringTarget;
    readonly node: CanvasNodeCreateSpec;
    readonly fallbackTitle?: string;
  }): Promise<{
    readonly nodeId: string;
    readonly documentUri: string;
    readonly projectRef: QualityProjectRef;
  }> {
    const result = await this.withMutation(input.target, input.fallbackTitle, (canvasData) => {
      const plan = planCanvasNodeCreation({ canvasData }, input.node);
      return {
        canvasData: plan.canvasData,
        result: {
          version: 1,
          status: 'success',
          documentUri: '',
          target: emptyResolvedTarget(),
          diagnostics: [],
          batch: plan.batch,
          nodeId: plan.result.nodeId,
          node: plan.result.node,
          createdNodes: plan.batch.createdNodes,
        } satisfies CanvasHeadlessCreateNodeResult,
      };
    });
    if (!result.nodeId) {
      throw new Error('Headless Canvas node creation did not return a node id.');
    }
    if (!result.projectRef) {
      throw new Error('Headless Canvas node creation did not return a project revision.');
    }
    return {
      nodeId: result.nodeId,
      documentUri: result.documentUri,
      projectRef: result.projectRef,
    };
  }

  async importAssetAuthoring(
    request: CanvasProjectAuthoringImportAssetRequest,
  ): Promise<CanvasProjectAuthoringImportAssetResult> {
    assertExplicitCanvasAuthoringTarget(request.target);
    const result = await this.importAsset({
      asset: request.asset,
      target: request.target,
    });
    if (!result.projectRef) {
      throw new Error('Headless Canvas asset import did not return a project revision.');
    }
    return { ...result, projectRef: result.projectRef };
  }

  async importAsset(input: {
    readonly asset: CanvasImportAssetRequest;
    readonly target?: CanvasHeadlessAuthoringTarget;
    readonly fallbackTitle?: string;
  }): Promise<CanvasImportAssetResult & { readonly projectRef: QualityProjectRef }> {
    const mediaType = normalizeImportedMediaType(input.asset.type, input.asset.path);
    const result = await this.createNode({
      target: input.asset.target ?? input.target,
      fallbackTitle: input.fallbackTitle ?? createImportedAssetCanvasTitle(input.asset),
      node: {
        type: 'media',
        preset: 'media.basic',
        position: input.asset.position,
        data: this.createImportedAssetNodeData(input.asset, mediaType),
      },
    });
    return {
      documentUri: result.documentUri,
      nodeId: result.nodeId,
      mediaType,
      projectRef: result.projectRef,
    };
  }

  async createConnection(input: {
    readonly target?: CanvasHeadlessAuthoringTarget;
    readonly connection: CanvasCreateConnectionRequest;
    readonly fallbackTitle?: string;
  }): Promise<CanvasCreateConnectionResult & { readonly documentUri: string }> {
    const result = await this.withMutation(input.target, input.fallbackTitle, (canvasData) => {
      const plan = planCanvasConnectionCreation({ canvasData }, input.connection);
      return {
        canvasData: plan.canvasData,
        result: {
          version: 1,
          status: 'success',
          documentUri: '',
          target: emptyResolvedTarget(),
          diagnostics: [],
          batch: plan.batch,
          createdConnections: plan.batch.createdConnections,
          connectionId: plan.result.connectionId,
          connection: plan.result.connection,
          createConnectionResult: plan.result,
        } satisfies CanvasHeadlessCreateConnectionResult,
      };
    });
    if (!result.createConnectionResult) {
      throw new Error('Headless Canvas connection creation did not return a result.');
    }
    return { ...result.createConnectionResult, documentUri: result.documentUri };
  }

  async createComposite(input: {
    readonly target?: CanvasHeadlessAuthoringTarget;
    readonly request: CanvasCreateCompositeRequest;
    readonly fallbackTitle?: string;
  }): Promise<CanvasCreateCompositeResult & { readonly documentUri: string }> {
    const result = await this.createCompositeAuthoringResult(input);
    if (!result.createCompositeResult) {
      throw new Error('Headless Canvas composite creation did not return a result.');
    }
    return { ...result.createCompositeResult, documentUri: result.documentUri };
  }

  async createCompositeAuthoringResult(input: {
    readonly target?: CanvasHeadlessAuthoringTarget;
    readonly request: CanvasCreateCompositeRequest;
    readonly fallbackTitle?: string;
  }): Promise<CanvasHeadlessCreateCompositeAuthoringResult> {
    return this.withMutation(input.target, input.fallbackTitle, (canvasData) => {
      const plan = planCanvasCompositeCreation({ canvasData }, input.request);
      return {
        canvasData: plan.canvasData,
        result: {
          version: 1,
          status: 'success',
          documentUri: '',
          target: emptyResolvedTarget(),
          diagnostics: [],
          batch: plan.batch,
          createdNodes: plan.batch.createdNodes,
          createdConnections: plan.batch.createdConnections,
          createCompositeResult: plan.result,
        },
      };
    });
  }

  async updateBlock(input: {
    readonly target?: CanvasHeadlessAuthoringTarget;
    readonly request: CanvasUpdateBlockRequest;
    readonly fallbackTitle?: string;
  }): Promise<CanvasUpdateBlockResult & { readonly documentUri: string }> {
    const result = await this.updateBlockAuthoringResult(input);
    if (!result.updateBlockResult) {
      throw new Error('Headless Canvas block update did not return a result.');
    }
    return { ...result.updateBlockResult, documentUri: result.documentUri };
  }

  async updateBlockAuthoringResult(input: {
    readonly target?: CanvasHeadlessAuthoringTarget;
    readonly request: CanvasUpdateBlockRequest;
    readonly fallbackTitle?: string;
  }): Promise<CanvasHeadlessUpdateBlockAuthoringResult> {
    return this.withMutation(input.target, input.fallbackTitle, (canvasData) => {
      const plan = planCanvasBlockUpdate({ canvasData }, input.request);
      return {
        canvasData: plan.canvasData,
        result: {
          version: 1,
          status: 'success',
          documentUri: '',
          target: emptyResolvedTarget(),
          diagnostics: [],
          batch: plan.batch,
          updateBlockResult: plan.result,
        },
      };
    });
  }

  async applyAgentContent(input: {
    readonly target?: CanvasHeadlessAuthoringTarget;
    readonly payload: CanvasAgentContentPayload;
    readonly fallbackTitle?: string;
  }): Promise<CanvasAgentApplyContentResult & { readonly documentUri: string }> {
    const result = await this.applyAgentContentAuthoringResult(input);
    if (!result.applyAgentContentResult) {
      throw new Error('Headless Canvas Agent content application did not return a result.');
    }
    return { ...result.applyAgentContentResult, documentUri: result.documentUri };
  }

  async applyAgentContentAuthoringResult(input: {
    readonly target?: CanvasHeadlessAuthoringTarget;
    readonly payload: CanvasAgentContentPayload;
    readonly fallbackTitle?: string;
  }): Promise<CanvasHeadlessApplyAgentContentAuthoringResult> {
    return this.withMutation(input.target, input.fallbackTitle, (canvasData) => {
      const plan = planCanvasAgentContentApplication({ canvasData }, input.payload);
      return {
        canvasData: plan.canvasData,
        result: {
          version: 1,
          status: plan.result.changed ? 'success' : 'noop',
          documentUri: '',
          target: emptyResolvedTarget(),
          diagnostics: [],
          batch: plan.batch,
          createdNodes: plan.batch.createdNodes,
          createdConnections: plan.batch.createdConnections,
          applyAgentContentResult: plan.result,
        },
      };
    });
  }

  async createStoryboardFromPayload(
    request: CanvasHeadlessCreateStoryboardAuthoringRequest,
  ): Promise<CanvasHeadlessCreateStoryboardAuthoringResult> {
    const fallbackTitle = request.target?.title ?? createStoryboardCanvasTitle(request.payload);
    return this.withMutation(request.target, fallbackTitle, (canvasData) => {
      const plan = planCanvasStoryboardSceneShotCreation({ canvasData }, request.payload, {
        startX: request.startX,
        startY: request.startY,
        workflowPlanId: request.workflowPlanId,
      });
      return {
        canvasData: plan.canvasData,
        result: {
          version: 1,
          status: 'success',
          documentUri: '',
          target: emptyResolvedTarget(),
          diagnostics: [],
          batch: plan.batch,
          createdNodes: plan.batch.createdNodes,
          createdConnections: plan.batch.createdConnections,
          storyboard: plan.result,
        },
      };
    });
  }

  private async withMutation<TResult extends CanvasHeadlessAuthoringResultBase>(
    target: CanvasHeadlessAuthoringTarget | undefined,
    fallbackTitle: string | undefined,
    mutate: (canvasData: CanvasData) => {
      readonly canvasData: CanvasData;
      readonly result: TResult;
    },
  ): Promise<TResult> {
    const loaded = await this.loadTarget(target, fallbackTitle);
    const mutation = mutate(loaded.canvasData);
    assertNoRuntimeResourceIdentity(mutation.canvasData, 'canvasData');
    if (mutation.canvasData !== loaded.canvasData) {
      await this.saveCanvasData(loaded.uri, mutation.canvasData);
      this.options.canvasEditorProvider.applyHostCanvasData(loaded.uri, mutation.canvasData);
    }
    if (loaded.target.reveal) {
      await this.options.canvasEditorProvider.revealCanvasDocument(loaded.uri);
    }
    const contentDigest = hashStableValue(mutation.canvasData);
    return {
      ...mutation.result,
      documentUri: loaded.uri.toString(),
      target: loaded.target,
      diagnostics: mutation.result.diagnostics,
      projectRef: {
        domain: 'canvas',
        documentUri: loaded.uri.toString(),
        projectRevision: `nkc:${contentDigest}`,
        contentDigest,
      },
    };
  }

  private async loadTarget(
    target: CanvasHeadlessAuthoringTarget | undefined,
    fallbackTitle = 'Agent Canvas',
  ): Promise<LoadedCanvasTarget> {
    const resolved = await this.resolveTarget(target, fallbackTitle);
    if (resolved.target.created) {
      return {
        ...resolved,
        canvasData: createEmptyCanvasData(resolved.target.title ?? fallbackTitle),
      };
    }

    const loaded = await this.projectFileStore.load<CanvasData>({
      filePath: resolved.uri.fsPath,
      formatId: 'nkc',
      sourcePolicy: nkcSourcePathPolicy,
      sourcePolicyOptions: {
        context: this.createCanvasProjectFileContext(resolved.uri),
      },
    });
    if (!loaded.ok || !loaded.document) {
      throw new Error(
        `Failed to load Canvas document ${resolved.uri.toString()}: ${formatDiagnostics(
          loaded.diagnostics,
        )}`,
      );
    }
    if (target?.expectedRevision) {
      const actualRevision = `nkc:${hashStableValue(loaded.document)}`;
      if (actualRevision !== target.expectedRevision) {
        throw new Error(
          `stale-board-target: expected Canvas revision ${target.expectedRevision}, received ${actualRevision}.`,
        );
      }
    }
    return {
      ...resolved,
      canvasData: loaded.document,
    };
  }

  private async ensureCanvasDocument(uri: vscode.Uri, title: string): Promise<void> {
    try {
      await vscode.workspace.fs.stat(uri);
      return;
    } catch (error) {
      if (!isFileNotFound(error)) throw error;
    }
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
    const canvasData = createEmptyCanvasData(title);
    assertNoRuntimeResourceIdentity(canvasData, 'canvasData');
    await this.saveCanvasData(uri, canvasData);
    this.options.canvasEditorProvider.applyHostCanvasData(uri, canvasData);
  }

  private createImportedAssetNodeData(
    asset: CanvasImportAssetRequest,
    mediaType: CanvasImportAssetResult['mediaType'],
  ): Record<string, unknown> {
    const hasStableResource = Boolean(asset.documentResourceRef || asset.resourceRef);
    const assetPath = hasStableResource ? '' : this.normalizePersistentAssetPath(asset.path);
    if (!hasStableResource && !assetPath) {
      throw new Error(
        'Canvas asset import requires a workspace-relative path, ${VAR}/path, ResourceRef, or DocumentArchiveResourceRef.',
      );
    }

    return {
      assetPath: assetPath ?? '',
      ...(asset.documentResourceRef ? { documentResourceRef: asset.documentResourceRef } : {}),
      ...(asset.resourceRef ? { resourceRef: asset.resourceRef } : {}),
      mediaType,
      ...(asset.name ? { title: asset.name } : {}),
      ...(asset.provenance ? { provenance: asset.provenance } : {}),
    };
  }

  private normalizePersistentAssetPath(assetPath: string | undefined): string | undefined {
    const trimmed = assetPath?.trim();
    if (!trimmed) {
      return undefined;
    }
    if (isStablePersistentAssetPath(trimmed)) {
      return trimmed;
    }
    const workspacePath = this.tryCreateWorkspaceVariablePath(trimmed);
    if (workspacePath) {
      return workspacePath;
    }
    throw new Error(
      `Canvas asset import path must be workspace-relative, use a \${VAR}/path variable, or provide a stable resource ref: ${trimmed}`,
    );
  }

  private tryCreateWorkspaceVariablePath(assetPath: string): string | undefined {
    if (!path.isAbsolute(assetPath)) {
      return undefined;
    }
    const normalizedAssetPath = path.resolve(assetPath);
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const workspacePath = path.resolve(folder.uri.fsPath);
      const relativePath = path.relative(workspacePath, normalizedAssetPath);
      if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        continue;
      }
      return `\${WORKSPACE}/${relativePath.split(path.sep).join('/')}`;
    }
    return undefined;
  }

  private async saveCanvasData(uri: vscode.Uri, canvasData: CanvasData): Promise<void> {
    const saved = await this.projectFileStore.save<CanvasData>({
      filePath: uri.fsPath,
      formatId: 'nkc',
      document: canvasData,
      sourcePolicy: nkcSourcePathPolicy,
      sourcePolicyOptions: {
        context: this.createCanvasProjectFileContext(uri),
      },
      saveReason: 'agent-edit',
      indent: 2,
      atomic: true,
    });
    if (!saved.ok || !saved.written) {
      throw new Error(
        `Failed to save Canvas document ${uri.toString()}: ${formatDiagnostics(saved.diagnostics)}`,
      );
    }
    this.options.logger?.debug('canvasProjectAuthoring.saved', {
      documentUri: uri.toString(),
      nodeCount: canvasData.nodes.length,
      connectionCount: canvasData.connections.length,
    });
  }

  private async createNewTarget(
    title: string,
    reveal: boolean,
  ): Promise<{ readonly target: ResolvedCanvasHeadlessAuthoringTarget; readonly uri: vscode.Uri }> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      throw new Error('No workspace folder open for creating a Canvas document.');
    }
    const filePath = await this.createAvailableCanvasFilePath(folder.uri.fsPath, title);
    const uri = vscode.Uri.file(filePath);
    return {
      uri,
      target: {
        kind: 'new',
        documentUri: uri.toString(),
        title,
        created: true,
        reveal,
      },
    };
  }

  private async createAvailableCanvasFilePath(folderPath: string, title: string): Promise<string> {
    const baseName = sanitizeCanvasFileName(title) || 'Canvas';
    for (let index = 0; index < 100; index += 1) {
      const suffix = index === 0 ? '' : ` ${index + 1}`;
      const candidate = path.join(folderPath, `${baseName}${suffix}.nkc`);
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
      } catch {
        return candidate;
      }
    }
    return path.join(folderPath, `${baseName}-${Date.now()}.nkc`);
  }

  private createCanvasProjectFileContext(uri: vscode.Uri) {
    return this.projectFileAdapter.createWorkspaceMediaPathContext({
      documentUri: uri,
      allowedRoots: [
        path.dirname(uri.fsPath),
        ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
      ],
    });
  }
}

function assertCanvasDocumentUri(uri: vscode.Uri): void {
  if (uri.scheme !== 'file') {
    throw new Error(`Canvas document target must be a file URI: ${uri.toString()}`);
  }
  if (path.extname(uri.fsPath).toLowerCase() !== '.nkc') {
    throw new Error(`Canvas document target must point to a .nkc file: ${uri.fsPath}`);
  }
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (Reflect.get(error, 'code') === 'FileNotFound' || Reflect.get(error, 'code') === 'ENOENT')
  );
}

function createStoryboardCanvasTitle(payload: {
  readonly creativeScope?: { readonly title?: string };
  readonly sourceScriptUri?: string;
}): string {
  const scopeTitle = payload.creativeScope?.title?.trim();
  if (scopeTitle) return sanitizeCanvasFileName(scopeTitle).slice(0, 80);
  if (payload.sourceScriptUri) {
    return sanitizeCanvasFileName(path.parse(payload.sourceScriptUri).name).slice(0, 80);
  }
  return 'Agent Storyboard';
}

function createImportedAssetCanvasTitle(asset: CanvasImportAssetRequest): string {
  const sourceTitle =
    (asset.name ? path.parse(asset.name).name : '') ||
    (asset.path ? path.parse(asset.path).name : '') ||
    asset.documentResourceRef?.entryPath?.split(/[\\/]/).pop() ||
    asset.resourceRef?.id ||
    'Agent Canvas';
  return sanitizeCanvasFileName(sourceTitle).slice(0, 80) || 'Agent Canvas';
}

function assertExplicitCanvasAuthoringTarget(
  target: CanvasProjectAuthoringImportAssetRequest['target'],
): void {
  if (target.kind === 'active' || (!target.documentUri && target.kind !== 'new')) {
    throw new Error(
      'missing-authoring-target: Canvas project authoring requires an explicit file or new target.',
    );
  }
}

function normalizeImportedMediaType(
  mediaType: CanvasImportAssetRequest['type'],
  assetPath: string | undefined,
): CanvasImportAssetResult['mediaType'] {
  if (mediaType === 'video' || mediaType === 'audio') {
    return mediaType;
  }
  if (mediaType === 'image') {
    return 'image';
  }
  const cleanPath = assetPath?.split('?')[0]?.split('#')[0] ?? '';
  const extension = cleanPath.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(extension)) {
    return 'video';
  }
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(extension)) {
    return 'audio';
  }
  return 'image';
}

function isStablePersistentAssetPath(assetPath: string): boolean {
  return (
    STABLE_VARIABLE_PATH_PATTERN.test(assetPath) || PROJECT_RELATIVE_PATH_PATTERN.test(assetPath)
  );
}

function sanitizeCanvasFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDiagnostics(
  diagnostics: readonly { readonly code?: string; readonly message: string }[],
): string {
  if (diagnostics.length === 0) {
    return 'unknown error';
  }
  return diagnostics
    .map((diagnostic) => `${diagnostic.code ?? 'diagnostic'}: ${diagnostic.message}`)
    .join('; ');
}

function emptyResolvedTarget(): ResolvedCanvasHeadlessAuthoringTarget {
  return {
    kind: 'new',
    documentUri: '',
    created: false,
    reveal: false,
  };
}
