import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_PROCESSOR_SCHEMA,
  EXTERNAL_PROCESSOR_SCHEMA_VERSION,
  createExternalProcessorRegistry,
  isExternalProcessorRootAlias,
  matchesExternalProcessorSecretEnvPattern,
  parseExternalProcessorManifestJson,
  registerBuiltinExternalProcessors,
  registerExtensionExternalProcessorContributions,
  registerPersonalExternalProcessorManifests,
  registerProjectExternalProcessorManifests,
  validateExternalProcessorManifest,
  type ExternalProcessorManifest,
} from '../external-processor';

const validManifest = {
  schema: EXTERNAL_PROCESSOR_SCHEMA,
  schemaVersion: EXTERNAL_PROCESSOR_SCHEMA_VERSION,
  id: 'upscale-image',
  kind: 'external-processor',
  displayName: 'Upscale Image',
  version: '1.0.0',
  entry: {
    executable: '${TOOLS}/upscale',
    args: ['-i', '${input.image}', '-o', '${output.image}', '-s', '${params.scale}'],
  },
  inputs: {
    image: { accepts: ['image/*'], required: true },
  },
  outputs: {
    image: { produces: ['image/png'], ownership: 'candidate', pathHint: 'generated' },
  },
  params: {
    scale: { type: 'number', allowed: [2, 4], default: 2 },
  },
  policy: {
    requiresApproval: true,
    allowNetwork: false,
    allowedInputRoots: ['workspace', 'mediaLibrary'],
    allowedOutputOwnerships: ['candidate'],
    timeoutMs: 120_000,
  },
  envProfile: {
    inherits: ['CUDA_VISIBLE_DEVICES'],
    configured: ['PYTHONPATH'],
    denySecrets: true,
  },
} satisfies ExternalProcessorManifest;

describe('external processor contract', () => {
  it('accepts a valid canonical JSON manifest', () => {
    const result = validateExternalProcessorManifest(validManifest);

    expect(result.diagnostics).toEqual([]);
    expect(result.manifest).toEqual(validManifest);
  });

  it('rejects unknown schema and schema version', () => {
    const result = validateExternalProcessorManifest({
      ...validManifest,
      schema: 'example.processor',
      schemaVersion: 99,
    });

    expect(result.manifest).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['unknown-schema', 'unknown-schema-version']),
    );
  });

  it('rejects legacy resourceCache output policy instead of migrating it implicitly', () => {
    const result = validateExternalProcessorManifest({
      ...validManifest,
      schemaVersion: 1,
      outputs: {
        image: { produces: ['image/png'], root: 'resourceCache' },
      },
      policy: {
        ...validManifest.policy,
        allowedInputRoots: ['workspace', 'resourceCache'],
        allowedOutputRoots: ['resourceCache'],
      },
    });

    expect(result.manifest).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['unknown-schema-version', 'invalid-root-alias']),
    );
  });

  it('rejects invalid input roots and output ownership not declared by policy', () => {
    const result = validateExternalProcessorManifest({
      ...validManifest,
      outputs: {
        image: { produces: ['image/png'], ownership: 'debug' },
        sidecar: { produces: ['application/json'], ownership: 'promoted' },
      },
    });

    expect(result.manifest).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['illegal-output-ownership']),
    );
  });

  it('rejects undeclared and malformed template references', () => {
    const result = validateExternalProcessorManifest({
      ...validManifest,
      entry: {
        executable: '${TOOLS}/upscale',
        args: ['${input.missing}', '${output.image.extra}', '${params.scale}'],
      },
    });

    expect(result.manifest).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['undeclared-template-reference', 'invalid-template-reference']),
    );
  });

  it('blocks secret env inheritance for non-core processors', () => {
    const result = validateExternalProcessorManifest({
      ...validManifest,
      envProfile: {
        inherits: ['GITHUB_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'SSH_AUTH_SOCK'],
        denySecrets: true,
      },
    });

    expect(result.manifest).toBeUndefined();
    expect(
      result.diagnostics.filter((diagnostic) => diagnostic.code === 'unsupported-env-request'),
    ).toHaveLength(3);
  });

  it('rejects disabling host secret policy unless explicitly allowed by caller', () => {
    const rejected = validateExternalProcessorManifest({
      ...validManifest,
      envProfile: { denySecrets: false },
    });
    const allowed = validateExternalProcessorManifest(
      {
        ...validManifest,
        envProfile: { denySecrets: false },
      },
      { allowSecretEnv: true },
    );

    expect(rejected.manifest).toBeUndefined();
    expect(rejected.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'unsupported-env-request',
    );
    expect(allowed.manifest?.envProfile?.denySecrets).toBe(false);
  });

  it('exposes root alias and secret env helpers', () => {
    expect(isExternalProcessorRootAlias('resourceCache')).toBe(false);
    expect(isExternalProcessorRootAlias('extensionPrivateResources')).toBe(true);
    expect(isExternalProcessorRootAlias('tmp')).toBe(false);
    expect(matchesExternalProcessorSecretEnvPattern('NPM_TOKEN')).toBe(true);
    expect(matchesExternalProcessorSecretEnvPattern('CUDA_VISIBLE_DEVICES')).toBe(false);
  });
});

