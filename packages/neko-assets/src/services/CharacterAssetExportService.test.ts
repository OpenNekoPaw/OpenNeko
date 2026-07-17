import { describe, expect, it, vi } from 'vitest';
import type {
  AssetEntity,
  CharacterRecord,
  EntityAssetBinding,
  NkpNativeProjectData,
} from '@neko/shared';
import { CharacterAssetExportService } from './CharacterAssetExportService';

describe('CharacterAssetExportService', () => {
  it('exports .nkentity with character metadata and bound asset references', async () => {
    const fs = createFs();
    const service = createService(fs);

    const result = await service.exportEntity({
      projectRoot: '/repo',
      entityId: 'char-sakura',
      outputPath: '/repo/out/sakura.nkentity',
    });

    expect(result.entity).toMatchObject({
      format: 'nkentity',
      entity: { name: 'Sakura', aliases: ['桜'] },
      bindings: [
        {
          role: 'live2d',
          mediaKind: 'puppet-model',
          dimension: 'model',
          assetEntityId: 'asset-sakura-model',
        },
        {
          role: 'motion',
          mediaKind: 'puppet-motion',
          dimension: 'motion',
          assetEntityId: 'asset-sakura-motion',
        },
      ],
    });
    expect(JSON.parse(String(fs.files.get('/repo/out/sakura.nkentity')))).toMatchObject({
      format: 'nkentity',
    });
  });

  it('exports character-pack bundle manifest, entity artifact, and subpackage files', async () => {
    const fs = createFs({
      '/repo/assets/sakura.nkp': Buffer.from('project'),
      '/repo/assets/idle.motion3.json': Buffer.from('{}'),
    });
    const writtenZips: FakeZip[] = [];
    const service = createService(fs, {
      zipConstructor: fakeZipConstructor(writtenZips),
    });

    const result = await service.exportCharacterPack({
      projectRoot: '/repo',
      entityId: 'char-sakura',
      outputPath: '/repo/out/sakura-character-pack.zip',
      name: 'Sakura Pack',
    });

    expect(result.manifest).toMatchObject({
      type: 'bundle',
      distributionKind: 'orchestration',
      typeMetadata: {
        type: 'bundle',
        data: { bundleType: 'character-pack' },
      },
    });
    expect([...(writtenZips[0]?.entries.keys() ?? [])]).toEqual(
      expect.arrayContaining([
        'manifest.json',
        'entity.nkentity',
        'assets/asset-sakura-model/manifest.json',
        'assets/asset-sakura-model/files/sakura.nkp',
        'assets/asset-sakura-motion/manifest.json',
        'assets/asset-sakura-motion/files/idle.motion3.json',
      ]),
    );
    expect(fs.files.get('/repo/out/sakura-character-pack.zip')).toBeInstanceOf(Buffer);
  });

  it('exports native .nkp v2 data without mutating the source puppet', async () => {
    const fs = createFs({
      '/repo/assets/sakura-native.nkp': Buffer.from(
        JSON.stringify(nativePuppetProjectFixture),
        'utf-8',
      ),
    });
    const service = createService(fs);

    const result = await service.exportNativePuppetProject({
      sourcePath: '/repo/assets/sakura-native.nkp',
      outputPath: '/repo/out/sakura-exported.nkp',
      name: 'Sakura Exported',
    });

    const exported = JSON.parse(String(fs.files.get('/repo/out/sakura-exported.nkp')));
    expect(result).toMatchObject({
      format: 'nkp',
      files: [{ role: 'model', mediaKind: 'puppet-model', dimension: 'model' }],
    });
    expect(exported).toMatchObject({
      name: 'Sakura Exported',
      puppet: { format: 'native', animationModel: 'bone-blendshape' },
    });
    expect(JSON.parse(String(fs.files.get('/repo/assets/sakura-native.nkp')))).toMatchObject({
      name: 'Sakura Native',
    });
  });

  it('exports Spine JSON from native skeleton, mesh, skin weights, and animation data', async () => {
    const fs = createFs({
      '/repo/assets/sakura-native.nkp': Buffer.from(
        JSON.stringify(nativePuppetProjectFixture),
        'utf-8',
      ),
    });
    const service = createService(fs);

    const result = await service.exportNativePuppetSpineJson({
      sourcePath: '/repo/assets/sakura-native.nkp',
      outputPath: '/repo/out/sakura.spine.json',
    });

    const exported = JSON.parse(String(fs.files.get('/repo/out/sakura.spine.json')));
    expect(result).toMatchObject({
      format: 'spine-json',
      files: [{ role: 'spine-json', mediaKind: 'puppet-model', dimension: 'model' }],
    });
    expect(exported).toMatchObject({
      skeleton: { name: 'Sakura Native' },
      bones: [expect.objectContaining({ name: 'bone-root' })],
      slots: [expect.objectContaining({ name: 'layer-face', bone: 'bone-root' })],
      neko: {
        source: 'nkp-v2-native',
        animationModel: 'bone-blendshape',
        blendShapes: ['jawOpen'],
      },
    });
    expect(exported.skins[0].attachments['layer-face']['layer-face']).toMatchObject({
      type: 'mesh',
      path: 'textures/face.png',
      nekoSkinWeights: { meshId: 'mesh-face' },
    });
    expect(exported.animations).toHaveProperty('idle');
  });

  it('exports spritesheet bake and Lottie compatibility plans without source mutation', async () => {
    const fs = createFs({
      '/repo/assets/sakura-native.nkp': Buffer.from(
        JSON.stringify(nativePuppetProjectFixture),
        'utf-8',
      ),
    });
    const service = createService(fs);

    const spritesheet = await service.exportNativePuppetSpritesheetPlan({
      sourcePath: '/repo/assets/sakura-native.nkp',
      outputPath: '/repo/out/sakura-spritesheet.json',
      frameRate: 12,
      frameSize: [512, 512],
    });
    const lottie = await service.exportNativePuppetLottiePlan({
      sourcePath: '/repo/assets/sakura-native.nkp',
      outputPath: '/repo/out/sakura-lottie-plan.json',
    });

    const spritesheetPlan = JSON.parse(String(fs.files.get('/repo/out/sakura-spritesheet.json')));
    const lottiePlan = JSON.parse(String(fs.files.get('/repo/out/sakura-lottie-plan.json')));
    expect(spritesheet).toMatchObject({
      format: 'spritesheet',
      files: [{ role: 'spritesheet', mediaKind: 'puppet-motion', dimension: 'motion' }],
    });
    expect(spritesheetPlan).toMatchObject({
      format: 'neko-native-puppet-spritesheet-plan',
      mutatesSource: false,
      target: { frameRate: 12, frameSize: [512, 512] },
      clips: [expect.objectContaining({ name: 'idle', frameCount: 12 })],
    });
    expect(lottie).toMatchObject({
      format: 'lottie-plan',
      files: [{ role: 'diagnostic' }],
    });
    expect(lottiePlan).toMatchObject({
      format: 'neko-native-puppet-lottie-plan',
      mutatesSource: false,
      status: 'unsupported',
      fallbackTargets: ['spritesheet', 'spine-json'],
    });
    expect(JSON.parse(String(fs.files.get('/repo/assets/sakura-native.nkp')))).toMatchObject({
      name: 'Sakura Native',
    });
  });

  it('exports .nkentity v2 metadata for native puppet bindings and optional Live2D bindings', async () => {
    const fs = createFs();
    const service = createService(fs, {
      assetEntities: nativePuppetAssetEntities(),
      bindings: nativePuppetBindings(),
    });

    const result = await service.exportEntity({
      projectRoot: '/repo',
      entityId: 'char-sakura',
      outputPath: '/repo/out/sakura-native.nkentity',
    });

    expect(result.entity).toMatchObject({
      version: 2,
      metadata: {
        nativePuppet: {
          rigTemplate: 'humanoid_upper',
          blendshapeStandard: 'arkit_52',
          implementedBlendShapes: ['jawOpen', 'mouthSmileLeft'],
          animationModel: 'bone-blendshape',
          sourceKind: 'live2d-bundle',
        },
      },
      bindings: [
        expect.objectContaining({
          role: 'live2d',
          assetEntityId: 'asset-sakura-live2d',
          optional: true,
        }),
        expect.objectContaining({
          role: 'puppet-bone',
          assetEntityId: 'asset-sakura-native',
          optional: false,
          metadata: expect.objectContaining({
            animationModel: 'bone-blendshape',
            implementedBlendShapes: ['jawOpen', 'mouthSmileLeft'],
          }),
        }),
      ],
    });
  });

  it('exports character-pack with native puppet package and optional Live2D fallback', async () => {
    const fs = createFs({
      '/repo/assets/sakura-native.nkp': Buffer.from('native-project'),
      '/repo/assets/sakura-live2d.zip': Buffer.from('legacy-live2d'),
    });
    const writtenZips: FakeZip[] = [];
    const service = createService(fs, {
      zipConstructor: fakeZipConstructor(writtenZips),
      assetEntities: nativePuppetAssetEntities(),
      bindings: nativePuppetBindings(),
    });

    const result = await service.exportCharacterPack({
      projectRoot: '/repo',
      entityId: 'char-sakura',
      outputPath: '/repo/out/sakura-native-pack.zip',
      name: 'Sakura Native Pack',
    });

    const entries = [...(writtenZips[0]?.entries.keys() ?? [])];
    const entityBytes = writtenZips[0]?.entries.get('entity.nkentity');
    const packagedEntity = entityBytes ? JSON.parse(entityBytes.toString('utf-8')) : undefined;
    expect(entries).toEqual(
      expect.arrayContaining([
        'assets/asset-sakura-native/manifest.json',
        'assets/asset-sakura-native/files/sakura-native.nkp',
        'assets/asset-sakura-live2d/manifest.json',
        'assets/asset-sakura-live2d/files/sakura-live2d.zip',
      ]),
    );
    expect(result.manifest.contents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ packageId: 'local/asset-sakura-native', role: 'puppet-bone' }),
        expect.objectContaining({
          packageId: 'local/asset-sakura-live2d',
          role: 'live2d',
          optional: true,
        }),
      ]),
    );
    expect(packagedEntity).toMatchObject({
      version: 2,
      metadata: {
        nativePuppet: {
          animationModel: 'bone-blendshape',
          sourceKind: 'live2d-bundle',
        },
      },
      bindings: [
        expect.objectContaining({
          role: 'live2d',
          ref: './assets/asset-sakura-live2d/manifest.json',
        }),
        expect.objectContaining({
          role: 'puppet-bone',
          ref: './assets/asset-sakura-native/manifest.json',
        }),
      ],
    });
  });

  it('plans native puppet game and video exports with non-mutating diagnostics', () => {
    const service = createService();

    expect(
      service.planNativePuppetSpineExport({
        sourcePath: '/repo/assets/sakura-native.nkp',
        outputPath: '/repo/out/sakura.spine.json',
      }),
    ).toMatchObject({
      target: 'spine-json',
      mutatesSource: false,
      files: [{ role: 'spine-json', mediaKind: 'puppet-model', dimension: 'model' }],
      diagnostics: [{ code: 'spine-native-data-required', severity: 'info' }],
    });
    expect(
      service.planNativePuppetSpritesheetExport({
        sourcePath: '/repo/assets/sakura-native.nkp',
        outputPath: '/repo/out/sakura-spritesheet.json',
      }),
    ).toMatchObject({
      target: 'spritesheet',
      mutatesSource: false,
      files: [{ role: 'spritesheet', mediaKind: 'puppet-motion', dimension: 'motion' }],
      diagnostics: [{ code: 'spritesheet-bake-plan', severity: 'info' }],
    });
    expect(
      service.planNativePuppetLottieExport({
        sourcePath: '/repo/assets/sakura-native.nkp',
        outputPath: '/repo/out/sakura-lottie-plan.json',
      }),
    ).toMatchObject({
      target: 'lottie',
      mutatesSource: false,
      files: [{ role: 'diagnostic' }],
      diagnostics: [{ code: 'lottie-native-skinning-unsupported', severity: 'unsupported' }],
    });
  });
});

