import * as vscode from 'vscode';
import { resolveNekoExtension } from '@neko/shared/vscode/extension';
import * as path from 'node:path';
import {
  buildRuntimePluginsAvailableMessage,
  expandRuntimePluginTransferInputs,
} from '@neko/agent/runtime';
import {
  buildNekoSuitePluginTransferPlan,
  executeNekoSuitePluginTransferPlan,
} from './plugin-transfer';
import type { PluginTransferAssetRef, PluginTransferPayload } from '@neko-agent/types';
import {
  PathResolver,
  isPrivateCachePath,
  type ContentIngestResult,
  type ResourceRef,
} from '@neko/shared';
import {
  createHostContentAccessRuntime,
  createGeneratedAssetResourceRef,
  type ContentIngestService,
} from '@neko/shared/vscode/extension';
import { getLogger, handleError } from '../base';

const logger = getLogger('PluginTransferBridge');
const CANVAS_TARGET = 'canvas';

export interface PluginTransferBridgeResult {
  readonly success: boolean;
  readonly executed: number;
  readonly results: unknown[];
  readonly unsupported: Array<{ target: string; reason?: string }>;
  readonly error?: string;
}

export interface PluginTransferBridgeDeps {
  readonly workspaceRoot?: string;
  readonly ingestService?: ContentIngestService;
  readonly pathResolver?: PathResolver;
  readonly executeCommand?: typeof vscode.commands.executeCommand;
}

/**
 * Dispatch a generated asset to another neko-suite plugin.
 *
 * This is an Extension-host bridge because it calls VSCode commands exposed by
 * sibling extensions. The webview and agent only deal with target identifiers
 * and asset paths.
 */
