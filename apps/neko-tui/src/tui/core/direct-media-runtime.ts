import os from 'node:os';
import { ToolRegistry } from '@neko/agent';
import {
  createPersistentGenerationJobStore,
  GENERATION_JOB_MIGRATIONS,
  GenerationJobCoordinator,
} from '@neko/generation';
import { createCLIPlatform } from './platform-bootstrap';
import type { DirectMediaCommandRuntime } from './direct-media-command';
import { createTuiLocalMetadataBinding } from '../host/tui-local-metadata-binding';
import { NodeMediaGenerationDeliveryHost } from '../host/node-media-generation-delivery-host';
import {
  createNodeGeneratedAssetIndexBinding,
  type NodeGeneratedAssetIndexBinding,
} from '../host/node-generated-asset-index';

export interface DirectMediaRuntimeBinding {
  readonly runtime: DirectMediaCommandRuntime;
  readonly dispose: () => Promise<void>;
}

export async function createDirectMediaRuntime(input: {
  readonly workDir: string;
  readonly localMetadataHome?: string;
}): Promise<DirectMediaRuntimeBinding> {
  const homedir = input.localMetadataHome ?? os.homedir();
  const storage = await createTuiLocalMetadataBinding({
    homedir,
    workDir: input.workDir,
  });
  let platformResult: ReturnType<typeof createCLIPlatform> | undefined;
  let deliveryHost: NodeMediaGenerationDeliveryHost | undefined;
  let coordinator: GenerationJobCoordinator | undefined;
  let generatedAssetBinding: NodeGeneratedAssetIndexBinding | undefined;
  try {
    generatedAssetBinding = await createNodeGeneratedAssetIndexBinding({
      workspaceRoot: input.workDir,
      homedir,
    });
    if (generatedAssetBinding.migrationReport.sourceStatus === 'quarantined') {
      throw new Error(
        `Generated asset index was quarantined: ${generatedAssetBinding.migrationReport.sourceDiagnostic ?? 'invalid index'}`,
      );
    }
    const generatedAssets = generatedAssetBinding.index;
    platformResult = createCLIPlatform({
      workspacePath: input.workDir,
      toolRegistry: new ToolRegistry(),
    });
    const media = platformResult.platform.media;
    const createdDeliveryHost = new NodeMediaGenerationDeliveryHost({
      workspaceRoot: input.workDir,
      workspaceId: storage.workspaceId,
      metadataStore: storage.metadataStore,
      assetIndex: generatedAssets,
    });
    deliveryHost = createdDeliveryHost;
    await storage.metadataStore.migrateNamespace(GENERATION_JOB_MIGRATIONS);
    const createdCoordinator = new GenerationJobCoordinator({
      store: createPersistentGenerationJobStore({
        metadataStore: storage.metadataStore,
        workspaceId: storage.workspaceId,
      }),
      execution: media,
      resultCommitter: {
        commit: async ({ ref, generation }) => {
          const delivery = await createdDeliveryHost.deliverMediaGeneration({
            result: generation,
            operationId: ref.jobId,
          });
          return delivery.resourceRefs;
        },
      },
    });
    coordinator = createdCoordinator;
    await createdCoordinator.recoverPersistedGenerationJobs();
    return {
      runtime: {
        submitGeneration: (generation) => createdCoordinator.submitGeneration(generation),
        observeGeneration: (ref, afterRevision) =>
          createdCoordinator.observeGeneration(ref, afterRevision),
        describeGeneration: (ref) => createdCoordinator.describeGeneration(ref),
        cancelGeneration: (command) => createdCoordinator.cancelGeneration(command),
        retryGeneration: (command) => createdCoordinator.retryGeneration(command),
        reconcileGeneration: (command) => createdCoordinator.reconcileGeneration(command),
      },
      dispose: async () => {
        const errors = await disposeDirectMediaResources({
          coordinator,
          deliveryHost,
          platformResult,
          generatedAssetBinding,
          storage,
        });
        if (errors.length > 0) {
          throw new AggregateError(errors, 'Direct media runtime disposal failed.');
        }
      },
    };
  } catch (error) {
    const disposalErrors = await disposeDirectMediaResources({
      coordinator,
      deliveryHost,
      platformResult,
      generatedAssetBinding,
      storage,
    });
    if (disposalErrors.length > 0) {
      throw new AggregateError(
        [error, ...disposalErrors],
        'Direct media runtime initialization and cleanup failed.',
      );
    }
    throw error;
  }
}

async function disposeDirectMediaResources(input: {
  readonly coordinator?: GenerationJobCoordinator;
  readonly deliveryHost?: NodeMediaGenerationDeliveryHost;
  readonly platformResult?: ReturnType<typeof createCLIPlatform>;
  readonly generatedAssetBinding?: NodeGeneratedAssetIndexBinding;
  readonly storage: Awaited<ReturnType<typeof createTuiLocalMetadataBinding>>;
}): Promise<unknown[]> {
  const errors: unknown[] = [];
  try {
    await input.coordinator?.dispose();
  } catch (error) {
    errors.push(error);
  }
  try {
    input.deliveryHost?.dispose();
  } catch (error) {
    errors.push(error);
  }
  try {
    input.platformResult?.platform.dispose();
  } catch (error) {
    errors.push(error);
  }
  try {
    await input.generatedAssetBinding?.dispose();
  } catch (error) {
    errors.push(error);
  }
  try {
    await input.storage.dispose();
  } catch (error) {
    errors.push(error);
  }
  return errors;
}