function createService(
  fs = createFs(),
  options: {
    readonly zipConstructor?: new () => FakeZip;
    readonly assetEntities?: readonly AssetEntity[];
    readonly bindings?: readonly EntityAssetBinding[];
  } = {},
) {
  return new CharacterAssetExportService({
    fs,
    library: {
      getAllEntities: vi.fn(async () => options.assetEntities ?? assetEntities()),
      resolvePath: (storedPath) =>
        storedPath.startsWith('/') ? storedPath : `/repo/${storedPath}`,
    },
    characters: {
      list: vi.fn(async () => characters()),
    },
    bindings: {
      list: vi.fn(async () => options.bindings ?? bindings()),
    },
    zipConstructor: options.zipConstructor ?? fakeZipConstructor([]),
    now: () => new Date('2026-05-20T00:00:00.000Z'),
  });
}

function characters(): readonly CharacterRecord[] {
  return [
    {
      id: 'char-sakura',
      canonicalName: 'Sakura',
      aliases: ['桜'],
      status: 'confirmed',
      metadata: { role: 'protagonist' },
    },
  ];
}

function bindings(): readonly EntityAssetBinding[] {
  return [
    {
      id: 'binding-model',
      entityId: 'char-sakura',
      entityKind: 'character',
      assetRef: 'project://assets/asset-sakura-model',
      role: 'live2d',
      isDefault: true,
      status: 'confirmed',
      source: 'user',
      updatedAt: '2026-05-20T00:00:00.000Z',
    },
    {
      id: 'binding-motion',
      entityId: 'char-sakura',
      entityKind: 'character',
      assetRef: 'project://assets/asset-sakura-motion',
      role: 'motion',
      status: 'confirmed',
      source: 'user',
      updatedAt: '2026-05-20T00:00:00.000Z',
    },
  ];
}

