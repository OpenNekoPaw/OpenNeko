import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterRegistryService } from '../character-registry';
import {
  CharacterRecordAdapter,
  CreativeEntityRegistryService,
  DefaultAssetRefResolver,
  EntityAssetBindingService,
  EntityAssetRequirementService,
  RepresentationResolver,
  VisualIdentityDraftService,
  characterRecordToCreativeEntity,
  resolveEntityAssetRequirementsPath,
  resolveEntityAssetBindingsPath,
  resolveVisualIdentityDraftsPath,
} from '../creative-entity-composition';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
}));

describe('creative entity composition extension utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adapts CharacterRecord as CreativeEntity(kind=character)', () => {
    expect(
      characterRecordToCreativeEntity({
        id: 'char_linxia',
        canonicalName: '林夏',
        displayName: 'Lin Xia',
        aliases: ['小夏'],
        status: 'candidate',
        metadata: { role: 'transfer student' },
      }),
    ).toEqual({
      id: 'char_linxia',
      kind: 'character',
      canonicalName: '林夏',
      displayName: 'Lin Xia',
      aliases: ['小夏'],
      status: 'candidate',
      metadata: { role: 'transfer student' },
    });
  });

  it('lists and resolves character-backed creative entities', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'char_linxia',
            canonicalName: '林夏',
            displayName: 'Lin Xia',
            aliases: ['小夏'],
            status: 'confirmed',
            bindings: { scriptNames: ['LINXIA'] },
          },
        ],
      }),
    );

    const adapter = new CharacterRecordAdapter(
      new CharacterRegistryService('/workspace/characters.json'),
    );
    const registry = new CreativeEntityRegistryService([adapter]);

    await expect(registry.list({ kind: 'character' })).resolves.toEqual([
      expect.objectContaining({ id: 'char_linxia', kind: 'character' }),
    ]);
    await expect(registry.resolveByName('LINXIA')).resolves.toEqual(
      expect.objectContaining({ id: 'char_linxia', kind: 'character' }),
    );
    await expect(registry.resolveByName('LINXIA', 'scene')).resolves.toBeUndefined();
  });

  it('resolves binding storage outside cache', () => {
    expect(resolveEntityAssetBindingsPath('/workspace')).toBe(
      '/workspace/neko/entity-bindings.json',
    );
    expect(
      () => new EntityAssetBindingService('/workspace/.neko/.cache/entity-bindings.json'),
    ).toThrow(/must not be stored/);
  });

  it('persists bindings with deterministic current-state JSON', async () => {
    const fs = await import('node:fs/promises');
    let persisted = JSON.stringify({ version: 1, bindings: [] });
    let staged = persisted;

    vi.mocked(fs.readFile).mockImplementation(async () => persisted);
    vi.mocked(fs.writeFile).mockImplementation(async (_path, content) => {
      staged = String(content);
    });
    vi.mocked(fs.rename).mockImplementation(async () => {
      persisted = staged;
    });

    const service = new EntityAssetBindingService('/workspace/neko/entity-bindings.json');

    await service.upsert({
      id: 'bind-live2d',
      entityId: 'char_linxia',
      entityKind: 'character',
      assetRef: 'project://assets/linxia-live2d',
      role: 'live2d',
      status: 'confirmed',
      source: 'user',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });
    await service.upsert({
      id: 'bind-portrait',
      entityId: 'char_linxia',
      entityKind: 'character',
      assetRef: 'project://assets/linxia-portrait-v1',
      role: 'portrait',
      isDefault: true,
      status: 'confirmed',
      source: 'user',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });

    await expect(service.load()).resolves.toEqual({
      version: 1,
      bindings: [
        expect.objectContaining({ id: 'bind-live2d' }),
        expect.objectContaining({ id: 'bind-portrait' }),
      ],
    });
    expect(fs.mkdir).toHaveBeenCalledWith('/workspace/neko', { recursive: true });
    expect(fs.writeFile).toHaveBeenLastCalledWith(
      '/workspace/neko/entity-bindings.json.tmp',
      expect.stringContaining('"bindings"'),
      'utf-8',
    );
  });

  it('replaces a binding as current state instead of appending history', async () => {
    const fs = await import('node:fs/promises');
    let persisted = JSON.stringify({ version: 1, bindings: [] });
    let staged = persisted;

    vi.mocked(fs.readFile).mockImplementation(async () => persisted);
    vi.mocked(fs.writeFile).mockImplementation(async (_path, content) => {
      staged = String(content);
    });
    vi.mocked(fs.rename).mockImplementation(async () => {
      persisted = staged;
    });

    const service = new EntityAssetBindingService('/workspace/neko/entity-bindings.json');
    const base = {
      id: 'bind-portrait',
      entityId: 'char_linxia',
      entityKind: 'character' as const,
      role: 'portrait' as const,
      status: 'confirmed' as const,
      source: 'user' as const,
      updatedAt: '2026-05-10T00:00:00.000Z',
    };

    await service.upsert({ ...base, assetRef: 'project://assets/linxia-portrait-v1' });
    await service.upsert({ ...base, assetRef: 'project://assets/linxia-portrait-v2' });

    await expect(service.list()).resolves.toEqual([
      expect.objectContaining({
        id: 'bind-portrait',
        assetRef: 'project://assets/linxia-portrait-v2',
      }),
    ]);
  });

  it('sets one default binding per entity role', async () => {
    const fs = await import('node:fs/promises');
    let persisted = JSON.stringify({
      version: 1,
      bindings: [
        {
          id: 'bind-portrait-v1',
          entityId: 'char_linxia',
          entityKind: 'character',
          assetRef: 'project://assets/linxia-portrait-v1',
          role: 'portrait',
          isDefault: true,
          status: 'confirmed',
          source: 'user',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ],
    });
    let staged = persisted;

    vi.mocked(fs.readFile).mockImplementation(async () => persisted);
    vi.mocked(fs.writeFile).mockImplementation(async (_path, content) => {
      staged = String(content);
    });
    vi.mocked(fs.rename).mockImplementation(async () => {
      persisted = staged;
    });

    const service = new EntityAssetBindingService('/workspace/neko/entity-bindings.json');
    await service.setDefault({
      id: 'bind-portrait-v2',
      entityId: 'char_linxia',
      entityKind: 'character',
      assetRef: 'project://assets/linxia-portrait-v2',
      role: 'portrait',
      status: 'confirmed',
      source: 'user',
      updatedAt: '2026-05-10T00:00:00.000Z',
    });

    const nextBindings = await service.list();
    expect(nextBindings).toEqual([
      expect.objectContaining({ id: 'bind-portrait-v1' }),
      expect.objectContaining({ id: 'bind-portrait-v2', isDefault: true }),
    ]);
    expect(nextBindings[0]).not.toHaveProperty('isDefault');
  });

  it('parses and validates supported assetRef schemes with query qualifiers', () => {
    const resolver = new DefaultAssetRefResolver();

    expect(
      resolver.parse('market://package/com.example.avatar@1.2.0/files/linxia.nkp?channel=stable'),
    ).toEqual({
      scheme: 'market',
      raw: 'market://package/com.example.avatar@1.2.0/files/linxia.nkp?channel=stable',
      authority: 'package',
      path: 'com.example.avatar@1.2.0/files/linxia.nkp',
      version: undefined,
      query: { channel: 'stable' },
    });
    expect(resolver.validate('project://assets/linxia?variant=portrait-v2')).toEqual({
      valid: true,
    });
    expect(resolver.validate('file:///tmp/linxia.png')).toEqual({
      valid: false,
      reason: expect.stringContaining('unsupported scheme'),
    });
  });

  it('resolves project refs through injected project backend without exposing binding writes', async () => {
    const project = vi.fn(async (parsed) => ({
      source: 'project' as const,
      readonly: false,
      assetEntityId: parsed.path,
      capabilities: ['thumbnail'],
    }));
    const resolver = new DefaultAssetRefResolver({ project });

    await expect(resolver.resolve('project://assets/linxia-portrait-v1')).resolves.toEqual({
      ref: 'project://assets/linxia-portrait-v1',
      scheme: 'project',
      source: 'project',
      readonly: false,
      assetEntityId: 'linxia-portrait-v1',
      capabilities: ['thumbnail'],
    });
    expect(project).toHaveBeenCalledWith(
      expect.objectContaining({
        scheme: 'project',
        authority: 'assets',
        path: 'linxia-portrait-v1',
      }),
    );
  });

  it('keeps market, shared, and external refs read-only by default', async () => {
    const resolver = new DefaultAssetRefResolver();

    await expect(resolver.resolve('market://package/avatar@1.0.0/file.nkp')).resolves.toEqual(
      expect.objectContaining({ scheme: 'market', source: 'market', readonly: true }),
    );
    await expect(resolver.resolve('shared://team-library/characters/linxia')).resolves.toEqual(
      expect.objectContaining({ scheme: 'shared', source: 'shared', readonly: true }),
    );
    await expect(resolver.resolve('external://https/example.com/linxia.zip')).resolves.toEqual(
      expect.objectContaining({ scheme: 'external', source: 'external', readonly: true }),
    );
  });

  it('resolves Canvas fallback from Live2D to portrait with fallback metadata', async () => {
    const bindings = {
      list: vi.fn(async () => [
        {
          id: 'bind-portrait',
          entityId: 'char_linxia',
          entityKind: 'character' as const,
          assetRef: 'project://assets/linxia-portrait',
          role: 'portrait' as const,
          status: 'confirmed' as const,
          source: 'user' as const,
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
      ]),
    } as unknown as EntityAssetBindingService;
    const resolver = new RepresentationResolver({
      entities: {
        get: async () => ({
          id: 'char_linxia',
          kind: 'character',
          canonicalName: '林夏',
          aliases: [],
          status: 'confirmed',
        }),
        list: async () => [],
        resolveByName: async () => undefined,
      },
      bindings,
      assetRefs: new DefaultAssetRefResolver(),
    });

    await expect(
      resolver.resolve({
        entityId: 'char_linxia',
        target: 'canvas',
        preferredKind: 'live2d',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'resolved',
        resolvedKind: 'portrait',
        fallback: true,
        assetRef: 'project://assets/linxia-portrait',
      }),
    );
  });

  it('composes resolved asset refs with federation capabilities without binding ownership', async () => {
    const bindingList = vi.fn(async () => [
      {
        id: 'bind-live2d',
        entityId: 'char_linxia',
        entityKind: 'character' as const,
        assetRef: 'project://assets/linxia-live2d',
        role: 'live2d' as const,
        status: 'confirmed' as const,
        source: 'user' as const,
        updatedAt: '2026-05-10T00:00:00.000Z',
      },
    ]);
    const project = vi.fn(async () => ({
      source: 'project' as const,
      readonly: false,
      assetEntityId: 'linxia-live2d',
      capabilities: ['thumbnail'],
    }));
    const describeAsset = vi.fn(async () => ({
      capabilities: ['live2d-runtime', 'thumbnail'],
      files: [
        {
          role: 'model' as const,
          assetRef: 'project://assets/linxia-live2d',
          fileId: 'model-json',
          mediaType: 'live2d',
        },
        {
          role: 'texture' as const,
          assetRef: 'project://assets/linxia-live2d',
          fileId: 'texture-0',
          mediaType: 'image/png',
        },
      ],
    }));
    const resolver = new RepresentationResolver({
      entities: {
        get: async () => ({
          id: 'char_linxia',
          kind: 'character',
          canonicalName: '林夏',
          aliases: [],
          status: 'confirmed',
        }),
        list: async () => [],
        resolveByName: async () => undefined,
      },
      bindings: { list: bindingList } as unknown as EntityAssetBindingService,
      assetRefs: new DefaultAssetRefResolver({ project }),
      federation: { describeAsset },
    });

    await expect(
      resolver.resolve({
        entityId: 'char_linxia',
        target: 'live',
        preferredKind: 'live2d',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'resolved',
        capabilities: ['live2d-runtime', 'thumbnail'],
        files: [
          expect.objectContaining({ role: 'model', fileId: 'model-json' }),
          expect.objectContaining({ role: 'texture', fileId: 'texture-0' }),
        ],
      }),
    );
    expect(bindingList).toHaveBeenCalledTimes(1);
    expect(project).toHaveBeenCalledWith(expect.objectContaining({ scheme: 'project' }));
    expect(describeAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: 'project://assets/linxia-live2d',
        assetEntityId: 'linxia-live2d',
      }),
    );
  });

  it('does not resolve portrait as a Live avatar', async () => {
    const resolver = new RepresentationResolver({
      entities: {
        get: async () => ({
          id: 'char_linxia',
          kind: 'character',
          canonicalName: '林夏',
          aliases: [],
          status: 'confirmed',
        }),
        list: async () => [],
        resolveByName: async () => undefined,
      },
      bindings: {
        list: async () => [
          {
            id: 'bind-portrait',
            entityId: 'char_linxia',
            entityKind: 'character',
            assetRef: 'project://assets/linxia-portrait',
            role: 'portrait',
            status: 'confirmed',
            source: 'user',
            updatedAt: '2026-05-10T00:00:00.000Z',
          },
        ],
      } as unknown as EntityAssetBindingService,
      assetRefs: new DefaultAssetRefResolver(),
    });

    await expect(resolver.resolve({ entityId: 'char_linxia', target: 'live' })).resolves.toEqual({
      status: 'missing-representation',
      entityId: 'char_linxia',
      missingKinds: ['live3d', 'puppet-bone', 'live2d'],
      suggestedActions: ['generate', 'import', 'bind-existing', 'dismiss'],
    });
  });

  it('honors allowFallback=false for preferred representation', async () => {
    const resolver = new RepresentationResolver({
      entities: {
        get: async () => undefined,
        list: async () => [],
        resolveByName: async () => undefined,
      },
      bindings: {
        list: async () => [
          {
            id: 'bind-portrait',
            entityId: 'char_linxia',
            entityKind: 'character',
            assetRef: 'project://assets/linxia-portrait',
            role: 'portrait',
            status: 'confirmed',
            source: 'user',
            updatedAt: '2026-05-10T00:00:00.000Z',
          },
        ],
      } as unknown as EntityAssetBindingService,
      assetRefs: new DefaultAssetRefResolver(),
    });

    await expect(
      resolver.resolve({
        entityId: 'char_linxia',
        target: 'canvas',
        preferredKind: 'live2d',
        allowFallback: false,
      }),
    ).resolves.toEqual({
      status: 'missing-representation',
      entityId: 'char_linxia',
      missingKinds: ['live2d'],
      suggestedActions: ['generate', 'import', 'bind-existing', 'dismiss'],
    });
  });

  it('stores visual drafts with custom visual fact keys until user confirmation', async () => {
    const fs = await import('node:fs/promises');
    let persisted = JSON.stringify({ version: 1, drafts: [] });
    let staged = persisted;

    vi.mocked(fs.readFile).mockImplementation(async () => persisted);
    vi.mocked(fs.writeFile).mockImplementation(async (_path, content) => {
      staged = String(content);
    });
    vi.mocked(fs.rename).mockImplementation(async () => {
      persisted = staged;
    });

    const service = new VisualIdentityDraftService('/workspace/neko/visual-identity-drafts.json');
    await service.upsert({
      id: 'draft-1',
      characterId: 'char_linxia',
      source: 'story',
      prompt: '冷淡的转校生',
      generatedAssetIds: ['gen-1', 'gen-2'],
      extractedVisualFacts: [{ key: 'tattoo_style', value: 'none', confidence: 0.8 }],
      status: 'drafting',
    });

    await expect(service.list()).resolves.toEqual([
      expect.objectContaining({
        id: 'draft-1',
        extractedVisualFacts: [{ key: 'tattoo_style', value: 'none', confidence: 0.8 }],
        status: 'drafting',
      }),
    ]);
    expect(resolveVisualIdentityDraftsPath('/workspace')).toBe(
      '/workspace/neko/visual-identity-drafts.json',
    );
  });

  it('stores missing representation requirements without creating asset files', async () => {
    const fs = await import('node:fs/promises');
    let persisted = JSON.stringify({ version: 1, requirements: [] });
    let staged = persisted;

    vi.mocked(fs.readFile).mockImplementation(async () => persisted);
    vi.mocked(fs.writeFile).mockImplementation(async (_path, content) => {
      staged = String(content);
    });
    vi.mocked(fs.rename).mockImplementation(async () => {
      persisted = staged;
    });

    const service = new EntityAssetRequirementService(
      '/workspace/neko/entity-asset-requirements.json',
    );
    await service.upsert({
      id: 'req-portrait',
      entityId: 'char_linxia',
      entityKind: 'character',
      source: 'story',
      sourceRef: 'story://scene/1',
      requiredKinds: ['portrait', 'reference'],
      status: 'missing',
    });

    await expect(service.list()).resolves.toEqual([
      expect.objectContaining({
        id: 'req-portrait',
        requiredKinds: ['portrait', 'reference'],
        status: 'missing',
      }),
    ]);
    expect(fs.writeFile).toHaveBeenCalledWith(
      '/workspace/neko/entity-asset-requirements.json.tmp',
      expect.stringContaining('"requirements"'),
      'utf-8',
    );
    expect(resolveEntityAssetRequirementsPath('/workspace')).toBe(
      '/workspace/neko/entity-asset-requirements.json',
    );
  });
});
