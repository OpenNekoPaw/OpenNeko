import { describe, expect, it, vi } from 'vitest';
import {
  EXTERNAL_PROCESSOR_SCHEMA,
  EXTERNAL_PROCESSOR_SCHEMA_VERSION,
  createExternalProcessorRegistry,
  type ExternalProcessorInvocation,
  type ExternalProcessorManifest,
  type ExternalProcessorRegistration,
} from '@neko-agent/types';
import {
  createExternalProcessorHostAdapter,
  NodeExternalProcessorOutputStorage,
  type ExternalProcessorHostFsOps,
  type ExternalProcessorProcessRunInput,
  type ExternalProcessorProcessRunner,
} from '../externalProcessorHostAdapter';

const workspaceRoot = '/workspace/project';
const processorOutputRoot = '/workspace/project/.neko/.cache/processor-outputs';
const extensionPrivateResourcesRoot = '/extension/global/resources';
const executable = '/tools/bin/upscale';

describe('ExternalProcessorHostAdapter', () => {
  it('allocates opaque Host-owned outputs and spawns fixed manifest executable and args', async () => {
    const { adapter, runner, fsOps, registration } = createHarness({
      manifest: createManifest({ allowNetwork: true }),
    });
    const invocation = createInvocation(registration);

    const result = await adapter.execute({ invocation, registrationSnapshot: registration });

    expect(result.status).toBe('succeeded');
    expect(result.outputs[0]).toMatchObject({
      slot: 'image',
      ownership: 'candidate',
      sizeBytes: 1234,
      output: {
        kind: 'processor-output',
        ownership: 'candidate',
        mediaType: 'image/png',
      },
    });
    expect(fsOps.mkdir).toHaveBeenCalledWith(
      '/workspace/project/.neko/.cache/processor-outputs/external-processors/candidate/upscale-image/run-1/stage-1/attempt-1',
      { recursive: true },
    );
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        executable,
        args: [
          '--input',
          '/workspace/project/inputs/source.png',
          '--output',
          '/workspace/project/.neko/.cache/processor-outputs/external-processors/candidate/upscale-image/run-1/stage-1/attempt-1/result.png',
          '--scale',
          '4',
        ],
        cwd: '/workspace/project/.neko/.cache/processor-outputs/external-processors/candidate/upscale-image/run-1/stage-1/attempt-1',
        timeoutMs: 90_000,
        networkDisabled: false,
      }),
    );
  });

  it('denies system temp inputs before spawning', async () => {
    const { adapter, runner, registration } = createHarness({
      manifest: createManifest({ allowNetwork: true }),
      resolveInputPath: () => '/tmp/page-1.jpg',
    });
    const invocation = createInvocation(registration, {
      inputs: [{ slot: 'image', locator: { kind: 'workspace-file', path: 'inputs/page-1.jpg' } }],
    });

    const result = await adapter.execute({ invocation, registrationSnapshot: registration });

    expect(result.status).toBe('failed');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unauthorized-path', path: 'inputs.image' }),
      ]),
    );
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('allows media library inputs but denies output ownership outside the declaration', async () => {
    const inputHarness = createHarness({
      manifest: createManifest({
        allowNetwork: true,
        allowedInputRoots: ['mediaLibrary'],
      }),
    });
    const inputInvocation = createInvocation(inputHarness.registration, {
      inputs: [
        {
          slot: 'image',
          locator: { kind: 'workspace-file', path: 'neko/assets/Books/source.png' },
        },
      ],
    });

    await expect(
      inputHarness.adapter.execute({
        invocation: inputInvocation,
        registrationSnapshot: inputHarness.registration,
      }),
    ).resolves.toMatchObject({ status: 'succeeded' });
    expect(inputHarness.runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['/workspace/project/neko/assets/Books/source.png']),
      }),
    );

    const outputHarness = createHarness({
      manifest: createManifest({ allowNetwork: true }),
    });
    const outputInvocation = createInvocation(outputHarness.registration, {
      outputs: [{ slot: 'image', ownership: 'debug', pathHint: 'result.png' }],
    });

    const outputResult = await outputHarness.adapter.execute({
      invocation: outputInvocation,
      registrationSnapshot: outputHarness.registration,
    });

    expect(outputResult.status).toBe('failed');
    expect(outputResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'illegal-output-ownership', path: 'outputs.image' }),
      ]),
    );
    expect(outputHarness.runner.run).not.toHaveBeenCalled();
  });

  it('chains an opaque processor output without exposing its Host path in the invocation', async () => {
    const { adapter, runner, registration } = createHarness({
      manifest: createManifest({ allowNetwork: true }),
    });
    const first = await adapter.execute({
      invocation: createInvocation(registration),
      registrationSnapshot: registration,
    });
    expect(first.status).toBe('succeeded');
    const firstOutput = first.outputs[0]?.output;
    expect(firstOutput).toBeDefined();
    if (!firstOutput) return;

    const secondInvocation = createInvocation(registration, {
      inputs: [{ slot: 'image', output: firstOutput }],
    });
    const second = await adapter.execute({
      invocation: secondInvocation,
      registrationSnapshot: registration,
    });

    expect(second.status).toBe('succeeded');
    expect(secondInvocation.inputs).toEqual([{ slot: 'image', output: firstOutput }]);
    expect(runner.run).toHaveBeenLastCalledWith(
      expect.objectContaining({
        inputPaths: {
          image: expect.stringContaining(
            'external-processors/candidate/upscale-image/run-1/stage-1/attempt-1/result.png',
          ),
        },
      }),
    );
  });

  it('fails visibly when a projected input handle cannot be resolved', async () => {
    const { adapter, runner, registration } = createHarness({
      manifest: createManifest({
        allowNetwork: true,
        allowedInputRoots: ['mediaLibrary'],
      }),
      resolveInputPath: () => undefined,
    });

    const result = await adapter.execute({
      invocation: createInvocation(registration, {
        inputs: [
          {
            slot: 'image',
            locator: { kind: 'workspace-file', path: 'neko/assets/Books/source.png' },
          },
        ],
      }),
      registrationSnapshot: registration,
    });

    expect(result.status).toBe('failed');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unauthorized-path', path: 'inputs.image' }),
      ]),
    );
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('blocks secret env keys even when they are allowlisted by manifest', async () => {
    const { adapter, runner, registration } = createHarness({
      manifest: createManifest({
        allowNetwork: true,
        envProfile: {
          inherits: ['GITHUB_TOKEN', 'CUDA_VISIBLE_DEVICES'],
          denySecrets: true,
        },
      }),
      hostEnv: {
        GITHUB_TOKEN: 'secret',
        CUDA_VISIBLE_DEVICES: '0',
      },
    });

    const result = await adapter.execute({
      invocation: createInvocation(registration),
      registrationSnapshot: registration,
    });

    expect(result.status).toBe('failed');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'blocked-env-key', path: 'envProfile.inherits' }),
      ]),
    );
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('passes GPU, Python, and Blender env profile keys from explicit allowlist sources', async () => {
    const { adapter, runner, registration } = createHarness({
      manifest: createManifest({
        allowNetwork: true,
        envProfile: {
          inherits: ['CUDA_VISIBLE_DEVICES'],
          configured: ['VIRTUAL_ENV'],
          runtime: ['BLENDER_USER_SCRIPTS'],
          denySecrets: true,
        },
      }),
      hostEnv: { CUDA_VISIBLE_DEVICES: '0' },
      configuredEnv: { VIRTUAL_ENV: '/venv' },
      runtimeEnv: { BLENDER_USER_SCRIPTS: '/blender/scripts' },
    });

    await adapter.execute({
      invocation: createInvocation(registration),
      registrationSnapshot: registration,
    });

    const runInput = runner.run.mock.calls[0]?.[0] as ExternalProcessorProcessRunInput | undefined;
    expect(runInput?.env).toEqual({
      CUDA_VISIBLE_DEVICES: '0',
      VIRTUAL_ENV: '/venv',
      BLENDER_USER_SCRIPTS: '/blender/scripts',
    });
  });

  it('fails visibly when network default-deny cannot be enforced by the runner', async () => {
    const { adapter, runner, registration } = createHarness({
      manifest: createManifest({ allowNetwork: false }),
      runnerCanDisableNetwork: false,
    });

    const result = await adapter.execute({
      invocation: createInvocation(registration),
      registrationSnapshot: registration,
    });

    expect(result.status).toBe('failed');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'network-policy-unavailable' })]),
    );
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('sets networkDisabled when the runner can enforce network isolation', async () => {
    const { adapter, runner, registration } = createHarness({
      manifest: createManifest({ allowNetwork: false }),
      runnerCanDisableNetwork: true,
    });

    await adapter.execute({
      invocation: createInvocation(registration),
      registrationSnapshot: registration,
    });

    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ networkDisabled: true }));
  });

  it('reports timeout result as failed with execution-timeout diagnostic', async () => {
    const { adapter, registration } = createHarness({
      manifest: createManifest({ allowNetwork: true }),
      runResult: { exitCode: null, timedOut: true },
    });

    const result = await adapter.execute({
      invocation: createInvocation(registration),
      registrationSnapshot: registration,
    });

    expect(result).toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ code: 'execution-timeout' })],
    });
  });

  it('promotes a processor output only through an owning durable writer', async () => {
    const promoteOutput = vi.fn(async () => ({
      kind: 'generated-output' as const,
      outputId: 'durable-output-1',
      revision: '1',
      digest: 'sha256:durable',
      path: 'generated/durable-output-1.png',
    }));
    const storage = new NodeExternalProcessorOutputStorage({
      root: processorOutputRoot,
      promoteOutput,
      fsOps: { mkdir: vi.fn(async () => undefined) },
    });
    const allocation = await storage.allocate({
      processorId: 'upscale-image',
      processorRunId: 'run-1',
      stageId: 'stage-1',
      attempt: 1,
      slot: 'image',
      ownership: 'candidate',
      mediaType: 'image/png',
      fileNameHint: 'result.png',
    });
    await expect(
      storage.resolve({ ...allocation.locator, ownership: 'debug' }),
    ).resolves.toBeUndefined();

    const result = await storage.promote({
      output: allocation.locator,
      target: 'generated-output',
    });

    expect(promoteOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        output: allocation.locator,
        sourcePath: expect.stringContaining(
          'external-processors/candidate/upscale-image/run-1/stage-1/attempt-1/result.png',
        ),
        target: 'generated-output',
      }),
    );
    expect(result).toEqual({
      status: 'promoted',
      output: { ...allocation.locator, ownership: 'promoted' },
      source: {
        kind: 'generated-output',
        outputId: 'durable-output-1',
        revision: '1',
        digest: 'sha256:durable',
        path: 'generated/durable-output-1.png',
      },
    });
  });
});