function assetEntities(): readonly AssetEntity[] {
  return [
    assetEntity({
      id: 'asset-sakura-model',
      name: 'Sakura Model',
      filePath: '/repo/assets/sakura.nkp',
      mediaKind: 'puppet-model',
      dimension: 'model',
    }),
    assetEntity({
      id: 'asset-sakura-motion',
      name: 'Sakura Idle',
      filePath: '/repo/assets/idle.motion3.json',
      mediaKind: 'puppet-motion',
      dimension: 'motion',
    }),
  ];
}

function nativePuppetBindings(): readonly EntityAssetBinding[] {
  return [
    {
      id: 'binding-native',
      entityId: 'char-sakura',
      entityKind: 'character',
      assetRef: 'project://assets/asset-sakura-native',
      role: 'puppet-bone',
      isDefault: true,
      status: 'confirmed',
      source: 'importer',
      updatedAt: '2026-05-20T00:00:00.000Z',
    },
    {
      id: 'binding-live2d',
      entityId: 'char-sakura',
      entityKind: 'character',
      assetRef: 'project://assets/asset-sakura-live2d',
      role: 'live2d',
      status: 'confirmed',
      source: 'importer',
      updatedAt: '2026-05-20T00:00:00.000Z',
    },
  ];
}

function nativePuppetAssetEntities(): readonly AssetEntity[] {
  return [
    assetEntity({
      id: 'asset-sakura-native',
      name: 'Sakura Native Puppet',
      filePath: '/repo/assets/sakura-native.nkp',
      mediaKind: 'puppet-model',
      dimension: 'model',
      characterAsset: {
        rigTemplate: 'humanoid_upper',
        blendshapeStandard: 'arkit_52',
        implementedBlendShapes: ['jawOpen', 'mouthSmileLeft'],
        animationModel: 'bone-blendshape',
        sourceKind: 'live2d-bundle',
      },
    }),
    assetEntity({
      id: 'asset-sakura-live2d',
      name: 'Sakura Legacy Live2D',
      filePath: '/repo/assets/sakura-live2d.zip',
      mediaKind: 'puppet-model',
      dimension: 'model',
    }),
  ];
}

