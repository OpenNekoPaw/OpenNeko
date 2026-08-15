import { createHash } from 'node:crypto';

import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { describe, expect, it } from 'vitest';

import { readWorldPortableArchive, writeWorldPortableArchive } from './world-portable-archive';

const encoder = new TextEncoder();

describe('World portable archive', () => {
  it('round-trips canonical World authoring records and explicit dependency inventory', async () => {
    const projectBytes = jsonBytes(project());
    const versionBytes = jsonBytes(version());
    const resourceBytes = Uint8Array.from([1, 2, 3, 4]);
    const written = await writeWorldPortableArchive({
      worldProjectId: 'world-1',
      entryRecordPath: 'world/project.json',
      records: [
        {
          kind: 'world-project',
          recordId: 'world-1',
          archivePath: 'world/project.json',
          bytes: projectBytes,
        },
        {
          kind: 'world-version',
          recordId: 'version-1',
          archivePath: 'world/versions/version-1.json',
          bytes: versionBytes,
        },
      ],
      embeddedResources: [
        {
          declaration: {
            resourceId: 'asset-map-1',
            ownerKind: 'asset',
            resourceRef: 'neko-asset:asset-map-1',
            archivePath: 'resources/asset-map-1.png',
            mediaType: 'image/png',
            byteLength: resourceBytes.byteLength,
            integrityDigest: digest(resourceBytes),
          },
          bytes: resourceBytes,
        },
      ],
      externalDependencies: [
        {
          ownerKind: 'character-version',
          dependencyId: 'character-version-1',
          resourceRef: 'neko-character:character-version-1',
          required: true,
        },
        {
          ownerKind: 'entity',
          dependencyId: 'entity-1',
          resourceRef: 'neko-entity:entity-1',
          required: true,
        },
        {
          ownerKind: 'content',
          dependencyId: 'content-1',
          resourceRef: 'neko-content:content-1',
          required: false,
        },
      ],
    });

    const read = await readWorldPortableArchive(written.archiveBytes);
    expect(read.manifest.worldProjectId).toBe('world-1');
    expect(read.manifest.records.map((record) => record.recordId)).toEqual([
      'world-1',
      'version-1',
    ]);
    expect(read.bytesByArchivePath.get('world/project.json')).toEqual(projectBytes);
    expect(read.bytesByArchivePath.get('resources/asset-map-1.png')).toEqual(resourceBytes);
    expect(read.manifest.externalDependencies.map((entry) => entry.ownerKind)).toEqual([
      'character-version',
      'entity',
      'content',
    ]);
  });

  it('rejects undeclared, traversal, duplicate-normalized and symbolic-link entries', async () => {
    const manifest = manifestForProject();
    const undeclared = await rawArchive([
      ['manifest.json', jsonBytes(manifest)],
      ['world/project.json', jsonBytes(project())],
      ['resources/secret.txt', encoder.encode('secret')],
    ]);
    await expect(readWorldPortableArchive(undeclared)).rejects.toMatchObject({
      code: 'world-package-invalid',
    });

    const traversal = await rawArchive([['../manifest.json', jsonBytes(manifest)]]);
    await expect(readWorldPortableArchive(traversal)).rejects.toMatchObject({
      code: 'world-package-invalid',
    });

    const duplicateSource = await rawArchive([
      ['manifest.json', jsonBytes(manifest)],
      ['world/project.json', jsonBytes(project())],
      ['world/projecx.json', jsonBytes(project())],
    ]);
    const duplicate = replaceAscii(duplicateSource, 'world/projecx.json', 'world/project.json');
    await expect(readWorldPortableArchive(duplicate)).rejects.toMatchObject({
      code: 'world-package-invalid',
    });

    const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
    await writer.add('manifest.json', new Uint8ArrayReader(jsonBytes(manifest)), {
      unixMode: 0o120777,
    });
    const symlink = await writer.close();
    await expect(readWorldPortableArchive(symlink)).rejects.toMatchObject({
      code: 'world-package-invalid',
    });
  });

  it('rejects digest mismatch, malformed canonical records and archive limits', async () => {
    const badDigest = await rawArchive([
      [
        'manifest.json',
        jsonBytes(manifestForProject({ integrityDigest: `sha256:${'0'.repeat(64)}` })),
      ],
      ['world/project.json', jsonBytes(project())],
    ]);
    await expect(readWorldPortableArchive(badDigest)).rejects.toMatchObject({
      code: 'world-package-integrity-failed',
    });

    await expect(
      writeWorldPortableArchive({
        worldProjectId: 'world-1',
        entryRecordPath: 'world/project.json',
        records: [
          {
            kind: 'world-project',
            recordId: 'world-1',
            archivePath: 'world/project.json',
            bytes: jsonBytes({ ...project(), worldRunId: 'run-1' }),
          },
        ],
        embeddedResources: [],
        externalDependencies: [],
      }),
    ).rejects.toThrow(/unsupported fields/u);

    const valid = await writeWorldPortableArchive({
      worldProjectId: 'world-1',
      entryRecordPath: 'world/project.json',
      records: [
        {
          kind: 'world-project',
          recordId: 'world-1',
          archivePath: 'world/project.json',
          bytes: jsonBytes(project()),
        },
      ],
      embeddedResources: [],
      externalDependencies: [],
    });
    await expect(
      readWorldPortableArchive(valid.archiveBytes, { maxEntryBytes: 8 }),
    ).rejects.toMatchObject({ code: 'world-package-limit-exceeded' });
    await expect(
      readWorldPortableArchive(valid.archiveBytes, { maxEntries: 1 }),
    ).rejects.toMatchObject({ code: 'world-package-limit-exceeded' });
  });

  it('validates owner-authorized resource bytes before writing', async () => {
    await expect(
      writeWorldPortableArchive({
        worldProjectId: 'world-1',
        entryRecordPath: 'world/project.json',
        records: [
          {
            kind: 'world-project',
            recordId: 'world-1',
            archivePath: 'world/project.json',
            bytes: jsonBytes(project()),
          },
        ],
        embeddedResources: [
          {
            declaration: {
              resourceId: 'asset-1',
              ownerKind: 'asset',
              resourceRef: 'neko-asset:asset-1',
              archivePath: 'resources/asset-1.png',
              mediaType: 'image/png',
              byteLength: 99,
              integrityDigest: `sha256:${'0'.repeat(64)}`,
            },
            bytes: Uint8Array.from([1, 2, 3]),
          },
        ],
        externalDependencies: [],
      }),
    ).rejects.toMatchObject({ code: 'world-package-integrity-failed' });
  });
});