export async function sendGeneratedAssetToPlugin(
  target: string,
  assetPath?: string,
  mediaType?: string,
  payload?: PluginTransferPayload,
  deps: PluginTransferBridgeDeps = {},
): Promise<PluginTransferBridgeResult> {
  const results: unknown[] = [];
  const unsupported: PluginTransferBridgeResult['unsupported'] = [];
  try {
    const initialPayload =
      payload ??
      (target === CANVAS_TARGET && assetPath
        ? {
            kind: 'singleAsset' as const,
            asset: {
              path: assetPath,
              ...(toPluginTransferMediaType(mediaType)
                ? { mediaType: toPluginTransferMediaType(mediaType) }
                : {}),
            },
          }
        : undefined);
    const materializedPayload = await prepareTransferPayload(target, initialPayload, deps);
    const inputs = expandRuntimePluginTransferInputs({
      target,
      assetPath: initialPayload ? undefined : assetPath,
      mediaType,
      payload: materializedPayload,
    });
    const executeCommand = deps.executeCommand ?? vscode.commands.executeCommand;

    for (const input of inputs) {
      const plan = buildNekoSuitePluginTransferPlan(input);
      const execution = await executeNekoSuitePluginTransferPlan(
        plan,
        {
          client: 'vscode',
          executeCommand: async (command, commandPayload) =>
            await executeCommand(command, commandPayload),
          revealFile: async (filePath) =>
            await executeCommand('revealFileInOS', vscode.Uri.file(filePath)),
        },
        { target: input.target },
      );
      results.push(...execution.results);
      unsupported.push(...execution.unsupported);
      for (const item of execution.unsupported) {
        logger.warn(`Unsupported sendToPlugin target: ${item.target}`, { reason: item.reason });
      }
    }
    return {
      success: unsupported.length === 0,
      executed: results.length,
      results,
      unsupported,
    };
  } catch (err) {
    logger.error(`Failed to send to ${target}:`, err);
    void handleError(
      err instanceof Error
        ? err
        : new Error(`Failed to send to ${target}. Is the extension installed?`),
      { showToUser: true, severity: 'warning' },
    );
    return {
      success: false,
      executed: results.length,
      results,
      unsupported,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function postPluginsAvailable(webview: vscode.Webview): void {
  webview.postMessage(
    buildRuntimePluginsAvailableMessage({
      hasExtension: (extensionId) =>
        Boolean(resolveNekoExtension(extensionId, (id) => vscode.extensions.getExtension(id))),
    }),
  );
}

async function prepareTransferPayload(
  target: string,
  payload: PluginTransferPayload | undefined,
  deps: PluginTransferBridgeDeps,
): Promise<PluginTransferPayload | undefined> {
  if (target !== CANVAS_TARGET || !payload) return payload;

  if (payload.kind === 'singleAsset') {
    const materialized = await materializeCanvasGeneratedOutput(payload.asset, deps);
    if (!materialized && requiresCanvasOutputMaterialization(payload.asset, deps)) {
      throw new Error(
        'generated-output-persistence-failed: Canvas handoff requires a stable generated-output reference.',
      );
    }
    return materialized ? { ...payload, asset: materialized } : payload;
  }

  if (payload.kind === 'assetBatch') {
    const assets = await Promise.all(
      payload.assets.map(async (asset) => {
        const materialized = await materializeCanvasGeneratedOutput(asset, deps);
        if (!materialized && requiresCanvasOutputMaterialization(asset, deps)) {
          throw new Error(
            'generated-output-persistence-failed: Canvas handoff requires a stable generated-output reference.',
          );
        }
        return materialized ?? asset;
      }),
    );
    return { ...payload, assets };
  }

  return payload;
}

async function materializeCanvasGeneratedOutput(
  asset: PluginTransferAssetRef,
  deps: PluginTransferBridgeDeps,
): Promise<PluginTransferAssetRef | undefined> {
  if (asset.documentResourceRef) {
    return undefined;
  }
  if (asset.resourceRef && !isCacheBackedGeneratedResourceRef(asset.resourceRef, deps)) {
    return undefined;
  }
  if (!asset.path || !isPromotableLocalPath(asset.path)) return undefined;

  const workspaceRoot = deps.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    logger.warn('Unable to materialize generated output before Canvas transfer: workspace missing');
    return undefined;
  }

  const ingestService =
    deps.ingestService ?? createGeneratedOutputIngestService(workspaceRoot, deps.pathResolver);
  const generatedDir = path.join(workspaceRoot, 'neko', 'generated', mediaDir(asset));
  const result = await ingestService.ingest({
    mode: 'generated-output',
    sourcePath: asset.path,
    destination: {
      kind: 'generated-assets',
      directory: generatedDir,
    },
    fileName: asset.name ?? path.basename(asset.path),
    mimeType: mimeTypeForAsset(asset),
    caller: 'neko-agent.plugin-transfer',
    prewarm: [{ role: 'preview', mimeType: mimeTypeForAsset(asset) }],
    metadata: {
      assetId: assetIdForGeneratedAsset(asset),
      sourcePath: asset.path,
      mediaType: asset.mediaType,
      provenance: asset.provenance,
    },
  });

  if (result.status !== 'ready' || !result.outputPath) {
    logger.warn('Unable to materialize generated output before Canvas transfer', {
      status: result.status,
      error: result.error,
    });
    return undefined;
  }

  return {
    ...asset,
    path: result.outputPath,
    resourceRef: createMaterializedGeneratedResourceRef(asset, result),
  };
}

function requiresCanvasOutputMaterialization(
  asset: PluginTransferAssetRef,
  deps: PluginTransferBridgeDeps,
): boolean {
  if (asset.documentResourceRef) return false;
  if (asset.resourceRef && !isCacheBackedGeneratedResourceRef(asset.resourceRef, deps)) {
    return false;
  }
  return Boolean(asset.path && isPromotableLocalPath(asset.path));
}

function isCacheBackedGeneratedResourceRef(
  resourceRef: ResourceRef,
  deps: PluginTransferBridgeDeps,
): boolean {
  if (resourceRef.provider !== 'generated-asset' || resourceRef.source.kind !== 'generated-asset') {
    return false;
  }
  const filePath = resourceRef.source.filePath;
  return (
    typeof filePath === 'string' &&
    isPrivateCachePath(filePath, {
      projectRoot: deps.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    })
  );
}

function createGeneratedOutputIngestService(
  workspaceRoot: string,
  pathResolver = createWorkspacePathResolver(workspaceRoot),
): ContentIngestService {
  return createHostContentAccessRuntime({
    workspaceRoot,
    sourceFileProvider: { enabled: false },
    documentEntryProvider: { enabled: false },
    ingest: {
      pathResolver,
      projectRoot: workspaceRoot,
      includeImportSource: false,
      includeRegisterExistingSource: false,
      includeExportStaging: false,
      includeCacheArtifact: false,
      guardOptions: {
        projectRoot: workspaceRoot,
      },
    },
  }).contentIngest;
}

function createWorkspacePathResolver(workspaceRoot: string): PathResolver {
  return new PathResolver(
    new Map([
      ['WORKSPACE', workspaceRoot],
      ['PROJECT', workspaceRoot],
    ]),
  );
}

function createMaterializedGeneratedResourceRef(
  asset: PluginTransferAssetRef,
  result: ContentIngestResult,
): ResourceRef {
  return createGeneratedAssetResourceRef({
    assetId: readGeneratedAssetId(result, asset),
    path:
      result.contractedPath ?? result.outputPath ?? asset.path ?? assetIdForGeneratedAsset(asset),
    mimeType: mimeTypeForAsset(asset),
    scope: 'project',
  });
}

function readGeneratedAssetId(result: ContentIngestResult, asset: PluginTransferAssetRef): string {
  const source = result.source;
  if (source?.kind === 'generated-asset') return source.assetId;
  return assetIdForGeneratedAsset(asset);
}

function assetIdForGeneratedAsset(asset: PluginTransferAssetRef): string {
  const base = asset.name ?? (asset.path ? path.basename(asset.path) : 'generated-asset');
  return base.replace(/\.[^.]+$/, '') || 'generated-asset';
}

function mediaDir(asset: PluginTransferAssetRef): string {
  if (asset.mediaType === 'video') return 'video';
  if (asset.mediaType === 'audio') return 'audio';
  if (asset.mediaType === 'model') return 'model';
  return 'image';
}

function mimeTypeForAsset(asset: PluginTransferAssetRef): string | undefined {
  const assetPath = asset.path ?? '';
  if (asset.mediaType === 'image') return mimeTypeFromExtension(assetPath) ?? 'image/png';
  if (asset.mediaType === 'video') return mimeTypeFromExtension(assetPath) ?? 'video/mp4';
  if (asset.mediaType === 'audio') return mimeTypeFromExtension(assetPath) ?? 'audio/mpeg';
  return mimeTypeFromExtension(assetPath);
}

function mimeTypeFromExtension(assetPath: string): string | undefined {
  const ext = path.extname(assetPath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.ogg') return 'audio/ogg';
  return undefined;
}

function toPluginTransferMediaType(
  value: string | undefined,
): PluginTransferAssetRef['mediaType'] | undefined {
  return value === 'image' || value === 'video' || value === 'audio' || value === 'model'
    ? value
    : undefined;
}

function isPromotableLocalPath(value: string | undefined): value is string {
  if (!value) return false;
  if (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('blob:') ||
    value.startsWith('data:') ||
    value.startsWith('vscode-resource:') ||
    value.startsWith('vscode-webview-resource:')
  ) {
    return false;
  }
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}
