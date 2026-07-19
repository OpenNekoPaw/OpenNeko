import { describe, expect, it } from 'vitest';
import {
  CATEGORY_MAP,
  getAssetCategory,
  isAssetType,
  isDistributionKind,
  isBundleType,
  isMediaKind,
  parseAssetManifest,
  validatePluginPermissionDeclarations,
  validateAssetManifest,
  type AssetManifest,
} from '../manifest';

function validManifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return {
    id: '@studio/cinematic-lut',
    name: 'Cinematic LUT',
    version: '1.0.0',
    type: 'preset',
    source: {
      kind: 'registry',
      registry: 'https://market.neko.dev/api/v1',
      package: '@studio/cinematic-lut',
      version: '1.0.0',
      integrity: 'sha256-abc',
    },
    distributionKind: 'archive',
    typeMetadata: {
      type: 'preset',
      data: { presetKind: 'lut' },
    },
    distribution: {
      license: 'MIT',
      author: 'Studio',
      tags: ['lut'],
      checksum: 'sha256-abc',
      signature: {
        algorithm: 'sha256',
        value: 'manifest-sha',
      },
    },
    intent: {
      useCases: ['color-grading'],
    },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('AssetManifest v4 contract', () => {
  it('accepts a valid v4 registry manifest', () => {
    const result = validateAssetManifest(validManifest());

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(parseAssetManifest(validManifest()).type).toBe('preset');
  });

  it('derives AssetCategory from v4 AssetType', () => {
    expect(CATEGORY_MAP.model).toBe('ai');
    expect(CATEGORY_MAP.endpoint).toBe('ai');
    expect(CATEGORY_MAP.provider).toBe('ai');
    expect(CATEGORY_MAP.profile).toBe('tooling');
    expect(CATEGORY_MAP.processor).toBe('tooling');
    expect(getAssetCategory('bundle')).toBe('bundle');
  });

  it('accepts profile-only packages without skill metadata', () => {
    const manifest = validManifest({
      id: '@studio/storyboard-profiles',
      name: 'storyboard-profiles',
      type: 'profile',
      typeMetadata: {
        type: 'profile',
        data: {
          profileKinds: ['artifact', 'provider-expression'],
          trustLevel: 'community',
          hostRequirements: [{ host: 'vscode' }, { host: 'tui', optional: true }],
          profiles: [
            {
              profileId: 'studio.storyboard.v1',
              kind: 'artifact',
              version: 1,
              descriptorPath: 'profiles/storyboard.profile.json',
            },
            {
              profileId: 'provider-expression:studio',
              kind: 'provider-expression',
              version: '1.0.0',
            },
          ],
        },
      },
    });

    expect(isAssetType('profile')).toBe(true);
    expect(parseAssetManifest(manifest).type).toBe('profile');
  });

  it('rejects malformed profile package catalog metadata', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'profile',
        typeMetadata: {
          type: 'profile',
          data: {
            profileKinds: ['artifact'],
            profiles: [
              {
                profileId: 'studio.invalid',
                kind: 'workflow' as never,
                version: '',
                descriptorPath: '../escape.json',
              },
            ],
            hostRequirements: [{ host: 'browser' }],
          },
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          field: 'typeMetadata.data.profiles.0.kind',
          message: 'must be a known profile package kind',
        },
        {
          field: 'typeMetadata.data.profiles.0.version',
          message: 'must be a non-empty string or integer',
        },
        {
          field: 'typeMetadata.data.profiles.0.descriptorPath',
          message: 'must be a package-relative path',
        },
        {
          field: 'typeMetadata.data.hostRequirements.0.host',
          message: 'must be vscode, cli, or tui',
        },
      ]),
    );
  });

  it('accepts processor market metadata with a package-relative processor manifest path', () => {
    const manifest = validManifest({
      id: '@studio/upscale-processor',
      name: 'upscale-processor',
      type: 'processor',
      typeMetadata: {
        type: 'processor',
        data: {
          processorManifestPath: 'processor.neko-processor.json',
          trustLevel: 'community',
        },
      },
    });
    const escaped = validateAssetManifest(
      validManifest({
        type: 'processor',
        typeMetadata: {
          type: 'processor',
          data: {
            processorManifestPath: '../processor.neko-processor.json',
            trustLevel: 'community',
          },
        },
      }),
    );

    expect(isAssetType('processor')).toBe(true);
    expect(validateAssetManifest(manifest).valid).toBe(true);
    expect(escaped.issues).toEqual(
      expect.arrayContaining([
        {
          field: 'typeMetadata.data.processorManifestPath',
          message: 'must be a package-relative path',
        },
      ]),
    );
  });

  it('rejects legacy asset types as direct AssetType values', () => {
    expect(isAssetType('media')).toBe(true);
    expect(isAssetType('video')).toBe(false);
    expect(validateAssetManifest({ ...validManifest(), type: 'video' }).issues).toContainEqual({
      field: 'type',
      message: 'must be one of AssetType v4 values',
    });
  });

  it('rejects metadata whose discriminator does not match manifest type', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'shader',
        typeMetadata: {
          type: 'model',
          data: {
            modelKind: 'base',
            framework: 'onnx',
            task: 'image-gen',
            size: 1,
          },
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'typeMetadata.type',
      message: 'must match manifest type',
    });
  });

  it('allows unknown optional manifest fields through parser', () => {
    const manifest = {
      ...validManifest(),
      futureOptionalField: { ignoredByOldClients: true },
    };

    expect(parseAssetManifest(manifest).id).toBe('@studio/cinematic-lut');
  });

  it('blocks unsupported distribution kind', () => {
    const result = validateAssetManifest({
      ...validManifest(),
      distributionKind: 'streaming',
    });

    expect(isDistributionKind('streaming')).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'distributionKind',
      message: 'must be one of archive, orchestration, registration',
    });
  });

  it('requires bundle contents and orchestration distribution', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'bundle',
        distributionKind: 'archive',
        typeMetadata: {
          type: 'bundle',
          data: { installPolicy: 'all' },
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { field: 'contents', message: 'bundle manifests must include contents' },
        { field: 'distributionKind', message: 'bundle must use orchestration' },
      ]),
    );
  });

  it('requires intent useCases for client-side fallback validation', () => {
    const result = validateAssetManifest({
      ...validManifest(),
      intent: { useCases: [] },
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'intent.useCases',
      message: 'must include at least one item',
    });
  });

  it('requires paid packages to declare notFor constraints', () => {
    const result = validateAssetManifest(
      validManifest({
        distribution: {
          license: 'Commercial',
          author: 'Studio',
          tags: ['lut'],
          checksum: 'sha256-abc',
          pricing: { model: 'paid', price: 12, currency: 'USD' },
          signature: {
            algorithm: 'sha256',
            value: 'manifest-sha',
          },
        },
        intent: {
          useCases: ['color-grading'],
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'intent.notFor',
      message: 'paid packages must include at least one notFor value',
    });
  });

  it('validates typeMetadata data required fields by asset type', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'model',
        typeMetadata: {
          type: 'model',
          data: {
            modelKind: 'base',
            framework: 'onnx',
          } as never,
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { field: 'typeMetadata.data.task', message: 'must be a non-empty string' },
        { field: 'typeMetadata.data.size', message: 'must be a number' },
      ]),
    );
  });

  it('accepts puppet, model, and voice media kinds for character assets', () => {
    const kinds = [
      'live2d-model',
      'live2d-config',
      'model-2d-scene',
      'model-3d',
      'model-motion',
      'model-config',
      'voice-pack',
    ] as const;

    for (const mediaKind of kinds) {
      const result = validateAssetManifest(
        validManifest({
          id: `@studio/${mediaKind}`,
          name: mediaKind,
          type: 'media',
          typeMetadata: {
            type: 'media',
            data: { mediaKind, fileSize: 1 },
          },
        }),
      );

      expect(isMediaKind(mediaKind)).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it('rejects unknown media kinds during shared manifest validation', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'media',
        typeMetadata: {
          type: 'media',
          data: { mediaKind: 'zip-blunder', fileSize: 1 } as never,
        },
      }),
    );

    expect(isMediaKind('zip-blunder')).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'typeMetadata.data.mediaKind',
      message: 'must be a known MediaKind',
    });
  });

  it('accepts character-pack and motion-pack bundle metadata', () => {
    for (const bundleType of ['character-pack', 'motion-pack'] as const) {
      const result = validateAssetManifest(
        validManifest({
          id: `@studio/${bundleType}`,
          name: bundleType,
          type: 'bundle',
          distributionKind: 'orchestration',
          typeMetadata: {
            type: 'bundle',
            data: { installPolicy: 'all', bundleType },
          },
          contents: [
            {
              packageId: '@studio/asset',
              version: '^1.0.0',
              role: bundleType === 'character-pack' ? 'model' : 'motion',
            },
          ],
        }),
      );

      expect(isBundleType(bundleType)).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it('rejects unknown bundle metadata type', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'bundle',
        distributionKind: 'orchestration',
        typeMetadata: {
          type: 'bundle',
          data: { installPolicy: 'all', bundleType: 'loot-box' } as never,
        },
        contents: [{ packageId: '@studio/asset', version: '^1.0.0' }],
      }),
    );

    expect(isBundleType('loot-box')).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      field: 'typeMetadata.data.bundleType',
      message: 'must be a known BundleType',
    });
  });

  it('validates plugin metadata as native cdylib metadata', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'plugin',
        typeMetadata: {
          type: 'plugin',
          data: {
            entryPoint: 'plugin_init',
            apiVersion: '1.0',
            permissions: ['network:host-list'],
            networkHosts: ['api.example.com'],
            engineRequirements: {
              minVersion: '1.0',
              targetTriple: 'aarch64-apple-darwin',
              runtimeArtifacts: ['cdylib'],
            },
          },
        },
      }),
    );

    expect(result.valid).toBe(true);
  });

  it('rejects plugin metadata without cdylib engine requirements', () => {
    const result = validateAssetManifest(
      validManifest({
        type: 'plugin',
        typeMetadata: {
          type: 'plugin',
          data: {
            entryPoint: 'plugin_init',
            apiVersion: '1.0',
            permissions: ['network:host-list'],
          } as never,
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          field: 'typeMetadata.data.networkHosts',
          message: 'required when permissions includes network:host-list',
        },
        { field: 'typeMetadata.data.engineRequirements', message: 'must be an object' },
      ]),
    );
  });

  it('supports publisher verified projection in distribution metadata', () => {
    const manifest = validManifest({
      distribution: {
        license: 'Commercial',
        author: 'Studio',
        tags: ['plugin'],
        checksum: 'sha256-abc',
        trustLevel: 'community',
        verified: false,
        publisher: {
          id: 'abc-studio',
          displayName: 'ABC Studio',
          verified: true,
          verificationTier: 'verified',
          verifiedAt: 1_700_000_000_000,
        },
        signature: {
          algorithm: 'sha256',
          value: 'manifest-sha',
        },
      },
    });

    expect(manifest.distribution?.publisher?.verified).toBe(true);
    expect(manifest.distribution?.verified).toBe(false);
    expect(validateAssetManifest(manifest).valid).toBe(true);
  });

  it('requires local sources to use variable paths and copy-managed root', () => {
    const absolute = validateAssetManifest(
      validManifest({
        source: { kind: 'local', path: '/Users/me/luts/warm.cube', storageMode: 'copy-managed' },
      }),
    );
    const local = validateAssetManifest(
      validManifest({
        source: {
          kind: 'local',
          path: '${NEKO_HOME}/local/presets/lut/warm/warm.cube',
          storageMode: 'copy-managed',
        },
      }),
    );
    const linked = validateAssetManifest(
      validManifest({
        source: {
          kind: 'local-link',
          path: '${WORKSPACE}/luts/warm.cube',
          storageMode: 'local-link',
        },
      }),
    );

    expect(absolute.valid).toBe(false);
    expect(absolute.issues).toEqual(
      expect.arrayContaining([
        {
          field: 'source.path',
          message:
            'must use PathResolver variable form such as ${NEKO_HOME}/... or ${WORKSPACE}/...',
        },
      ]),
    );
    expect(local.valid).toBe(true);
    expect(linked.valid).toBe(true);
  });

  it('reports high-sensitive plugin permission diagnostics', () => {
    const diagnostics = validatePluginPermissionDeclarations({
      permissions: ['network:host-list', 'network:any', 'process-spawn'],
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        {
          field: 'networkHosts',
          severity: 'error',
          permission: 'network:host-list',
          message: 'required when permissions includes network:host-list',
        },
        expect.objectContaining({
          severity: 'warning',
          permission: 'network:any',
        }),
        expect.objectContaining({
          severity: 'warning',
          permission: 'process-spawn',
        }),
      ]),
    );
  });

  it('accepts shader and model local validation metadata', () => {
    const shader = validateAssetManifest(
      validManifest({
        type: 'shader',
        typeMetadata: {
          type: 'shader',
          data: {
            shaderKind: 'standalone',
            language: 'wgsl',
            stage: 'fragment',
            inputs: [],
            artifactForm: 'spirv-binary',
            localValidation: {
              validator: 'spirv-val',
              sourceWarning: true,
              resourceLimits: { maxCompileTimeMs: 1_000 },
            },
          },
        },
      }),
    );
    const model = validateAssetManifest(
      validManifest({
        type: 'model',
        typeMetadata: {
          type: 'model',
          data: {
            modelKind: 'base',
            framework: 'gguf',
            task: 'chat',
            size: 1024,
            localValidation: {
              sourceWarning: true,
              resourcePolicy: { maxRamMB: 4096, allowTrustedWorkspaceOverride: true },
            },
          },
        },
      }),
    );

    expect(shader.valid).toBe(true);
    expect(model.valid).toBe(true);
  });

  it('validates large asset mode-specific invariants', () => {
    const result = validateAssetManifest(
      validManifest({
        largeAsset: {
          modes: ['proxy', 'variant', 'delta'],
          totalSize: 100,
          proxyVariants: [
            { qualityTag: 'low', size: 10 },
            { qualityTag: 'high', size: 100 },
          ],
          variants: [
            { variantId: 'fp16', size: 100 },
            { variantId: 'int8', size: 50 },
          ],
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          field: 'largeAsset.proxyVariants',
          message: 'proxy mode requires exactly one default variant',
        },
        {
          field: 'largeAsset.variants',
          message: 'variant mode requires exactly one recommended variant',
        },
        { field: 'largeAsset.deltaBase', message: 'required for delta mode' },
      ]),
    );
  });
});
