import * as fs from 'node:fs/promises';
import { rmSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ModelPreviewSourceDescriptor, PathResolver } from '@neko/shared';
import {
  createExtensionAssetLocalResourceRootProvider,
  createStaticLocalResourceRootProvider,
  VSCodeLocalResourceAccessService,
  type LocalResourceAccessService,
} from '@neko/shared/vscode/extension';
import {
  inspectModelSource,
  ModelSourceInspectionError,
  type InspectModelSourceInput,
  type ModelSourceFileSystem,
  type ModelSourceLimits,
} from './modelSourceInspection';

export interface OpenModelPreviewSourceSessionInput {
  readonly sessionId: string;
  readonly sourcePath: string;
  readonly projectionRoot: string;
  readonly webview: vscode.Webview;
  readonly extensionUri: vscode.Uri;
  readonly authorization: LocalResourceAccessService;
  readonly authorizedRoots: readonly string[];
  readonly workspaceRoot?: string;
  readonly pathResolver?: PathResolver;
  readonly declaredMimeType?: string;
  readonly limits?: Partial<ModelSourceLimits>;
  readonly fileSystem?: ModelSourceFileSystem;
  readonly signal?: AbortSignal;
  readonly projectionFileSystem?: ModelPreviewProjectionFileSystem;
}

export interface ModelPreviewProjectionFileSystem {
  prepare(rootPath: string): Promise<void>;
  copyFile(sourcePath: string, targetPath: string): Promise<void>;
  remove(rootPath: string): void;
}

export class ModelPreviewSourceSession implements vscode.Disposable {
  readonly sessionId: string;
  readonly descriptor: ModelPreviewSourceDescriptor;

  private readonly webview: vscode.Webview;
  private readonly abortController: AbortController;
  private readonly projectionRoot: string;
  private readonly projectionFileSystem: ModelPreviewProjectionFileSystem;
  private disposed = false;

  private constructor(input: {
    readonly sessionId: string;
    readonly descriptor: ModelPreviewSourceDescriptor;
    readonly webview: vscode.Webview;
    readonly abortController: AbortController;
    readonly projectionRoot: string;
    readonly projectionFileSystem: ModelPreviewProjectionFileSystem;
  }) {
    this.sessionId = input.sessionId;
    this.descriptor = input.descriptor;
    this.webview = input.webview;
    this.abortController = input.abortController;
    this.projectionRoot = input.projectionRoot;
    this.projectionFileSystem = input.projectionFileSystem;
  }

