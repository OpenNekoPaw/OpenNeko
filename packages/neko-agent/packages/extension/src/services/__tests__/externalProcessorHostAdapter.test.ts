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
  type ExternalProcessorHostFsOps,
  type ExternalProcessorProcessRunInput,
  type ExternalProcessorProcessRunner,
} from '../externalProcessorHostAdapter';

const workspaceRoot = '/workspace/project';
const resourceCacheRoot = '/workspace/project/.neko/.cache/resources';
const mediaLibraryRoot = '/media/library';
const extensionPrivateResourcesRoot = '/extension/global/resources';
const executable = '/tools/bin/upscale';

describe('ExternalProcessorHostAdapter', () => {
  it('allocates resourceCache outputs and spawns fixed manifest executable and args', async () => {
    const { adapter, runner, fsOps, registration } = createHarness({
      manifest: createManifest({ allowNetwork: true }),
    });
    const invocation = createInvocation(registration);

    const result = await adapter.execute({ invocation, registrationSnapshot: registration });

    expect(result.status).toBe('succeeded');
    expect(result.outputs[0]).toMatchObject({
      slot: 'image',
      retentionHint: 'intermediate',
      sizeBytes: 1234,
      resourceRef: {
        scope: 'project',
        provider: 'external-processor',
        kind: 'generated',
      },
    });
    expect(result.outputs[0]?.resourceRef.source).toMatchObject({
      kind: 'file',
      projectRelativePath: expect.stringContaining(
        'external-processors/upscale-image/run-1/stage-1/attempt-1/result.png',
      ),
    });
    expect(fsOps.mkdir).toHaveBeenCalledWith(
      '/workspace/project/.neko/.cache/resources/external-processors/upscale-image/run-1/stage-1/attempt-1',
      { recursive: true },
    );
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        executable,
        args: [
          '--input',
          '/workspace/project/inputs/source.png',
          '--output',
          '/workspace/project/.neko/.cache/resources/external-processors/upscale-image/run-1/stage-1/attempt-1/result.png',
          '--scale',
          '4',
        ],
        cwd: resourceCacheRoot,
        timeoutMs: 90_000,
        networkDisabled: false,
      }),
    );
  });

  it('denies system temp inputs before spawning', async () => {
    const { adapter, runner, registration } = createHarness({
      manifest: createManifest({ allowNetwork: true }),
    });
    const invocation = createInvocation(registration, {
      inputs: [{ slot: 'image', root: 'workspace', sourcePath: '/tmp/page-1.jpg' }],
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

  it('allows media library inputs but denies media library outputs', async () => {
    const inputHarness = createHarness({
      manifest: createManifest({
        allowNetwork: true,
        allowedInputRoots: ['mediaLibrary'],
      }),
    });
    const inputInvocation = createInvocation(inputHarness.registration, {
      inputs: [{ slot: 'image', root: 'mediaLibrary', sourcePath: '/media/library/source.png' }],
    });

    await expect(
      inputHarness.adapter.execute({
        invocation: inputInvocation,
        registrationSnapshot: inputHarness.registration,
      }),
    ).resolves.toMatchObject({ status: 'succeeded' });
    expect(inputHarness.runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['/media/library/source.png']),
      }),
    );

    const outputHarness = createHarness({
      manifest: createManifest({
        allowNetwork: true,
        allowedOutputRoots: ['mediaLibrary'],
        outputRoot: 'mediaLibrary',
      }),
    });
    const outputInvocation = createInvocation(outputHarness.registration, {
      outputs: [{ slot: 'image', root: 'mediaLibrary', pathHint: 'result.png' }],
    });

    const outputResult = await outputHarness.adapter.execute({
      invocation: outputInvocation,
      registrationSnapshot: outputHarness.registration,
    });

    expect(outputResult.status).toBe('failed');
    expect(outputResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'illegal-output-root', path: 'outputs.image' }),
      ]),
    );
    expect(outputHarness.runner.run).not.toHaveBeenCalled();
  });

  it('resolves media library variable inputs through enabled accessible libraries only', async () => {
    const { adapter, runner, registration } = createHarness({
      manifest: createManifest({
        allowNetwork: true,
        allowedInputRoots: ['mediaLibrary'],
      }),
      mediaLibraryResolver: {
        libraries: [
          {
            name: 'Team Library',
            variable: 'TEAM_MEDIA',
            originalPath: '${TEAM_MEDIA}',
            resolvedPath: mediaLibraryRoot,
            enabled: true,
            accessible: true,
            overridden: false,
          },
          {
            name: 'Offline Library',
            variable: 'OFFLINE_MEDIA',
            originalPath: '${OFFLINE_MEDIA}',
            resolvedPath: '/offline/library',
            enabled: true,
            accessible: false,
            overridden: false,
          },
        ],
        pathVariables: new Map([
          ['TEAM_MEDIA', mediaLibraryRoot],
          ['OFFLINE_MEDIA', '/offline/library'],
        ]),
      },
    });

    const result = await adapter.execute({
      invocation: createInvocation(registration, {
        inputs: [{ slot: 'image', root: 'mediaLibrary', sourcePath: '${TEAM_MEDIA}/source.png' }],
      }),
      registrationSnapshot: registration,
    });

    expect(result.status).toBe('succeeded');
    expect(runner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['/media/library/source.png']),
      }),
    );

    const denied = await adapter.execute({
      invocation: createInvocation(registration, {
        inputs: [
          {
            slot: 'image',
            root: 'mediaLibrary',
            sourcePath: '${OFFLINE_MEDIA}/source.png',
          },
        ],
      }),
      registrationSnapshot: registration,
    });

    expect(denied.status).toBe('failed');
    expect(denied.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unauthorized-path', path: 'inputs.image' }),
      ]),
    );
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

  it('resolves extensionPrivateResources outputs as extension-private ResourceRefs', async () => {
    const { adapter, registration } = createHarness({
      manifest: createManifest({
        allowNetwork: true,
        allowedOutputRoots: ['extensionPrivateResources'],
        outputRoot: 'extensionPrivateResources',
      }),
    });
    const invocation = createInvocation(registration, {
      outputs: [{ slot: 'image', root: 'extensionPrivateResources', pathHint: 'private.png' }],
    });

    const result = await adapter.execute({ invocation, registrationSnapshot: registration });

    expect(result.status).toBe('succeeded');
    expect(result.outputs[0]?.resourceRef.scope).toBe('extension-private');
    expect(result.outputs[0]?.resourceRef.source.metadata).toMatchObject({
      outputRoot: 'extensionPrivateResources',
      relativePath: expect.stringContaining('private.png'),
    });
  });
});

