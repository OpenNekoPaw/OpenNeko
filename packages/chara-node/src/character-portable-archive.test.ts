import { createHash } from 'node:crypto';
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import { describe, expect, it } from 'vitest';
import {
  readCharacterPortableArchive,
  writeCharacterPortableArchive,
} from './character-portable-archive';

const textEncoder = new TextEncoder();

describe('Character portable archive', () => {
  it('round-trips a CharacterProject with embedded Live2D files and an external voice', async () => {
    const projectBytes = jsonBytes(project());
    const modelBytes = jsonBytes({ FileReferences: { Textures: ['texture_00.png'] } });
    const textureBytes = Uint8Array.from([1, 2, 3, 4]);
    const written = await writeCharacterPortableArchive({
      characterProjectId: 'character-project-a',
      entryRecordPath: 'character/project.json',
      records: [
        {
          kind: 'character-project',
          recordId: 'character-project-a',
          archivePath: 'character/project.json',
          bytes: projectBytes,
        },
      ],
      embeddedAssets: [
        asset('assets/live2d/model.model3.json', 'application/json', modelBytes),
        asset('assets/live2d/texture_00.png', 'image/png', textureBytes),
      ],
      externalDependencies: [
        {
          representationId: 'voice-main',
          kind: 'voice',
          resourceRef: 'voice:provider-voice-a',
        },
      ],
    });

    const read = await readCharacterPortableArchive(written.archiveBytes);

    expect(read.manifest.characterProjectId).toBe('character-project-a');
    expect(read.manifest.embeddedAssets).toHaveLength(2);
    expect(read.manifest.externalDependencies).toHaveLength(1);
    expect(read.bytesByArchivePath.get('assets/live2d/texture_00.png')).toEqual(textureBytes);
  });

  it('rejects undeclared and path-traversal entries before installation', async () => {
    const manifest = manifestForProject();
    const undeclared = await rawArchive([
      ['manifest.json', jsonBytes(manifest)],
      ['character/project.json', jsonBytes(project())],
      ['assets/secret.txt', textEncoder.encode('secret')],
    ]);
    await expect(readCharacterPortableArchive(undeclared)).rejects.toMatchObject({
      code: 'character-package-invalid',
    });

    const traversal = await rawArchive([['../manifest.json', jsonBytes(manifest)]]);
    await expect(readCharacterPortableArchive(traversal)).rejects.toMatchObject({
      code: 'character-package-invalid',
    });
  });

  it('rejects digest mismatch and bounded-resource excess', async () => {
    const manifest = manifestForProject({ integrityDigest: `sha256:${'0'.repeat(64)}` });
    const invalidDigest = await rawArchive([
      ['manifest.json', jsonBytes(manifest)],
      ['character/project.json', jsonBytes(project())],
    ]);
    await expect(readCharacterPortableArchive(invalidDigest)).rejects.toMatchObject({
      code: 'character-package-integrity-failed',
    });

    const valid = await writeCharacterPortableArchive({
      characterProjectId: 'character-project-a',
      entryRecordPath: 'character/project.json',
      records: [
        {
          kind: 'character-project',
          recordId: 'character-project-a',
          archivePath: 'character/project.json',
          bytes: jsonBytes(project()),
        },
      ],
      embeddedAssets: [],
      externalDependencies: [],
    });
    await expect(
      readCharacterPortableArchive(valid.archiveBytes, { maxEntryBytes: 8 }),
    ).rejects.toMatchObject({ code: 'character-package-limit-exceeded' });
  });

  it('rejects symbolic-link metadata', async () => {
    const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
    await writer.add('manifest.json', new Uint8ArrayReader(jsonBytes(manifestForProject())), {
      unixMode: 0o120777,
    });
    const archive = await writer.close();

    await expect(readCharacterPortableArchive(archive)).rejects.toMatchObject({
      code: 'character-package-invalid',
    });
  });
});

function project() {
  return {
    characterProjectId: 'character-project-a',
    displayName: 'Lin',
    draft: {
      summary: 'A careful archivist.',
      backgroundStory: createEmptyCharacterBackgroundStory(),
      originSetting: createEmptyCharacterOriginSetting(),
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
      expressionPolicy: [],
      representationRefs: [],
    },
    evidence: [],
    candidates: [],
    reviewStatus: 'draft',
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
  };
}

function asset(archivePath: string, mediaType: string, bytes: Uint8Array) {
  return {
    representationId: 'live2d-main',
    kind: 'live2d' as const,
    archivePath,
    mediaType,
    bytes,
  };
}

function manifestForProject(override: { readonly integrityDigest?: string } = {}) {
  const bytes = jsonBytes(project());
  return {
    characterProjectId: 'character-project-a',
    entryRecordPath: 'character/project.json',
    records: [
      {
        kind: 'character-project',
        recordId: 'character-project-a',
        archivePath: 'character/project.json',
        byteLength: bytes.byteLength,
        integrityDigest: override.integrityDigest ?? digest(bytes),
      },
    ],
    embeddedAssets: [],
    externalDependencies: [],
  };
}

async function rawArchive(entries: readonly (readonly [string, Uint8Array])[]) {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
  for (const [path, bytes] of entries) await writer.add(path, new Uint8ArrayReader(bytes));
  return writer.close();
}

function jsonBytes(value: unknown): Uint8Array {
  return textEncoder.encode(`${JSON.stringify(value)}\n`);
}

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
