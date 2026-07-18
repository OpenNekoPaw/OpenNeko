import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { ToolRegistry } from '@neko/agent';
import {
  createResourceCacheGeneratedAssetIndex,
  submitMediaTurn,
  type MediaTask,
} from '@neko/platform';
import type { ResourceCacheManifestStore } from '@neko/shared';
import { createCLIPlatform, createCLITaskManager } from './platform-bootstrap';
import type {
  DirectMediaCommandRuntime,
  DirectMediaKind,
  DirectMediaModelRef,
} from './direct-media-command';
import { createTuiLocalMetadataBinding } from '../host/tui-local-metadata-binding';
import { NodeMediaTaskDeliveryHost } from '../host/node-media-task-delivery-host';

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
  const taskManager = createCLITaskManager({
    taskStorage: storage.taskStorage,
    taskRecoveryStorage: storage.taskRecoveryStorage,
  });
  await taskManager.initialize();
  const generatedAssets = await createGeneratedAssetIndex(
    storage.resourceCacheManifestStore,
    input.workDir,
    homedir,
  );
  const platformResult = createCLIPlatform({
    workspacePath: input.workDir,
    toolRegistry: new ToolRegistry(),
    taskManager,
    generatedAssetIndex: generatedAssets,
    resourceCacheManifestStore: storage.resourceCacheManifestStore,
  });
  const media = platformResult.platform.media;
  if (!media) {
    platformResult.platform.dispose();
    await storage.dispose();
    throw new Error('Direct media runtime requires Platform media generation support.');
  }
  const deliveryHost = new NodeMediaTaskDeliveryHost({
    platform: platformResult.platform,
    workspaceRoot: input.workDir,
    workspaceId: storage.workspaceId,
    metadataStore: storage.metadataStore,
    assetIndex: generatedAssets,
  });
  const runIdentity = randomUUID();

  return {
    runtime: {
      submit: ({ kind, prompt, model }) =>
        submitDirectMediaTask(media, kind, prompt, model, runIdentity),
      waitForTask: (scope) => media.waitForTask(scope),
      deliver: async (task) => (await deliveryHost.createTaskViewDelivery(task)).view,
    },
    dispose: async () => {
      deliveryHost.dispose();
      platformResult.platform.dispose();
      await storage.dispose();
    },
  };
}

function submitDirectMediaTask(
  media: Parameters<typeof submitMediaTurn>[0],
  kind: DirectMediaKind,
  prompt: string,
  model: DirectMediaModelRef,
  runIdentity: string,
): Promise<MediaTask> {
  return submitMediaTurn(media, {
    prompt,
    mediaModel: { ...model, category: kind },
    metadata: {
      conversationId: `cli-media-${runIdentity}`,
      runId: runIdentity,
      source: 'direct-media-cli',
    },
  });
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