function createHarness(options: {
  readonly manifest: ExternalProcessorManifest;
  readonly hostEnv?: Readonly<Record<string, string | undefined>>;
  readonly configuredEnv?: Readonly<Record<string, string | undefined>>;
  readonly runtimeEnv?: Readonly<Record<string, string | undefined>>;
  readonly mediaLibraryResolver?: Parameters<
    typeof createExternalProcessorHostAdapter
  >[0]['mediaLibraryResolver'];
  readonly runnerCanDisableNetwork?: boolean;
  readonly runResult?: { readonly exitCode: number | null; readonly timedOut?: boolean };
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
  const adapter = createExternalProcessorHostAdapter({
    registry,
    roots: {
      workspaceRoot,
      mediaLibraryRoots: [mediaLibraryRoot],
      resourceCacheRoot,
      extensionPrivateResourcesRoot,
    },
    executableAliases: { TOOLS: '/tools/bin' },
    hostEnv: options.hostEnv ?? {},
    configuredEnv: options.configuredEnv ?? {},
    runtimeEnv: options.runtimeEnv ?? {},
    ...(options.mediaLibraryResolver ? { mediaLibraryResolver: options.mediaLibraryResolver } : {}),
    processRunner: runner,
    fsOps,
    now: () => '2026-06-24T00:00:00.000Z',
  });
  return { adapter, runner, fsOps, registration };
}

function createManifest(options: {
  readonly allowNetwork: boolean;
  readonly allowedInputRoots?: ExternalProcessorManifest['policy']['allowedInputRoots'];
  readonly allowedOutputRoots?: ExternalProcessorManifest['policy']['allowedOutputRoots'];
  readonly outputRoot?: ExternalProcessorManifest['outputs'][string]['root'];
  readonly envProfile?: ExternalProcessorManifest['envProfile'];
}): ExternalProcessorManifest {
  const outputRoot = options.outputRoot ?? 'resourceCache';
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
      image: { produces: ['image/png'], root: outputRoot, pathHint: 'result.png' },
    },
    params: {
      scale: { type: 'number', required: true, default: 4 },
    },
    policy: {
      requiresApproval: false,
      allowNetwork: options.allowNetwork,
      allowedInputRoots: options.allowedInputRoots ?? [
        'workspace',
        'mediaLibrary',
        'resourceCache',
      ],
      allowedOutputRoots: options.allowedOutputRoots ?? [outputRoot],
      timeoutMs: 90_000,
      cwdRoot: 'resourceCache',
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
      { slot: 'image', root: 'workspace', sourcePath: 'inputs/source.png' },
    ],
    outputs: overrides.outputs ?? [
      { slot: 'image', root: registration.manifest.outputs.image!.root, pathHint: 'result.png' },
    ],
    params: overrides.params ?? { scale: 4 },
    retentionHint: 'intermediate',
  };
}