describe('external processor registry', () => {
  it('upserts registrations and emits revisioned lifecycle events', () => {
    const registry = createExternalProcessorRegistry();
    const events: string[] = [];
    registry.onDidChange((event) => {
      events.push(`${event.revision}:${event.kind}:${event.registrationId}`);
    });

    const first = registry.upsert(
      {
        sourceScope: 'project',
        agentCapabilitySource: 'local',
        sourceId: 'workspace',
        locationRef: '.neko/processors/upscale.neko-processor.json',
      },
      validManifest,
    );
    const updated = registry.upsert(
      {
        sourceScope: 'project',
        agentCapabilitySource: 'local',
        sourceId: 'workspace',
      },
      { ...validManifest, version: '1.0.1' },
    );

    expect(first.revision).toBe(1);
    expect(updated.revision).toBe(2);
    expect(first.version).toBe('1.0.0');
    expect(updated.version).toBe('1.0.1');
    expect(events).toEqual([
      '1:registered:project:workspace:upscale-image',
      '2:updated:project:workspace:upscale-image',
    ]);
  });

  it('filters disabled and trust-blocked processors during resolve/list', () => {
    const registry = createExternalProcessorRegistry();
    const registration = registry.upsert(
      {
        sourceScope: 'personal',
        agentCapabilitySource: 'local',
        sourceId: 'test-upscale',
        trustLevel: 'untrusted',
      },
      validManifest,
    );

    expect(registry.list().processors).toEqual([registration]);
    expect(registry.list({ allowedTrustLevels: ['core', 'community'] }).processors).toEqual([]);
    expect(
      registry.resolve('upscale-image', { allowedTrustLevels: ['core', 'community'] }),
    ).toEqual(expect.objectContaining({ code: 'untrusted-processor' }));

    registry.setEnabled({ registrationId: registration.registrationId }, false, 'Disabled by user');

    expect(registry.list().processors).toEqual([]);
    expect(registry.list({ includeDisabled: true }).processors[0]).toEqual(
      expect.objectContaining({ enabled: false }),
    );
    expect(registry.resolve('upscale-image')).toEqual(
      expect.objectContaining({ code: 'disabled-processor' }),
    );
  });

  it('unregisters processors and emits changes', () => {
    const registry = createExternalProcessorRegistry();
    const events: string[] = [];
    registry.onDidChange((event) => {
      events.push(event.kind);
    });
    registry.upsert(
      { sourceScope: 'extension', agentCapabilitySource: 'plugin', sourceId: 'neko-tools' },
      validManifest,
      { enabled: true },
    );

    const change = registry.unregister({ id: 'upscale-image' }, 'Extension deactivated');

    expect(change).toEqual(
      expect.objectContaining({
        kind: 'unregistered',
        registrationId: 'extension:neko-tools:upscale-image',
      }),
    );
    expect(registry.list({ includeDisabled: true }).processors).toEqual([]);
    expect(events).toEqual(['registered', 'unregistered']);
  });

  it('keeps a running invocation snapshot stable after manifest updates', () => {
    const registry = createExternalProcessorRegistry();
    const runningSnapshot = registry.upsert(
      { sourceScope: 'project', agentCapabilitySource: 'local', sourceId: 'workspace-1' },
      validManifest,
    );

    registry.upsert(
      { sourceScope: 'project', agentCapabilitySource: 'local', sourceId: 'workspace-1' },
      { ...validManifest, version: '1.2.0' },
    );

    expect(runningSnapshot).toEqual(expect.objectContaining({ revision: 1, version: '1.0.0' }));
    expect(registry.resolve('upscale-image')).toEqual(
      expect.objectContaining({ revision: 2, version: '1.2.0' }),
    );
  });

  it('covers unregister lifecycle for project, personal, and extension sources', () => {
    const registry = createExternalProcessorRegistry();
    registry.upsert(
      { sourceScope: 'project', agentCapabilitySource: 'local', sourceId: 'workspace-1' },
      validManifest,
    );
    registry.upsert(
      { sourceScope: 'personal', agentCapabilitySource: 'local', sourceId: 'user-local' },
      { ...validManifest, id: 'personal-upscale' },
    );
    registry.upsert(
      { sourceScope: 'extension', agentCapabilitySource: 'plugin', sourceId: 'neko.neko-tools' },
      { ...validManifest, id: 'extension-upscale' },
    );

    expect(registry.unregister({ id: 'upscale-image' }, 'Project file deleted')).toEqual(
      expect.objectContaining({
        kind: 'unregistered',
        registrationId: 'project:workspace-1:upscale-image',
        reason: 'Project file deleted',
      }),
    );
    expect(registry.unregister({ id: 'personal-upscale' }, 'Personal manifest removed')).toEqual(
      expect.objectContaining({
        kind: 'unregistered',
        registrationId: 'personal:user-local:personal-upscale',
      }),
    );
    expect(registry.unregister({ id: 'extension-upscale' }, 'Extension deactivated')).toEqual(
      expect.objectContaining({
        kind: 'unregistered',
        registrationId: 'extension:neko.neko-tools:extension-upscale',
      }),
    );
    expect(registry.list({ includeDisabled: true }).processors).toEqual([]);
  });

  it('registers builtin processors as core trust', () => {
    const registry = createExternalProcessorRegistry();
    const result = registerBuiltinExternalProcessors(registry, [validManifest]);

    expect(result.diagnostics).toEqual([]);
    expect(result.registrations[0]).toEqual(
      expect.objectContaining({
        registrationId: 'builtin:builtin:upscale-image',
        sourceScope: 'builtin',
        agentCapabilitySource: 'builtin',
        trustLevel: 'core',
      }),
    );
  });

  it('projects project manifests from .neko/processors files', () => {
    const registry = createExternalProcessorRegistry();
    const result = registerProjectExternalProcessorManifests({
      registry,
      workspaceSourceId: 'workspace-1',
      files: [
        {
          path: '.neko/processors/upscale.neko-processor.json',
          contents: JSON.stringify(validManifest),
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.registrations[0]).toEqual(
      expect.objectContaining({
        registrationId: 'project:workspace-1:upscale-image',
        sourceScope: 'project',
        agentCapabilitySource: 'local',
        trustLevel: 'untrusted',
        locationRef: '.neko/processors/upscale.neko-processor.json',
      }),
    );
  });

  it('returns diagnostics for invalid project manifest JSON', () => {
    const registry = createExternalProcessorRegistry();
    const result = registerProjectExternalProcessorManifests({
      registry,
      workspaceSourceId: 'workspace-1',
      files: [{ path: '.neko/processors/bad.neko-processor.json', contents: '{' }],
    });

    expect(result.registrations).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-manifest',
        details: expect.objectContaining({
          locationRef: '.neko/processors/bad.neko-processor.json',
        }),
      }),
    ]);
  });

  it('registers personal manifests only from explicit registry entries', () => {
    const registry = createExternalProcessorRegistry();
    const result = registerPersonalExternalProcessorManifests({
      registry,
      personalSourceId: 'user-local',
      entries: [
        {
          id: 'local-upscale',
          manifestPath: '${NEKO_HOME}/processors/upscale.neko-processor.json',
          contents: JSON.stringify(validManifest),
          enabled: true,
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.registrations[0]).toEqual(
      expect.objectContaining({
        registrationId: 'personal:user-local:upscale-image',
        sourceScope: 'personal',
        agentCapabilitySource: 'local',
        enabled: true,
        locationRef: '${NEKO_HOME}/processors/upscale.neko-processor.json',
      }),
    );
  });

  it('keeps personal entries disabled unless explicitly enabled', () => {
    const registry = createExternalProcessorRegistry();
    registerPersonalExternalProcessorManifests({
      registry,
      personalSourceId: 'user-local',
      entries: [
        {
          id: 'local-upscale',
          manifestPath: '${NEKO_HOME}/processors/upscale.neko-processor.json',
          contents: JSON.stringify(validManifest),
        },
      ],
    });

    expect(registry.list().processors).toEqual([]);
    expect(registry.list({ includeDisabled: true }).processors[0]).toEqual(
      expect.objectContaining({ enabled: false, sourceScope: 'personal' }),
    );
  });

  it('projects extension contributions through plugin source', () => {
    const registry = createExternalProcessorRegistry();
    const result = registerExtensionExternalProcessorContributions({
      registry,
      contributions: [
        {
          extensionId: 'neko.neko-tools',
          trustLevel: 'community',
          manifest: validManifest,
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.registrations[0]).toEqual(
      expect.objectContaining({
        registrationId: 'extension:neko.neko-tools:upscale-image',
        sourceScope: 'extension',
        agentCapabilitySource: 'plugin',
        trustLevel: 'community',
      }),
    );
  });

  it('does not let extension contributions self-declare core trust', () => {
    const registry = createExternalProcessorRegistry();
    const result = registerExtensionExternalProcessorContributions({
      registry,
      contributions: [
        {
          extensionId: 'neko.neko-tools',
          trustLevel: 'core',
          manifest: validManifest,
        },
      ],
    });

    expect(result.registrations[0]).toEqual(expect.objectContaining({ trustLevel: 'community' }));
    expect(result.diagnostics[0]).toEqual(
      expect.objectContaining({
        code: 'untrusted-processor',
        severity: 'warning',
      }),
    );
  });

  it('parses manifest JSON without executing author input formats', () => {
    expect(parseExternalProcessorManifestJson(JSON.stringify(validManifest)).value).toEqual(
      validManifest,
    );
    expect(
      parseExternalProcessorManifestJson('schema = "neko.externalProcessor"').diagnostics[0],
    ).toEqual(expect.objectContaining({ code: 'invalid-manifest' }));
  });
});