const nativePuppetProjectFixture: NkpNativeProjectData = {
  version: '2.0',
  name: 'Sakura Native',
  puppet: {
    src: null,
    format: 'native',
    animationModel: 'bone-blendshape',
    importSource: { kind: 'live2d-bundle', path: './sakura-live2d.zip' },
  },
  layers: [
    {
      id: 'layer-face',
      name: 'Face',
      textureRef: 'textures/face.png',
      mesh: {
        id: 'mesh-face',
        vertices: [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
      },
      skinWeights: {
        meshId: 'mesh-face',
        jointIndices: [
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
        jointWeights: [
          [1, 0, 0, 0],
          [1, 0, 0, 0],
          [1, 0, 0, 0],
        ],
      },
    },
  ],
  skeleton: {
    bones: [{ id: 'bone-root', name: 'root', parent: null, position: [0, 0] }],
  },
  blendShapes: {
    standard: 'arkit_52',
    implemented: ['jawOpen'],
    shapes: [
      {
        id: 'shape-jaw-open',
        name: 'jawOpen',
        meshId: 'mesh-face',
        vertexDeltas: [
          [0, 0],
          [0, 0.1],
          [0, 0.1],
        ],
      },
    ],
  },
  controlDrivers: [],
  expressions: {},
  animations: [
    {
      name: 'idle',
      durationMs: 1000,
      boneTracks: [
        {
          bone: 'bone-root',
          rotationKeys: [
            { timeMs: 0, value: 0 },
            { timeMs: 1000, value: 2 },
          ],
        },
      ],
      blendshapeTracks: [
        {
          blendshape: 'jawOpen',
          weightKeys: [
            { timeMs: 0, value: 0 },
            { timeMs: 500, value: 0.5 },
          ],
        },
      ],
    },
  ],
  autoRig: {
    template: 'humanoid_upper',
    generatedBy: 'neko-auto-rig/test',
    confidence: 0.8,
    sourceKind: 'live2d-bundle',
  },
  parameters: {},
  viewport: { zoom: 1 },
};

function assetEntity(input: {
  readonly id: string;
  readonly name: string;
  readonly filePath: string;
  readonly mediaKind: 'puppet-model' | 'puppet-motion';
  readonly dimension: 'model' | 'motion';
  readonly characterAsset?: Partial<
    AssetEntity['variants'][number]['files'][number]['characterAsset']
  >;
}): AssetEntity {
  return {
    id: input.id,
    name: input.name,
    category: 'character',
    metadata: {},
    tags: [input.mediaKind],
    usageCount: 0,
    createdAt: 1,
    updatedAt: 1,
    variants: [
      {
        id: `${input.id}-variant`,
        entityId: input.id,
        name: input.dimension,
        attributes: {},
        createdAt: 1,
        files: [
          {
            id: `${input.id}-file`,
            variantId: `${input.id}-variant`,
            name: input.name,
            path: input.filePath,
            mediaType: 'document',
            metadata: { fileSize: 10, mimeType: 'application/octet-stream' },
            purpose: 'main',
            createdAt: 1,
            characterAsset: {
              assetDimension: input.dimension,
              mediaKind: input.mediaKind,
              storageMode: 'workspace',
              ...input.characterAsset,
            },
          },
        ],
      },
    ],
  };
}

class FakeZip {
  readonly entries = new Map<string, Buffer>();

  addFile(entryName: string, data: Buffer) {
    this.entries.set(entryName, Buffer.from(data));
  }

  toBuffer() {
    return Buffer.from(JSON.stringify([...this.entries.keys()]), 'utf-8');
  }
}

function fakeZipConstructor(writtenZips: FakeZip[]) {
  return class TestZip extends FakeZip {
    constructor() {
      super();
      writtenZips.push(this);
    }
  };
}

function createFs(initialFiles: Record<string, Uint8Array> = {}) {
  const files = new Map<string, string | Uint8Array>(Object.entries(initialFiles));
  return {
    files,
    readFile: vi.fn(async (filePath: string) => {
      const file = files.get(filePath);
      if (file === undefined) throw new Error(`Missing file: ${filePath}`);
      return typeof file === 'string' ? Buffer.from(file, 'utf-8') : file;
    }),
    writeFile: vi.fn(async (filePath: string, data: Uint8Array) => {
      files.set(filePath, Buffer.from(data));
    }),
    createDirectory: vi.fn(async () => undefined),
    exists: vi.fn(async (filePath: string) => files.has(filePath)),
  };
}