function createHarness(options: {
  readonly manifest: ExternalProcessorManifest;
  readonly hostEnv?: Readonly<Record<string, string | undefined>>;
  readonly configuredEnv?: Readonly<Record<string, string | undefined>>;
  readonly runtimeEnv?: Readonly<Record<string, string | undefined>>;
  readonly runnerCanDisableNetwork?: boolean;
  readonly runResult?: { readonly exitCode: number | null; readonly timedOut?: boolean };
  readonly resolveInputPath?: (
    locator: import('@neko/shared').ContentLocator,
  ) => string | undefined;
}) {
  const registry = createExternalProcessorRegistry();
  const registration = registry.upsert(
    {
      sourceScope: 'project',
      agentCapabilitySource: 'local',
      sourceId: 'workspace',
      trustLevel: 'community',
    },
    options.manifest,
  );
  const runner = {
    canDisableNetwork: options.runnerCanDisableNetwork ?? true,
    run: vi.fn(async () => options.runResult ?? { exitCode: 0 }),
  } satisfies ExternalProcessorProcessRunner;
  const fsOps = {
    mkdir: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 1234 })),
  } satisfies ExternalProcessorHostFsOps;
  const inputPaths = new Map<string, string | undefined>();
  let inputHandleSequence = 0;
  const adapter = createExternalProcessorHostAdapter({
    registry,
    roots: {
      workspaceRoot,
      processorOutputRoot,
      extensionPrivateResourcesRoot,
    },
    executableAliases: { TOOLS: '/tools/bin' },
    hostEnv: options.hostEnv ?? {},
    configuredEnv: options.configuredEnv ?? {},
    runtimeEnv: options.runtimeEnv ?? {},
    processRunner: runner,
    fsOps,
    inputProjection: {
      project: vi.fn(async (locator) => {
        const handle = `processor-input:${++inputHandleSequence}`;
        const defaultPath =
          locator.kind === 'workspace-file' ? `${workspaceRoot}/${locator.path}` : undefined;
        inputPaths.set(
          handle,
          options.resolveInputPath ? options.resolveInputPath(locator) : defaultPath,
        );
        return { status: 'ready', kind: 'processor', locator, handle };
      }),
    },
    resolveInputHandle: vi.fn(async (handle) => inputPaths.get(handle)),
  });
  return { adapter, runner, fsOps, registration };
}

