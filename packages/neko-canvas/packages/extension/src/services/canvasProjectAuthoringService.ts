import * as path from 'path';
import * as vscode from 'vscode';
import {
  applyCanvasHeadlessAuthoringOperations,
  assertNoRuntimeResourceIdentity,
  createNkcProjectFormatCodecRegistry,
  createEmptyCanvasData,
  hashStableValue,
  nkcSourcePathPolicy,
  planCanvasBlockUpdate,
  planCanvasAgentContentApplication,
  planCanvasCompositeCreation,
  planCanvasConnectionCreation,
  planCanvasNodeCreation,
  ProjectFileStore,
  validateContentLocator,
  type ProjectFileStoreOptions,
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
  type CanvasHeadlessAuthoringTarget,
  type CanvasHeadlessCreateCompositeAuthoringResult,
  type CanvasHeadlessCreateConnectionResult,
  type CanvasHeadlessCreateNodeResult,
  type CanvasHeadlessUpdateBlockAuthoringResult,
  type CanvasNodeCreateSpec,
  type CanvasUpdateBlockRequest,
  type CanvasUpdateBlockResult,
  type ResolvedCanvasHeadlessAuthoringTarget,
} from '@neko/shared';
import type { ILogger } from '@neko/shared';
import { createVSCodeProjectFileIoAdapter } from '@neko/shared/vscode/extension';
import {
  createCanvasWorkspaceBoardRevision,
  type CanvasWorkspaceBoardLoadedDocument,
  type CanvasWorkspaceBoardMutationPort,
} from '@neko-canvas/domain';
import type { CanvasEditorProvider } from '../editor';

export interface CanvasProjectAuthoringServiceOptions {
  readonly context: vscode.ExtensionContext;
  readonly canvasEditorProvider: Pick<
    CanvasEditorProvider,
    'getActiveCanvasDocumentUri' | 'applyHostCanvasData' | 'revealCanvasDocument'
  > &
    Partial<Pick<CanvasEditorProvider, 'getOpenCanvasDocumentSnapshot'>>;
  readonly logger?: Pick<ILogger, 'debug' | 'info' | 'warn' | 'error'>;
  readonly resolveAuthorizedWrite?: ProjectFileStoreOptions['resolveAuthorizedWrite'];
}

interface LoadedCanvasTarget {
  readonly target: ResolvedCanvasHeadlessAuthoringTarget;
  readonly uri: vscode.Uri;
  readonly canvasData: CanvasData;
}

export class CanvasProjectAuthoringService implements CanvasWorkspaceBoardMutationPort {
  private readonly projectFileAdapter = createVSCodeProjectFileIoAdapter({ vscodeApi: vscode });
  private readonly projectFileStore: ProjectFileStore;

  constructor(private readonly options: CanvasProjectAuthoringServiceOptions) {
    this.projectFileStore = new ProjectFileStore({
      registry: createNkcProjectFormatCodecRegistry(),
      fileOps: this.projectFileAdapter.fileOps,
      resolveAuthorizedWrite: options.resolveAuthorizedWrite,
      logger: options.logger,
    });
  }

  async loadLatest(input: {
    readonly documentUri: string;
    readonly createIfMissing: boolean;
  }): Promise<CanvasWorkspaceBoardLoadedDocument> {
    const uri = vscode.Uri.parse(input.documentUri);
    assertCanvasDocumentUri(uri);
    const openSnapshot = this.options.canvasEditorProvider.getOpenCanvasDocumentSnapshot?.(
      uri.toString(),
    );
    if (openSnapshot) {
      if (openSnapshot.dirty) {
        throw new Error(
          `projection-conflict: Canvas document ${input.documentUri} has unsaved editor changes.`,
        );
      }
      return {
        documentUri: uri.toString(),
        canvasData: openSnapshot.canvasData,
        revision: createCanvasWorkspaceBoardRevision(openSnapshot.canvasData),
        exists: true,
      };
    }
    try {
      await vscode.workspace.fs.stat(uri);
    } catch (error) {
      if (!isFileNotFound(error)) throw error;
      if (!input.createIfMissing) {
        throw new Error(`Canvas document ${input.documentUri} does not exist.`);
      }
      const canvasData = createEmptyCanvasData('Workspace');
      return {
        documentUri: uri.toString(),
        canvasData,
        revision: createCanvasWorkspaceBoardRevision(canvasData),
        exists: false,
      };
    }
    const loaded = await this.projectFileStore.load<CanvasData>({
      filePath: uri.fsPath,
      formatId: 'nkc',
      sourcePolicy: nkcSourcePathPolicy,
      sourcePolicyOptions: {
        context: this.createCanvasProjectFileContext(uri),
      },
    });
    if (!loaded.ok || !loaded.document) {
      throw new Error(
        `Failed to load Canvas document ${uri.toString()}: ${formatDiagnostics(
          loaded.diagnostics,
        )}`,
      );
    }
    return {
      documentUri: uri.toString(),
      canvasData: loaded.document,
      revision: createCanvasWorkspaceBoardRevision(loaded.document),
      exists: true,
    };
  }

