import os from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { ToolRegistry } from '@neko/agent';
import {
  createPersistentGenerationJobStore,
  createPurposeGenerationJobPort,
  GENERATION_JOB_MIGRATIONS,
  GenerationJobCoordinator,
  type GenerationJobPort,
  type MediaGenerationResult,
  type PurposeGenerationJobPort,
} from '@neko/generation';
import {
  buildMediaGenerationDeliverySettingsPlan,
  createContentReadMediaRequestAssetMaterializer,
  createPlatform,
  DEFAULT_MEDIA_GENERATION_CONFIGURED_OUTPUT_DIR,
  FileUserConfigManager,
  finalizeMediaGenerationOutputs,
  GeneratedAssetIndex,
  MEDIA_GENERATION_DELIVERY_CONFIG_SECTION,
  MEDIA_GENERATION_OUTPUT_DIR_SETTING_KEY,
  migrateLegacyGeneratedAssetIndex,
  registerMediaAgentTools,
  type GeneratedAssetCatalog,
  type Platform,
} from '@neko/platform';
import type { GeneratedMediaKind } from '@neko/platform/media/media-generated-asset';
import {
  PathResolver,
  contentLocatorsEqual,
  resolveWorkspaceGeneratedAssetRelativeDirectory,
  type GeneratedOutputContentLocator,
  type GeneratedAsset,
  type LocalMetadataStore,
} from '@neko/shared';
import { createNodeHostContentReadService } from '@neko/shared/content-access';
import {
  createNodeWorkspaceResourceCacheMetadataBinding,
  LocalMetadataGeneratedOutputProjectionStore,
  type GeneratedOutputProjectionRejection,
} from '@neko/shared/local-metadata/node';

export interface OpenNekoAiHostServices {
  readonly platform: Platform;
  readonly toolRegistry: ToolRegistry;
  readonly generationJobs?: GenerationJobPort;
  readonly purposeGenerationJobs?: PurposeGenerationJobPort;
  readonly generatedAssets?: GeneratedAssetCatalog;
  readonly resolveGenerationResult?: (locator: GeneratedOutputContentLocator) => {
    readonly path: string;
    readonly asset: GeneratedAsset;
  };
  readonly resolveGenerationResultPath?: (locator: GeneratedOutputContentLocator) => string;
  readonly localMetadata?: {
    readonly metadataStore: LocalMetadataStore;
    readonly workspaceId: string;
  };
}

export interface OpenNekoAiHostRuntime {
  readonly services: OpenNekoAiHostServices;
  dispose(): Promise<void>;
}

export async function createOpenNekoAiHostRuntime(): Promise<OpenNekoAiHostRuntime> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const toolRegistry = new ToolRegistry();
  const platform = createPlatform({
    toolRegistry,
    userConfigManager: new FileUserConfigManager(),
    ...(workspaceRoot ? { workspacePath: workspaceRoot } : {}),
    ...(workspaceRoot
      ? {
          requestAssetMaterializer: createContentReadMediaRequestAssetMaterializer({
            contentRead: createNodeHostContentReadService({ workspaceRoot }),
            encodeBase64: (bytes) => Buffer.from(bytes).toString('base64'),
          }),
        }
      : {}),
  });
  if (!workspaceRoot) {
    return {
      services: { platform, toolRegistry },
      dispose: async () => {
        platform.dispose();
      },
    };
  }

  const metadata = await createNodeWorkspaceResourceCacheMetadataBinding({
    homedir: os.homedir(),
    workDir: workspaceRoot,
  });
  try {
    await metadata.metadataStore.migrateNamespace(GENERATION_JOB_MIGRATIONS);
    const rejectedGeneratedOutputProjections = new Map<
      string,
      GeneratedOutputProjectionRejection
    >();
    const generatedAssetStore = new LocalMetadataGeneratedOutputProjectionStore({
      manifestStore: metadata.manifestStore,
      workspaceRoot,
      pathResolver: new PathResolver(
        new Map([
          ['WORKSPACE', workspaceRoot],
          ['HOME', os.homedir()],
        ]),
      ),
      rejectedProjectionPolicy: {
        mode: 'preserve-and-report',
        report: (rejection) => {
          rejectedGeneratedOutputProjections.set(rejection.resourceId, rejection);
        },
      },
    });
    const generatedAssetMigration = await migrateLegacyGeneratedAssetIndex({
      indexPath: path.join(workspaceRoot, 'neko', 'generated', 'index.json'),
      store: generatedAssetStore,
    });
    if (generatedAssetMigration.sourceStatus === 'quarantined') {
      throw new Error(
        `Generated asset index was quarantined: ${generatedAssetMigration.sourceDiagnostic ?? 'invalid index'}`,
      );
    }
    const generatedAssetIndex = new GeneratedAssetIndex(generatedAssetStore);
    await generatedAssetIndex.load();
    reportRejectedGeneratedOutputProjections(rejectedGeneratedOutputProjections.values());
    const coordinator = new GenerationJobCoordinator({
      store: createPersistentGenerationJobStore({
        metadataStore: metadata.metadataStore,
        workspaceId: metadata.workspaceId,
      }),
      execution: platform.media,
      resultCommitter: {
        commit: async ({ ref, generation }) =>
          commitGenerationResult({
            operationId: ref.jobId,
            generation,
            workspaceRoot,
            assetIndex: generatedAssetIndex,
          }),
      },
    });
    const generationJobs: GenerationJobPort = coordinator;
    await coordinator.recoverPersistedGenerationJobs();
    registerMediaAgentTools(toolRegistry, generationJobs);
    const purposeGenerationJobs = createPurposeGenerationJobPort({
      jobs: generationJobs,
      bindings: {
        resolveGenerationBinding: (purpose) => platform.config.resolveModelRefForPurpose(purpose),
      },
    });
    const resolveGenerationResult = (locator: GeneratedOutputContentLocator) => {
      const asset = generatedAssetIndex.get(locator.outputId);
      if (!asset?.lifecycle || !contentLocatorsEqual(asset.lifecycle.contentLocator, locator)) {
        throw new Error(
          `Generation result ${locator.outputId}/${locator.revision} does not match the generated asset index.`,
        );
      }
      return { path: asset.path, asset };
    };
    return {
      services: {
        platform,
        toolRegistry,
        generationJobs,
        purposeGenerationJobs,
        generatedAssets: generatedAssetIndex,
        resolveGenerationResult,
        resolveGenerationResultPath: (ref) => resolveGenerationResult(ref).path,
        localMetadata: {
          metadataStore: metadata.metadataStore,
          workspaceId: metadata.workspaceId,
        },
      },
      dispose: async () => {
        const failures: unknown[] = [];
        try {
          await coordinator.dispose();
        } catch (error) {
          failures.push(error);
        }
        try {
          await metadata.dispose();
        } catch (error) {
          failures.push(error);
        }
        platform.dispose();
        if (failures.length > 0) {
          throw new AggregateError(failures, 'OpenNeko AI Host disposal failed.');
        }
      },
    };
  } catch (error) {
    await metadata.dispose();
    platform.dispose();
    throw error;
  }
}