function createManifest(options: {
  readonly allowNetwork: boolean;
  readonly allowedInputRoots?: ExternalProcessorManifest['policy']['allowedInputRoots'];
  readonly outputOwnership?: ExternalProcessorManifest['outputs'][string]['ownership'];
  readonly envProfile?: ExternalProcessorManifest['envProfile'];
}): ExternalProcessorManifest {
  const outputOwnership = options.outputOwnership ?? 'candidate';
  return {
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
      image: { produces: ['image/png'], ownership: outputOwnership, pathHint: 'result.png' },
    },
    params: {
      scale: { type: 'number', required: true, default: 4 },
    },
    policy: {
      requiresApproval: false,
      allowNetwork: options.allowNetwork,
      allowedInputRoots: options.allowedInputRoots ?? ['workspace', 'mediaLibrary'],
      allowedOutputOwnerships: [outputOwnership],
      timeoutMs: 90_000,
    },
    ...(options.envProfile ? { envProfile: options.envProfile } : {}),
  };
}

function createInvocation(
  registration: ExternalProcessorRegistration,
  overrides: Partial<Pick<ExternalProcessorInvocation, 'inputs' | 'outputs' | 'params'>> = {},
): ExternalProcessorInvocation {
  return {
    processorId: registration.id,
    registrationId: registration.registrationId,
    registrationRevision: registration.revision,
    run: {
      processorRunId: 'run-1',
      stageId: 'stage-1',
      attempt: 1,
    },
    inputs: overrides.inputs ?? [
      { slot: 'image', locator: { kind: 'workspace-file', path: 'inputs/source.png' } },
    ],
    outputs: overrides.outputs ?? [
      {
        slot: 'image',
        ownership: registration.manifest.outputs.image!.ownership,
        pathHint: 'result.png',
      },
    ],
    params: overrides.params ?? { scale: 4 },
  };
}
