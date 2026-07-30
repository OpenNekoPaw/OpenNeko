import { describe, expect, it, vi } from 'vitest';
import {
  EXTERNAL_PROCESSOR_SCHEMA,
  EXTERNAL_PROCESSOR_SCHEMA_VERSION,
  createExternalProcessorRegistry,
  type ExternalProcessorManifest,
} from '@neko-agent/types';
import type { ProcessorOutputLocator } from '@neko/shared';
import {
  createAgentExternalProcessorRuntime,
  createDeveloperModeTemporaryProcessorRequest,
} from '../capability/external-processor-runtime';

const manifest = {
  schema: EXTERNAL_PROCESSOR_SCHEMA,
  schemaVersion: EXTERNAL_PROCESSOR_SCHEMA_VERSION,
  id: 'upscale-image',
  kind: 'external-processor',
  displayName: 'Upscale Image',
  version: '1.0.0',
  entry: {
    executable: '${TOOLS}/upscale',
    args: [
      '--input',
      '${input.image}',
      '--output',
      '${output.image}',
      '--scale',
      '${params.scale}',
    ],
  },
  inputs: {
    image: { accepts: ['image/*'], required: true },
  },
  outputs: {
    image: { produces: ['image/png'], ownership: 'candidate', pathHint: 'upscale' },
  },
  params: {
    scale: { type: 'number', required: true, allowed: [2, 4] },
  },
  policy: {
    requiresApproval: true,
    allowNetwork: false,
    allowedInputRoots: ['workspace', 'mediaLibrary'],
    allowedOutputOwnerships: ['candidate'],
    timeoutMs: 120_000,
  },
} satisfies ExternalProcessorManifest;