function reportRejectedGeneratedOutputProjections(
  rejections: Iterable<GeneratedOutputProjectionRejection>,
): void {
  const rejected = [...rejections];
  if (rejected.length === 0) return;
  const count = rejected.length;
  const visibleResourceIds = rejected.slice(0, 3).map(({ resourceId }) => resourceId);
  const hiddenCount = count - visibleResourceIds.length;
  const resourceSummary =
    visibleResourceIds.join(', ') + (hiddenCount > 0 ? `, and ${hiddenCount} more` : '');
  const message =
    `OpenNeko skipped ${count} generated-output index ${count === 1 ? 'record' : 'records'} ` +
    `that require migration (${resourceSummary}). The generated files were preserved, but these ` +
    'outputs are unavailable until they are regenerated or sent through the current path.';
  // User dismissal must not block activation of unrelated embedded features.
  void vscode.window.showWarningMessage(message);
}

async function commitGenerationResult(input: {
  readonly operationId: string;
  readonly generation: MediaGenerationResult;
  readonly workspaceRoot: string;
  readonly assetIndex: GeneratedAssetIndex;
}): Promise<readonly import('@neko/shared').GeneratedOutputContentLocator[]> {
  const mediaKind = toGeneratedMediaKind(input.generation.type);
  const configuredOutputDir = vscode.workspace
    .getConfiguration(MEDIA_GENERATION_DELIVERY_CONFIG_SECTION)
    .get<string>(
      MEDIA_GENERATION_OUTPUT_DIR_SETTING_KEY,
      DEFAULT_MEDIA_GENERATION_CONFIGURED_OUTPUT_DIR,
    );
  const canonicalRoot = path.join(
    input.workspaceRoot,
    resolveWorkspaceGeneratedAssetRelativeDirectory({ mediaKind }),
  );
  const outputDir = resolveConfiguredOutputDir(
    input.workspaceRoot,
    canonicalRoot,
    configuredOutputDir,
  );
  const settings = buildMediaGenerationDeliverySettingsPlan({
    workspaceRoot: input.workspaceRoot,
    defaultOutputDir: canonicalRoot,
    configuredOutputDir: outputDir,
    configuredShowSaveNotification: false,
  });
  if (!settings.outputDir) {
    throw new Error('Generation result commit requires a workspace output directory.');
  }
  const finalized = await finalizeMediaGenerationOutputs({
    workspaceRoot: input.workspaceRoot,
    operationId: input.operationId,
    generationType: input.generation.type,
    mediaKind,
    outputs: input.generation.outputs,
    providerId: input.generation.providerId,
    modelId: input.generation.modelId,
    request: input.generation.request,
    outputDir: settings.outputDir,
    assetIndex: input.assetIndex,
  });
  return finalized.generatedAssets.map((asset) => {
    if (!asset.lifecycle) {
      throw new Error(`Generated asset ${asset.id} has no durable lifecycle.`);
    }
    return asset.lifecycle.contentLocator;
  });
}

function resolveConfiguredOutputDir(
  workspaceRoot: string,
  canonicalRoot: string,
  configuredOutputDir: string,
): string | undefined {
  const trimmed = configuredOutputDir.trim();
  if (!trimmed) return undefined;
  const resolved = path.resolve(workspaceRoot, trimmed);
  const relative = path.relative(canonicalRoot, resolved);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
    ? resolved
    : undefined;
}

function toGeneratedMediaKind(type: string): GeneratedMediaKind {
  if (type.includes('video')) return 'video';
  if (type.includes('audio') || type.includes('music')) return 'audio';
  return 'image';
}
