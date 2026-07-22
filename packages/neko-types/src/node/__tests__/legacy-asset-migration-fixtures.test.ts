import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { classifyLegacyAssetCatalog } from '../legacy-asset-catalog-classifier';
import {
  inspectLegacyAssetCatalog,
  type LegacyAssetCatalogInspectionSession,
  type LegacyAssetInspectionFileInput,
  type LegacyAssetInspectionReader,
} from '../legacy-asset-catalog-inspector';
import {
  createLegacyAssetMigrationArchive,
  type LegacyAssetMigrationArchiveHost,
} from '../legacy-asset-migration-archive';

describe('legacy Asset migration fixture matrix', () => {
  it('migrates a valid portable file and explicit existing Entity association', async () => {
    const session = await inspectFixture('valid.json');
    const result = classifyLegacyAssetCatalog({
      session,
      existingEntities: [{ entityId: 'char_alice', entityKind: 'character' }],
    });

    expect(result.classifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'representation-reference',
          target: { kind: 'workspace-file', path: 'neko/assets/Characters/alice.png' },
        }),
        expect.objectContaining({
          kind: 'existing-entity-association',
          entityId: 'char_alice',
        }),
      ]),
    );
  });

  it('keeps ambiguous multi-file identity and missing Asset references unresolved', async () => {
    const session = await inspectFixture('ambiguous.json', {
      projectFile: await fixtureBytes('missing-reference.json'),
    });
    const result = classifyLegacyAssetCatalog({ session });

    expect(result.unresolvedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'asset-catalog',
          reason: 'ambiguous-identity',
          disposition: 'confirmation-required',
        }),
        expect.objectContaining({
          sourceId: 'canvas-main',
          reason: 'missing-resource',
          disposition: 'confirmation-required',
        }),
      ]),
    );
    expect(
      result.classifications.some(
        (item) => item.kind === 'representation-reference' && item.sourceId === 'canvas-main',
      ),
    ).toBe(false);
  });

  it('blocks unknown versions during inspection', async () => {
    const session = await inspectFixture('unknown-version.json');
    expect(session.inspection).toMatchObject({
      status: 'blocked',
      diagnostics: [expect.objectContaining({ code: 'unsupported-version' })],
    });
  });

  it('classifies non-portable paths as unresolved without exposing them in diagnostics', async () => {
    const session = await inspectFixture('non-portable.json');
    const result = classifyLegacyAssetCatalog({ session });

    expect(result.unresolvedFields).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'non-portable-reference' })]),
    );
    expect(JSON.stringify(result.diagnostics)).not.toContain('/Users/private');
    expect(
      result.classifications.some(
        (item) => item.kind === 'representation-reference' && item.target.kind === 'workspace-file',
      ),
    ).toBe(false);
  });

  it('retains generated/package ownership while preventing Entity metadata contamination', async () => {
    const session = await inspectFixture('generated-package-metadata.json');
    const result = classifyLegacyAssetCatalog({
      session,
      knownPackages: [
        {
          legacyAssetId: 'asset-package',
          target: {
            kind: 'package-resource',
            packageId: '@studio/motion-pack',
            revision: 'revision-1',
            resourcePath: 'motions/wave.motion3.json',
            manifestPath: 'neko/packages/motion-pack/manifest.json',
          },
        },
      ],
    });

    expect(result.classifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'owner-provenance',
          owner: 'generated-output',
          ownerId: 'candidate-alice',
        }),
        expect.objectContaining({
          kind: 'owner-provenance',
          owner: 'package',
          ownerId: '@studio/motion-pack',
        }),
        expect.objectContaining({
          kind: 'representation-reference',
          target: expect.objectContaining({ kind: 'generated-output' }),
        }),
        expect.objectContaining({
          kind: 'representation-reference',
          target: expect.objectContaining({ kind: 'package-resource' }),
        }),
      ]),
    );

    const unresolvedLeafFields = new Set(
      result.unresolvedFields.map((field) => field.fieldPath.at(-1)),
    );
    for (const field of [
      'description',
      'tags',
      'aliases',
      'personality',
      'voiceActor',
      'type',
      'license',
      'prompt',
    ]) {
      expect(unresolvedLeafFields.has(field), field).toBe(true);
    }

    const classificationsJson = JSON.stringify(result.classifications);
    for (const privateValue of [
      'private-license',
      'private prompt',
      'Private Actor',
      'private-tag',
      'Do not copy this description',
    ]) {
      expect(classificationsJson).not.toContain(privateValue);
    }
    expect(
      result.classifications.every(
        (classification) => !Object.prototype.hasOwnProperty.call(classification, 'metadata'),
      ),
    ).toBe(true);
  });

  it('aborts archive creation when inspected source bytes changed', async () => {
    const catalog = await fixtureBytes('valid.json');
    const host = new MutableArchiveHost(catalog);
    const session = await inspectLegacyAssetCatalog({
      projectRevision: 'revision-1',
      inspectedAt: '2026-07-22T02:00:00.000Z',
      reader: host,
      files: [catalogInput],
    });
    host.catalog = new TextEncoder().encode('{"version":1,"entities":[]}');

    await expect(
      createLegacyAssetMigrationArchive({
        session,
        host,
        verifiedAt: '2026-07-22T02:01:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'source-changed' });
    expect(host.archiveWrites).toBe(0);
  });
});

const catalogInput: LegacyAssetInspectionFileInput = {
  sourceId: 'asset-catalog',
  role: 'asset-catalog',
  workspacePath: 'neko/assets/library.json',
  required: true,
};

async function inspectFixture(
  catalogName: string,
  options: { readonly projectFile?: Uint8Array } = {},
): Promise<LegacyAssetCatalogInspectionSession> {
  const files = new Map<string, Uint8Array>([
    ['neko/assets/library.json', await fixtureBytes(catalogName)],
  ]);
  const inputs: LegacyAssetInspectionFileInput[] = [catalogInput];
  if (options.projectFile) {
    files.set('boards/main.nkc', options.projectFile);
    inputs.push({
      sourceId: 'canvas-main',
      role: 'canvas-document',
      workspacePath: 'boards/main.nkc',
    });
  }
  return inspectLegacyAssetCatalog({
    projectRevision: 'revision-1',
    inspectedAt: '2026-07-22T02:00:00.000Z',
    reader: new MapReader(files),
    files: inputs,
  });
}

class MapReader implements LegacyAssetInspectionReader {
  constructor(private readonly files: ReadonlyMap<string, Uint8Array>) {}

  async readWorkspaceFile(workspacePath: string): Promise<Uint8Array | undefined> {
    return this.files.get(workspacePath)?.slice();
  }
}

class MutableArchiveHost implements LegacyAssetMigrationArchiveHost {
  archiveWrites = 0;

  constructor(public catalog: Uint8Array) {}

  async readProjectRevision(): Promise<string> {
    return 'revision-1';
  }

  async readWorkspaceFile(workspacePath: string): Promise<Uint8Array | undefined> {
    return workspacePath === 'neko/assets/library.json' ? this.catalog.slice() : undefined;
  }

  async readLocalProjection(): Promise<undefined> {
    return undefined;
  }

  async writeImmutableWorkspaceFile(): Promise<void> {
    this.archiveWrites += 1;
  }
}

async function fixtureBytes(name: string): Promise<Uint8Array> {
  const fixtureUrl = new URL(`./fixtures/legacy-asset-migration/${name}`, import.meta.url);
  return readFile(fileURLToPath(fixtureUrl));
}
