import os from 'node:os';
import { ToolRegistry } from '@neko/agent';
import {
  createPersistentGenerationJobStore,
  GENERATION_JOB_MIGRATIONS,
  GenerationJobCoordinator,
} from '@neko/generation';
import { createResourceCacheGeneratedAssetIndex } from '@neko/platform';
import type { ResourceCacheManifestStore } from '@neko/shared';
import { createCLIPlatform } from './platform-bootstrap';
import type { DirectMediaCommandRuntime } from './direct-media-command';
import { createTuiLocalMetadataBinding } from '../host/tui-local-metadata-binding';
import { NodeMediaGenerationDeliveryHost } from '../host/node-media-generation-delivery-host';

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
  try {
    const generatedAssets = await createGeneratedAssetIndex(
      storage.resourceCacheManifestStore,
      input.workDir,
      homedir,
    );
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
    await input.storage.dispose();
  } catch (error) {
    errors.push(error);
  }
  return errors;
}

async function createGeneratedAssetIndex(
  manifestStore: ResourceCacheManifestStore,
  workspaceRoot: string,
  homedir: string,
) {
  const binding = await createResourceCacheGeneratedAssetIndex({
    manifestStore,
    workspaceRoot,
    homedir,
  });
  if (binding.migrationReport.sourceStatus === 'quarantined') {
    throw new Error(
      `Generated asset index was quarantined: ${binding.migrationReport.sourceDiagnostic ?? 'invalid index'}`,
    );
  }
  return binding.index;
}