  static async open(input: OpenModelPreviewSourceSessionInput): Promise<ModelPreviewSourceSession> {
    if (!input.sessionId) {
      throw new Error('Model Preview source session requires a non-empty sessionId.');
    }
    const abortController = new AbortController();
    const projectionFileSystem = input.projectionFileSystem ?? NODE_PROJECTION_FILE_SYSTEM;
    const removeExternalAbort = forwardAbort(input.signal, abortController);
    try {
      if (!(await input.authorization.isAuthorizedPath(input.sourcePath))) {
        throw new ModelSourceInspectionError({
          code: 'source-unauthorized',
          message: 'Model source is outside the configured content-access roots.',
          severity: 'error',
        });
      }
      const inspectionInput: InspectModelSourceInput = {
        sourcePath: input.sourcePath,
        authorizedRoots: input.authorizedRoots,
        signal: abortController.signal,
        ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
        ...(input.pathResolver ? { pathResolver: input.pathResolver } : {}),
        ...(input.declaredMimeType ? { declaredMimeType: input.declaredMimeType } : {}),
        ...(input.limits ? { limits: input.limits } : {}),
        ...(input.fileSystem ? { fileSystem: input.fileSystem } : {}),
      };
      const inspected = await inspectModelSource(inspectionInput);
      await projectionFileSystem.prepare(input.projectionRoot);
      const projectedDependencies: Array<{
        readonly dependency: (typeof inspected.dependencies)[number];
        readonly projectedPath: string;
      }> = [];
      for (const [index, dependency] of inspected.dependencies.entries()) {
        abortController.signal.throwIfAborted();
        const projectedPath = path.join(
          input.projectionRoot,
          `${String(index).padStart(3, '0')}-${path.basename(dependency.filePath)}`,
        );
        await projectionFileSystem.copyFile(dependency.filePath, projectedPath);
        abortController.signal.throwIfAborted();
        projectedDependencies.push({ dependency, projectedPath });
      }
      const exactProjection = new VSCodeLocalResourceAccessService({
        rootProviders: [
          createExtensionAssetLocalResourceRootProvider(input.extensionUri, 'dist', 'webview'),
          createStaticLocalResourceRootProvider(`model-preview:${input.sessionId}`, 'feature', [
            vscode.Uri.file(input.projectionRoot),
          ]),
        ],
      });
      await exactProjection.configureWebview(input.webview, { enableScripts: true });
      const uriMap: Record<string, string> = {};
      let entryUri: string | undefined;
      for (const { dependency, projectedPath } of projectedDependencies) {
        abortController.signal.throwIfAborted();
        const projection = await exactProjection.toWebviewUri(input.webview, projectedPath, {
          caller: `model-preview:${input.sessionId}`,
        });
        if (!projection.ok || projection.kind !== 'local') {
          throw new ModelSourceInspectionError({
            code: 'source-unauthorized',
            message: `Unable to project model dependency: ${dependency.reference}`,
            severity: 'error',
          });
        }
        uriMap[dependency.reference] = projection.uri;
        if (dependency.role === 'primary') entryUri = projection.uri;
      }
      if (!entryUri) {
        throw new Error('Model Preview inspection returned no primary source.');
      }
      return new ModelPreviewSourceSession({
        sessionId: input.sessionId,
        webview: input.webview,
        abortController,
        projectionRoot: input.projectionRoot,
        projectionFileSystem,
        descriptor: {
          source: inspected.sourceRef,
          sourceFingerprint: inspected.sourceFingerprint,
          format: inspected.format,
          entryUri,
          uriMap,
          sizeBytes: inspected.totalSizeBytes,
        },
      });
    } catch (error) {
      abortController.abort(error);
      projectionFileSystem.remove(input.projectionRoot);
      input.webview.options = { ...input.webview.options, localResourceRoots: [] };
      throw error;
    } finally {
      removeExternalAbort();
    }
  }

  assertLive(sessionId: string, sourceFingerprint: string): void {
    if (this.disposed) {
      throw new ModelSourceInspectionError({
        code: 'disposed',
        message: 'Model Preview source session is disposed.',
        severity: 'error',
      });
    }
    if (sessionId !== this.sessionId || sourceFingerprint !== this.descriptor.sourceFingerprint) {
      throw new ModelSourceInspectionError({
        code: 'session-mismatch',
        message: 'Model Preview source session identity does not match.',
        severity: 'error',
      });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abortController.abort(new Error('Model Preview source session disposed.'));
    this.webview.options = { ...this.webview.options, localResourceRoots: [] };
    this.projectionFileSystem.remove(this.projectionRoot);
  }
}

const NODE_PROJECTION_FILE_SYSTEM: ModelPreviewProjectionFileSystem = {
  async prepare(rootPath) {
    await fs.rm(rootPath, { recursive: true, force: true });
    await fs.mkdir(rootPath, { recursive: true });
  },
  async copyFile(sourcePath, targetPath) {
    await fs.copyFile(sourcePath, targetPath);
  },
  remove(rootPath) {
    rmSync(rootPath, { recursive: true, force: true });
  },
};

function forwardAbort(signal: AbortSignal | undefined, controller: AbortController): () => void {
  if (!signal) return () => {};
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) {
    abort();
    return () => {};
  }
  signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}
