import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityRepresentationBinding } from '../../../types/entity-representation-binding';
import { CharacterRegistryService } from '../character-registry';
import {
  CharacterRecordAdapter,
  CreativeEntityRegistryService,
  EntityRepresentationBindingService,
  EntityAssetRequirementService,
  VisualIdentityDraftService,
  characterRecordToCreativeEntity,
  resolveEntityAssetRequirementsPath,
  resolveEntityRepresentationBindingsPath,
  resolveVisualIdentityDraftsPath,
} from '../creative-entity-composition';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
}));

const portraitBinding: EntityRepresentationBinding = {
  id: 'bind-portrait',
  entityId: 'char_linxia',
  entityKind: 'character',
  representation: {
    kind: 'workspace-file',
    path: 'neko/assets/Characters/linxia.png',
  },
  role: 'portrait',
  isDefault: true,
  status: 'confirmed',
  availability: 'active',
  source: 'user',
  updatedAt: '2026-07-22T00:00:00.000Z',
};

describe('creative entity composition extension utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adapts CharacterRecord as a character CreativeEntity', () => {
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

    const registry = new CreativeEntityRegistryService([
      new CharacterRecordAdapter(new CharacterRegistryService('/workspace/characters.json')),
    ]);

    await expect(registry.list({ kind: 'character' })).resolves.toEqual([
      expect.objectContaining({ id: 'char_linxia', kind: 'character' }),
    ]);
    await expect(registry.resolveByName('LINXIA')).resolves.toEqual(
      expect.objectContaining({ id: 'char_linxia', kind: 'character' }),
    );
    await expect(registry.resolveByName('LINXIA', 'scene')).resolves.toBeUndefined();
  });

  it('uses the canonical v2 binding path outside derived cache', () => {
    expect(resolveEntityRepresentationBindingsPath('/workspace')).toBe(
      '/workspace/neko/entity-representation-bindings.json',
    );
    expect(
      () =>
        new EntityRepresentationBindingService(
          '/workspace/.neko/.cache/entity-representation-bindings.json',
        ),
    ).toThrow(/representation bindings must not be stored/);
  });

  it('creates an empty v2 state only when the binding file does not exist', async () => {
    const fs = await import('node:fs/promises');
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
    vi.mocked(fs.readFile).mockRejectedValue(missing);

    await expect(
      new EntityRepresentationBindingService(
        '/workspace/neko/entity-representation-bindings.json',
      ).load(),
    ).resolves.toEqual({ version: 2, bindings: [] });
  });

  it('fails visibly for legacy, unsupported, malformed, and unreadable binding files', async () => {
    const fs = await import('node:fs/promises');
    const service = new EntityRepresentationBindingService(
      '/workspace/neko/entity-representation-bindings.json',
    );

    vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({ version: 1, bindings: [] }));
    await expect(service.load()).rejects.toMatchObject({ code: 'legacy-version' });

    vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({ version: 3, bindings: [] }));
    await expect(service.load()).rejects.toMatchObject({ code: 'unsupported-version' });

    vi.mocked(fs.readFile).mockResolvedValueOnce('{');
    await expect(service.load()).rejects.toBeInstanceOf(SyntaxError);

    vi.mocked(fs.readFile).mockRejectedValueOnce(new Error('permission denied'));
    await expect(service.load()).rejects.toThrow('permission denied');
  });

  it('persists direct representation bindings as deterministic v2 JSON', async () => {
    const fs = await import('node:fs/promises');
    let persisted = JSON.stringify({ version: 2, bindings: [] });
    let staged = persisted;

    vi.mocked(fs.readFile).mockImplementation(async () => persisted);
    vi.mocked(fs.writeFile).mockImplementation(async (_path, content) => {
      staged = String(content);
    });
    vi.mocked(fs.rename).mockImplementation(async () => {
      persisted = staged;
    });

    const service = new EntityRepresentationBindingService(
      '/workspace/neko/entity-representation-bindings.json',
    );
    await service.upsert({
      ...portraitBinding,
      id: 'bind-reference',
      role: 'reference',
      isDefault: undefined,
      representation: { kind: 'workspace-file', path: 'references/linxia.png' },
    });
    await service.upsert(portraitBinding);

    await expect(service.load()).resolves.toEqual({
      version: 2,
      bindings: [
        expect.objectContaining({ id: 'bind-portrait' }),
        expect.objectContaining({ id: 'bind-reference' }),
      ],
    });
    expect(persisted).not.toContain('assetRef');
    expect(persisted).not.toContain('project://assets/');
    expect(fs.writeFile).toHaveBeenLastCalledWith(
      '/workspace/neko/entity-representation-bindings.json.tmp',
      expect.stringContaining('"version": 2'),
      'utf-8',
    );
  });

  it('replaces bindings and keeps one default per entity role', async () => {
    const fs = await import('node:fs/promises');
    let persisted = JSON.stringify({ version: 2, bindings: [] });
    let staged = persisted;

    vi.mocked(fs.readFile).mockImplementation(async () => persisted);
    vi.mocked(fs.writeFile).mockImplementation(async (_path, content) => {
      staged = String(content);
    });
    vi.mocked(fs.rename).mockImplementation(async () => {
      persisted = staged;
    });

    const service = new EntityRepresentationBindingService(
      '/workspace/neko/entity-representation-bindings.json',
    );
    await service.upsert(portraitBinding);
    await service.setDefault({
      ...portraitBinding,
      id: 'bind-portrait-v2',
      isDefault: undefined,
      representation: { kind: 'workspace-file', path: 'portraits/linxia-v2.png' },
    });

    expect(await service.list()).toEqual([
      expect.objectContaining({ id: 'bind-portrait' }),
      expect.objectContaining({ id: 'bind-portrait-v2', isDefault: true }),
    ]);
    expect((await service.list())[0]).not.toHaveProperty('isDefault');

    await service.remove('bind-portrait');
    await expect(service.list()).resolves.toEqual([
      expect.objectContaining({ id: 'bind-portrait-v2' }),
    ]);
  });

  it('stores visual drafts without promoting generated results into a catalog', async () => {
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
      generatedAssetIds: ['gen-1'],
      extractedVisualFacts: [{ key: 'tattoo_style', value: 'none', confidence: 0.8 }],
      status: 'drafting',
    });

    await expect(service.list()).resolves.toEqual([
      expect.objectContaining({ id: 'draft-1', status: 'drafting' }),
    ]);
    expect(resolveVisualIdentityDraftsPath('/workspace')).toBe(
      '/workspace/neko/visual-identity-drafts.json',
    );
  });

  it('stores missing representation requirements without creating files', async () => {
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
      expect.objectContaining({ id: 'req-portrait', status: 'missing' }),
    ]);
    expect(resolveEntityAssetRequirementsPath('/workspace')).toBe(
      '/workspace/neko/entity-asset-requirements.json',
    );
  });
});