function project() {
  return {
    worldProjectId: 'world-1',
    title: 'Rain City',
    draft: {
      background: 'A city of archives.',
      worldBook: [],
      locations: [],
      organizations: [],
      rules: [],
      initialFacts: [],
    },
    sourceRefs: [],
    reviewStatus: 'ready',
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  };
}

function version() {
  return {
    worldVersionId: 'version-1',
    worldProjectId: 'world-1',
    label: 'First publication',
    definition: project().draft,
    acceptedSourceRefIds: [],
    publishedAt: '2026-08-14T00:00:00.000Z',
  };
}

function manifestForProject(override: { readonly integrityDigest?: string } = {}) {
  const bytes = jsonBytes(project());
  return {
    worldProjectId: 'world-1',
    entryRecordPath: 'world/project.json',
    records: [
      {
        kind: 'world-project',
        recordId: 'world-1',
        archivePath: 'world/project.json',
        byteLength: bytes.byteLength,
        integrityDigest: override.integrityDigest ?? digest(bytes),
      },
    ],
    embeddedResources: [],
    externalDependencies: [],
  };
}

async function rawArchive(entries: readonly (readonly [string, Uint8Array])[]) {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
  for (const [archivePath, bytes] of entries) {
    await writer.add(archivePath, new Uint8ArrayReader(bytes));
  }
  return writer.close();
}

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(`${JSON.stringify(value)}\n`);
}

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function replaceAscii(bytes: Uint8Array, before: string, after: string): Uint8Array {
  if (before.length !== after.length) throw new Error('ZIP replacement must preserve length.');
  const result = Uint8Array.from(bytes);
  const source = encoder.encode(before);
  const target = encoder.encode(after);
  for (let offset = 0; offset <= result.length - source.length; offset += 1) {
    if (source.every((value, index) => result[offset + index] === value)) {
      result.set(target, offset);
    }
  }
  return result;
}