describe('Agent external processor runtime', () => {
  it('lists and resolves processors only through the normalized registry projection', () => {
    const registry = createExternalProcessorRegistry();
    const registration = registry.upsert(
      {
        sourceScope: 'project',
        agentCapabilitySource: 'local',
        sourceId: 'workspace-1',
        locationRef: '.neko/processors/upscale.neko-processor.json',
      },
      manifest,
    );
    const runtime = createAgentExternalProcessorRuntime({ registry });

    expect(runtime.list().processors).toEqual([registration]);
    expect(runtime.resolve('upscale-image')).toEqual(registration);
  });

  it('applies execution trust gates while keeping catalog projection configurable', () => {
    const registry = createExternalProcessorRegistry();
    registry.upsert(
      {
        sourceScope: 'personal',
        agentCapabilitySource: 'local',
        sourceId: 'demo-upscale',
        trustLevel: 'untrusted',
      },
      manifest,
    );
    const runtime = createAgentExternalProcessorRuntime({
      registry,
      defaultCatalogContext: { includeDisabled: true },
      defaultExecutionContext: { allowedTrustLevels: ['core', 'community'] },
    });

    expect(runtime.list().processors).toHaveLength(1);
    expect(runtime.resolve('upscale-image')).toEqual(
      expect.objectContaining({ code: 'untrusted-processor' }),
    );
  });

  it('subscribes to registry lifecycle changes without owning discovery sources', () => {
    const registry = createExternalProcessorRegistry();
    const runtime = createAgentExternalProcessorRuntime({ registry });
    const listener = vi.fn();
    const subscription = runtime.onDidChange(listener);

    const registration = registry.upsert(
      { sourceScope: 'builtin', agentCapabilitySource: 'builtin', sourceId: 'builtin' },
      manifest,
    );
    registry.setEnabled({ registrationId: registration.registrationId }, false, 'Disabled by test');
    subscription.dispose();
    registry.unregister({ registrationId: registration.registrationId }, 'Removed by test');

    expect(listener.mock.calls.map(([event]) => event.kind)).toEqual(['registered', 'disabled']);
  });

  it('plans invocation requests with stable registration revision and run metadata', () => {
    const registry = createExternalProcessorRegistry();
    const registration = registry.upsert(
      {
        sourceScope: 'builtin',
        agentCapabilitySource: 'builtin',
        sourceId: 'builtin',
        trustLevel: 'core',
      },
      manifest,
    );
    const runtime = createAgentExternalProcessorRuntime({
      registry,
      generateProcessorRunId: () => 'processor-run-1',
      generateStageId: () => 'stage-1',
    });

    const plan = runtime.planInvocation({
      processorId: 'upscale-image',
      inputs: [{ slot: 'image', locator: { kind: 'workspace-file', path: 'input.png' } }],
      params: { scale: 4 },
    });

    expect(plan).toEqual(
      expect.objectContaining({
        status: 'ready',
        registration,
        invocation: expect.objectContaining({
          processorId: 'upscale-image',
          registrationId: registration.registrationId,
          registrationRevision: registration.revision,
          run: { processorRunId: 'processor-run-1', stageId: 'stage-1', attempt: 1 },
          outputs: [{ slot: 'image', ownership: 'candidate', pathHint: 'upscale' }],
        }),
        diagnostics: [],
      }),
    );
  });

  it('blocks plans with undeclared inputs, invalid locators, or invalid params before Host execution', () => {
    const registry = createExternalProcessorRegistry();
    registry.upsert(
      { sourceScope: 'builtin', agentCapabilitySource: 'builtin', sourceId: 'builtin' },
      manifest,
    );
    const runtime = createAgentExternalProcessorRuntime({ registry });

    const plan = runtime.planInvocation({
      processorId: 'upscale-image',
      inputs: [
        {
          slot: 'missing',
          locator: { kind: 'workspace-file', path: '../input.png' } as never,
        },
      ],
      outputs: [{ slot: 'image', ownership: 'debug' }],
      params: { scale: 3, extra: true },
    });

    expect(plan.status).toBe('blocked');
    expect(plan.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'missing-required-field',
        'undeclared-template-reference',
        'unauthorized-path',
        'illegal-output-ownership',
        'invalid-field-type',
      ]),
    );
  });

  it('keeps explicit processor run identity across continuation attempts', () => {
    const registry = createExternalProcessorRegistry();
    registry.upsert(
      { sourceScope: 'builtin', agentCapabilitySource: 'builtin', sourceId: 'builtin' },
      manifest,
    );
    const runtime = createAgentExternalProcessorRuntime({
      registry,
      generateProcessorRunId: () => 'new-run',
      generateStageId: () => 'new-stage',
    });

    const plan = runtime.planInvocation({
      processorId: 'upscale-image',
      run: {
        processorRunId: 'processor-run-existing',
        stageId: 'stage-existing',
        attempt: 2,
      },
      inputs: [{ slot: 'image', locator: { kind: 'workspace-file', path: 'input.png' } }],
      params: { scale: 2 },
    });

    expect(plan.status).toBe('ready');
    if (plan.status === 'ready') {
      expect(plan.invocation.run).toEqual({
        processorRunId: 'processor-run-existing',
        stageId: 'stage-existing',
        attempt: 2,
      });
    }
  });

  it('projects Host results as opaque processor outputs and reports provenance mismatches', () => {
    const registry = createExternalProcessorRegistry();
    registry.upsert(
      { sourceScope: 'builtin', agentCapabilitySource: 'builtin', sourceId: 'builtin' },
      manifest,
    );
    const runtime = createAgentExternalProcessorRuntime({
      registry,
      generateProcessorRunId: () => 'processor-run-1',
      generateStageId: () => 'stage-1',
    });
    const plan = runtime.planInvocation({
      processorId: 'upscale-image',
      inputs: [{ slot: 'image', locator: { kind: 'workspace-file', path: 'input.png' } }],
      params: { scale: 2 },
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') return;

    const output = createProcessorOutputLocator('output-1');
    const projection = runtime.projectResult({
      invocation: plan.invocation,
      result: {
        status: 'succeeded',
        processorId: plan.invocation.processorId,
        registrationId: plan.invocation.registrationId,
        registrationRevision: plan.invocation.registrationRevision,
        run: plan.invocation.run,
        outputs: [
          {
            slot: 'image',
            output,
            ownership: 'candidate',
            mimeType: 'image/png',
          },
        ],
        diagnostics: [],
      },
    });

    expect(projection.outputs).toEqual([
      expect.objectContaining({
        slot: 'image',
        output,
        ownership: 'candidate',
        mimeType: 'image/png',
      }),
    ]);
    expect(projection.diagnostics).toEqual([]);

    const ownershipMismatch = runtime.projectResult({
      invocation: plan.invocation,
      result: {
        ...projection,
        outputs: [{ ...projection.outputs[0]!, ownership: 'debug' }],
      },
    });
    expect(ownershipMismatch.diagnostics).toEqual([
      expect.objectContaining({ code: 'illegal-output-ownership' }),
    ]);

    const mismatched = runtime.projectResult({
      invocation: plan.invocation,
      result: {
        ...projection,
        run: { ...plan.invocation.run, stageId: 'wrong-stage' },
        outputs: [
          ...projection.outputs,
          {
            slot: 'sidecar',
            output: createProcessorOutputLocator('sidecar'),
            ownership: 'debug',
          },
        ],
      },
    });

    expect(mismatched.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'invalid-manifest',
      'undeclared-template-reference',
    ]);
  });

  it('represents Developer Mode one-shot commands as temporary processor requests', () => {
    const request = createDeveloperModeTemporaryProcessorRequest({
      command: 'ffmpeg -version',
      cwdRoot: 'workspace',
      timeoutMs: 10_000,
    });

    expect(request.diagnostics).toEqual([]);
    expect(request.manifest).toEqual(
      expect.objectContaining({
        id: 'developer-mode.one-shot-command',
        entry: { executable: '${HOST_SHELL}', args: ['-c', '${params.command}'] },
        params: expect.objectContaining({
          command: expect.objectContaining({ default: 'ffmpeg -version' }),
        }),
        policy: expect.objectContaining({
          requiresApproval: true,
          allowNetwork: false,
          allowedOutputOwnerships: ['debug'],
          cwdRoot: 'workspace',
          timeoutMs: 10_000,
        }),
      }),
    );
    expect(request.invocation).toEqual(
      expect.objectContaining({
        processorId: 'developer-mode.one-shot-command',
        registrationId: 'temporary:developer-mode:one-shot-command',
        outputs: [
          { slot: 'stdout', ownership: 'debug', pathHint: 'stdout.txt' },
          { slot: 'stderr', ownership: 'debug', pathHint: 'stderr.txt' },
        ],
        params: { command: 'ffmpeg -version' },
      }),
    );
  });

  it('fails visibly for empty Developer Mode one-shot commands', () => {
    const request = createDeveloperModeTemporaryProcessorRequest({ command: '   ' });

    expect(request.diagnostics).toEqual([
      expect.objectContaining({ code: 'missing-required-field', path: 'command' }),
    ]);
  });
});

function createProcessorOutputLocator(id: string): ProcessorOutputLocator {
  return {
    kind: 'processor-output',
    id,
    ownership: 'candidate',
    mediaType: 'image/png',
  };
}
