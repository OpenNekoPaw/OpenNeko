import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_PROCESSOR_SCHEMA,
  EXTERNAL_PROCESSOR_SCHEMA_VERSION,
  createExternalProcessorRegistry,
  type ExternalProcessorManifest,
} from '@neko-agent/types';
import { createResourceFingerprint, createResourceRef, type ResourceRef } from '@neko/shared';
import { createAgentExternalProcessorRuntime } from '../capability/external-processor-runtime';

const removeBackgroundManifest = manifest('remove-background', {
  outputSlot: 'mask',
  outputMime: 'image/png',
});
const upscaleManifest = manifest('upscale-image', {
  inputSlot: 'image',
  outputSlot: 'image',
  outputMime: 'image/png',
  params: {
    scale: { type: 'number', required: true, allowed: [2, 4] },
  },
});

describe('Agent external processor chain runtime', () => {
  it('records explicit stages and continues the same run after cross-turn approval', () => {
    const runtime = createRuntime();
    const run = runtime.startChain({ targetKey: 'shot-1' });

    const stage = runtime.planChainStage({
      processorRunId: run.processorRunId,
      processorId: 'remove-background',
      inputs: [{ slot: 'source', locator: { kind: 'workspace-file', path: 'shot.png' } }],
      requireApprovalContinuation: true,
      approvalToken: 'approval-1',
    });

    expect(stage.status).toBe('waiting-approval');
    if (stage.status !== 'waiting-approval') return;
    expect(stage.plan.invocation.run.processorRunId).toBe(run.processorRunId);
    expect(stage.stage.status).toBe('waiting-approval');

    const continued = runtime.continueChainAfterApproval({
      processorRunId: run.processorRunId,
      stageId: stage.stage.stageId,
      approvalToken: 'approval-1',
    });

    expect(continued).toEqual(
      expect.objectContaining({
        processorRunId: run.processorRunId,
        status: 'running',
        stages: [expect.objectContaining({ stageId: stage.stage.stageId, status: 'ready' })],
      }),
    );
  });

  it('retries a failed stage with the same stageId and a new attempt', () => {
    const runtime = createRuntime();
    const run = runtime.startChain({ targetKey: 'shot-1' });

    const first = runtime.planChainStage({
      processorRunId: run.processorRunId,
      processorId: 'upscale-image',
      inputs: [{ slot: 'image', locator: { kind: 'workspace-file', path: 'shot.png' } }],
      params: { scale: 4 },
    });
    expect(first.status).toBe('ready');
    if (first.status !== 'ready') return;

    const retry = runtime.planChainStage({
      processorRunId: run.processorRunId,
      stageId: first.stage.stageId,
      processorId: 'upscale-image',
      inputs: [{ slot: 'image', locator: { kind: 'workspace-file', path: 'shot.png' } }],
      params: { scale: 2 },
    });

    expect(retry.status).toBe('ready');
    if (retry.status !== 'ready') return;
    expect(retry.stage.stageId).toBe(first.stage.stageId);
    expect(retry.stage.attempt).toBe(2);
    expect(retry.plan.invocation.run).toEqual(
      expect.objectContaining({
        processorRunId: run.processorRunId,
        stageId: first.stage.stageId,
        attempt: 2,
      }),
    );
  });

  it('creates a new processorRunId when the creative target changes', () => {
    const runtime = createRuntime();
    const parentResourceRef = resource('shot-1-output');
    const first = runtime.startChain({ targetKey: 'shot-1' });

    const replanned = runtime.replanChainForTargetChange({
      previousProcessorRunId: first.processorRunId,
      targetKey: 'shot-2',
      parentResourceRef,
    });

    expect(replanned.processorRunId).not.toBe(first.processorRunId);
    expect(replanned).toEqual(
      expect.objectContaining({
        targetKey: 'shot-2',
        parentProcessorRunId: first.processorRunId,
        parentResourceRef,
      }),
    );
  });

  it('rejects shell pipelines instead of hiding a chain inside Bash', () => {
    const runtime = createRuntime();
    const run = runtime.startChain({ targetKey: 'shot-1' });

    const rejected = runtime.planChainStage({
      processorRunId: run.processorRunId,
      processorId: 'bash -c remove-bg input.png | upscale',
      inputs: [],
    });

    expect(rejected).toEqual(
      expect.objectContaining({
        status: 'blocked',
        diagnostics: [
          expect.objectContaining({
            code: 'disabled-processor',
            path: 'processorId',
          }),
        ],
      }),
    );
  });
});

function createRuntime() {
  const registry = createExternalProcessorRegistry();
  registry.upsert(
    { sourceScope: 'builtin', agentCapabilitySource: 'builtin', sourceId: 'builtin' },
    removeBackgroundManifest,
  );
  registry.upsert(
    { sourceScope: 'builtin', agentCapabilitySource: 'builtin', sourceId: 'builtin' },
    upscaleManifest,
  );
  let run = 0;
  let stage = 0;
  return createAgentExternalProcessorRuntime({
    registry,
    generateProcessorRunId: () => `processor-run-${++run}`,
    generateStageId: () => `stage-${++stage}`,
  });
}

function manifest(
  id: string,
  options: {
    readonly inputSlot?: string;
    readonly outputSlot: string;
    readonly outputMime: string;
    readonly params?: ExternalProcessorManifest['params'];
  },
): ExternalProcessorManifest {
  const inputSlot = options.inputSlot ?? 'source';
  return {
    schema: EXTERNAL_PROCESSOR_SCHEMA,
    schemaVersion: EXTERNAL_PROCESSOR_SCHEMA_VERSION,
    id,
    kind: 'external-processor',
    displayName: id,
    version: '1.0.0',
    entry: {
      executable: '${TOOLS}/processor',
      args: ['--input', `\${input.${inputSlot}}`, '--output', `\${output.${options.outputSlot}}`],
    },
    inputs: {
      [inputSlot]: { accepts: ['image/*'], required: true },
    },
    outputs: {
      [options.outputSlot]: {
        produces: [options.outputMime],
        ownership: 'intermediate',
      },
    },
    ...(options.params ? { params: options.params } : {}),
    policy: {
      requiresApproval: true,
      allowNetwork: false,
      allowedInputRoots: ['workspace'],
      allowedOutputOwnerships: ['intermediate'],
    },
  };
}

function resource(id: string): ResourceRef {
  return createResourceRef({
    id,
    scope: 'project',
    provider: 'external-processor',
    kind: 'generated',
    source: {
      kind: 'generated-asset',
      generatedAssetId: id,
    },
    fingerprint: createResourceFingerprint({ strategy: 'provider', value: id }),
  });
}
