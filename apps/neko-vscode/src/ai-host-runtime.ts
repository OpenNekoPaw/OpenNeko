import os from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { ToolRegistry } from '@neko/agent';
import {
  createGenerationJobActivityPort,
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
  createPlatform,
  createResourceCacheGeneratedAssetIndex,
  DEFAULT_MEDIA_GENERATION_CONFIGURED_OUTPUT_DIR,
  FileUserConfigManager,
  finalizeMediaGenerationOutputs,
  MEDIA_GENERATION_DELIVERY_CONFIG_SECTION,
  MEDIA_GENERATION_OUTPUT_DIR_SETTING_KEY,
  registerMediaAgentTools,
  type Platform,
} from '@neko/platform';
import type { GeneratedMediaKind } from '@neko/platform/media/media-generated-asset';
import {
  resolveWorkspaceGeneratedAssetRelativeDirectory,
  type GeneratedAsset,
  type LocalMetadataStore,
  type ResourceRef,
} from '@neko/shared';
import { createNodeWorkspaceResourceCacheMetadataBinding } from '@neko/shared/local-metadata/node';
import type { DomainActivityHost } from '@neko/shared/domain-activity';
import { OpenNekoDomainActivityHost } from './domain-activity-host';

export interface OpenNekoAiHostServices {
  readonly platform: Platform;
  readonly toolRegistry: ToolRegistry;
  readonly generationJobs?: GenerationJobPort;
  readonly purposeGenerationJobs?: PurposeGenerationJobPort;
  readonly resolveGenerationResult?: (
    ref: ResourceRef,
  ) => { readonly path: string; readonly asset: GeneratedAsset };
  readonly resolveGenerationResultPath?: (ref: ResourceRef) => string;
  readonly localMetadata?: {
    readonly metadataStore: LocalMetadataStore;
    readonly workspaceId: string;
  };
  readonly domainActivity: DomainActivityHost;
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
  });
  if (!workspaceRoot) {
    const domainActivity = new OpenNekoDomainActivityHost();
    return {
      services: { platform, toolRegistry, domainActivity },
      dispose: async () => {
        domainActivity.dispose();
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
    const generatedAssets = await createResourceCacheGeneratedAssetIndex({
      manifestStore: metadata.manifestStore,
      workspaceRoot,
      homedir: os.homedir(),
    });
    if (generatedAssets.migrationReport.sourceStatus === 'quarantined') {
      throw new Error(
        `Generated asset index was quarantined: ${generatedAssets.migrationReport.sourceDiagnostic ?? 'invalid index'}`,
      );
    }
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
            assetIndex: generatedAssets.index,
          }),
      },
    });
    let generationJobs: ReturnType<typeof createGenerationJobActivityPort> | undefined;
    const domainActivity = new OpenNekoDomainActivityHost(() => generationJobs);
    generationJobs = createGenerationJobActivityPort({
      jobs: coordinator,
      publisher: domainActivity.publisher,
      reportError: (error, ref) => {
        void vscode.window.showErrorMessage(
          `Generation Job ${ref.jobId} activity tracking failed: ${error.message}`,
        );
      },
    });
    const recovered = await coordinator.recoverPersistedGenerationJobs();
    for (const snapshot of recovered) generationJobs.installActivity(snapshot);
    registerMediaAgentTools(toolRegistry, generationJobs);
    const purposeGenerationJobs = createPurposeGenerationJobPort({
      jobs: generationJobs,
      bindings: {
        resolveGenerationBinding: (purpose) =>
          platform.config.resolveModelRefForPurpose(purpose),
      },
    });
    const resolveGenerationResult = (ref: ResourceRef) => {
      if (
        ref.source.kind !== 'generated-asset' ||
        ref.provider !== 'generated-asset'
      ) {
        throw new Error(
          `Generation result ${ref.id} is not a generated-asset ResourceRef.`,
        );
      }
      const asset = generatedAssets.index.get(ref.source.generatedAssetId);
      if (!asset?.lifecycle || asset.lifecycle.resourceRef.id !== ref.id) {
        throw new Error(
          `Generation result ${ref.id} does not match the generated asset index.`,
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
        resolveGenerationResult,
        resolveGenerationResultPath: (ref) => resolveGenerationResult(ref).path,
        localMetadata: {
          metadataStore: metadata.metadataStore,
          workspaceId: metadata.workspaceId,
        },
        domainActivity,
      },
      dispose: async () => {
        const failures: unknown[] = [];
        try {
          await generationJobs.disposeActivity();
        } catch (error) {
          failures.push(error);
        }
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
        domainActivity.dispose();
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

async function commitGenerationResult(input: {
  readonly operationId: string;
  readonly generation: MediaGenerationResult;
  readonly workspaceRoot: string;
  readonly assetIndex: Awaited<
    ReturnType<typeof createResourceCacheGeneratedAssetIndex>
  >['index'];
}): Promise<readonly ResourceRef[]> {
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
    return asset.lifecycle.resourceRef;
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