  async saveAtomic(input: {
    readonly documentUri: string;
    readonly expectedRevision: string;
    readonly canvasData: CanvasData;
    readonly assertWriter?: () => Promise<void>;
  }): Promise<{ readonly revision: string }> {
    const loaded = await this.loadLatest({
      documentUri: input.documentUri,
      createIfMissing: true,
    });
    if (loaded.revision !== input.expectedRevision) {
      throw new Error(
        `stale-revision: expected Canvas revision ${input.expectedRevision}, received ${loaded.revision}.`,
      );
    }
    const uri = vscode.Uri.parse(input.documentUri);
    assertNoRuntimeResourceIdentity(input.canvasData, 'canvasData');
    await input.assertWriter?.();
    await this.saveCanvasData(uri, input.canvasData);
    await this.options.canvasEditorProvider.applyHostCanvasData(uri, input.canvasData);
    return { revision: createCanvasWorkspaceBoardRevision(input.canvasData) };
  }

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
    readonly asset: unknown;
    readonly target?: CanvasHeadlessAuthoringTarget;
    readonly fallbackTitle?: string;
  }): Promise<CanvasImportAssetResult & { readonly projectRef: QualityProjectRef }> {
    const asset = requireReferencedCanvasImportAsset(input.asset);
    const mediaType = asset.type;
    const result = await this.createNode({
      target: asset.target ?? input.target,
      fallbackTitle: input.fallbackTitle ?? createImportedAssetCanvasTitle(asset),
      node: {
        type: 'media',
        position: asset.position,
        data: this.createImportedAssetNodeData(asset, mediaType),
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

  private async withMutation<TResult extends CanvasHeadlessAuthoringResultBase>(
    target: CanvasHeadlessAuthoringTarget | undefined,
    fallbackTitle: string | undefined,
    mutate: (canvasData: CanvasData) => {
      readonly canvasData: CanvasData;
      readonly result: TResult;
    },
  ): Promise<TResult & { readonly projectRef: QualityProjectRef }> {
    const loaded = await this.loadTarget(target, fallbackTitle);
    const mutation = mutate(loaded.canvasData);
    assertNoRuntimeResourceIdentity(mutation.canvasData, 'canvasData');
    if (mutation.canvasData !== loaded.canvasData) {
      await this.saveCanvasData(loaded.uri, mutation.canvasData);
      await this.options.canvasEditorProvider.applyHostCanvasData(loaded.uri, mutation.canvasData);
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
    await this.options.canvasEditorProvider.applyHostCanvasData(uri, canvasData);
  }

  private createImportedAssetNodeData(
    asset: CanvasImportAssetRequest,
    mediaType: CanvasImportAssetResult['mediaType'],
  ): Record<string, unknown> {
    return {
      contentLocator: asset.contentLocator,
      mediaType,
      ...(asset.name ? { title: asset.name } : {}),
    };
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

function createImportedAssetCanvasTitle(asset: CanvasImportAssetRequest): string {
  const sourcePath = canvasImportLocatorPath(asset.contentLocator);
  const sourceTitle =
    (asset.name ? path.parse(asset.name).name : '') ||
    (sourcePath ? path.parse(sourcePath).name : '') ||
    'Agent Canvas';
  return sanitizeCanvasFileName(sourceTitle).slice(0, 80) || 'Agent Canvas';
}

function requireReferencedCanvasImportAsset(value: unknown): CanvasImportAssetRequest {
  if (!isRecord(value)) {
    throw new Error('canvas-material-content-locator-required: Canvas import request is invalid.');
  }
  const allowedKeys = new Set(['contentLocator', 'type', 'name', 'target', 'position']);
  const unsupportedKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unsupportedKey) {
    throw new Error(
      `legacy-canvas-import-field-forbidden: Canvas import field ${unsupportedKey} is not part of canonical ContentLocator authoring.`,
    );
  }
  const locator = validateContentLocator(value['contentLocator']);
  if (!locator.ok) {
    throw new Error(
      'canvas-material-content-locator-required: Canvas import requires a validated ContentLocator.',
    );
  }
  if (locator.locator.kind === 'generated-output') {
    throw new Error(
      'canvas-generation-evidence-required: Generated output must use owner-committed projection with immutable Generation Job evidence.',
    );
  }
  const mediaType = value['type'];
  if (mediaType !== 'image' && mediaType !== 'video' && mediaType !== 'audio') {
    throw new Error('canvas-material-media-type-required: Canvas import media type is invalid.');
  }
  const name = value['name'];
  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    throw new Error(
      'canvas-material-title-invalid: Canvas import title must be a non-empty string.',
    );
  }
  const target = readCanvasImportTarget(value['target']);
  const position = readCanvasImportPosition(value['position']);
  return {
    contentLocator: locator.locator,
    type: mediaType,
    ...(name !== undefined ? { name } : {}),
    ...(target ? { target } : {}),
    ...(position ? { position } : {}),
  };
}

function canvasImportLocatorPath(
  locator: CanvasImportAssetRequest['contentLocator'],
): string | undefined {
  switch (locator.kind) {
    case 'workspace-file':
      return locator.path;
    case 'document-entry':
      return locator.entryPath;
    case 'package-resource':
      return locator.resourcePath;
  }
}

function readCanvasImportTarget(value: unknown): CanvasHeadlessAuthoringTarget | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error('canvas-material-target-invalid: Canvas import target is invalid.');
  }
  const allowedKeys = new Set(['kind', 'documentUri', 'title', 'reveal', 'expectedRevision']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error(
      'canvas-material-target-invalid: Canvas import target contains unknown fields.',
    );
  }
  const kind = value['kind'];
  const documentUri = value['documentUri'];
  const title = value['title'];
  const reveal = value['reveal'];
  const expectedRevision = value['expectedRevision'];
  if (kind !== undefined && kind !== 'active' && kind !== 'file' && kind !== 'new') {
    throw new Error('canvas-material-target-invalid: Canvas import target kind is invalid.');
  }
  if (documentUri !== undefined && typeof documentUri !== 'string') {
    throw new Error('canvas-material-target-invalid: Canvas import document URI is invalid.');
  }
  if (title !== undefined && typeof title !== 'string') {
    throw new Error('canvas-material-target-invalid: Canvas import target title is invalid.');
  }
  if (reveal !== undefined && typeof reveal !== 'boolean') {
    throw new Error('canvas-material-target-invalid: Canvas import reveal flag is invalid.');
  }
  if (expectedRevision !== undefined && typeof expectedRevision !== 'string') {
    throw new Error('canvas-material-target-invalid: Canvas import expected revision is invalid.');
  }
  return {
    ...(kind !== undefined ? { kind } : {}),
    ...(documentUri !== undefined ? { documentUri } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(reveal !== undefined ? { reveal } : {}),
    ...(expectedRevision !== undefined ? { expectedRevision } : {}),
  };
}

function readCanvasImportPosition(
  value: unknown,
): CanvasImportAssetRequest['position'] | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => key !== 'x' && key !== 'y') ||
    typeof value['x'] !== 'number' ||
    !Number.isFinite(value['x']) ||
    typeof value['y'] !== 'number' ||
    !Number.isFinite(value['y'])
  ) {
    throw new Error('canvas-material-position-invalid: Canvas import position is invalid.');
  }
  return { x: value['x'], y: value['y'] };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
