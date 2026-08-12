import { parseCharacterPortablePackageManifest } from '../character-portable-package';
import { describe, expect, it } from 'vitest';

const digest = `sha256:${'a'.repeat(64)}`;

describe('Character portable package contracts', () => {
  it('parses records, embedded Live2D files and external dependencies', () => {
    const manifest = parseCharacterPortablePackageManifest({
      characterProjectId: 'character-project-a',
      entryRecordPath: 'character/project.json',
      records: [
        record('character-project', 'character-project-a', 'character/project.json'),
        record('character-version', 'character-version-a', 'character/versions/version-a.json'),
        record('character-version-lineage', 'character-project-a', 'character/lineage.json'),
      ],
      embeddedAssets: [
        asset('assets/live2d/model.model3.json', 'application/json'),
        asset('assets/live2d/texture_00.png', 'image/png'),
      ],
      externalDependencies: [
        {
          representationId: 'voice-main',
          kind: 'voice',
          resourceRef: 'voice:provider-voice-a',
        },
      ],
    });

    expect(manifest.records.map((entry) => entry.kind)).toEqual([
      'character-project',
      'character-version',
      'character-version-lineage',
    ]);
    expect(manifest.embeddedAssets).toHaveLength(2);
    expect(manifest.externalDependencies[0]?.resourceRef).toBe('voice:provider-voice-a');
  });

  it.each([
    {
      label: 'path traversal',
      mutate: (manifest: ReturnType<typeof validManifest>) => ({
        ...manifest,
        records: [
          record('character-project', 'character-project-a', 'character/project.json'),
          record('character-version', 'version-a', 'character/../secret.json'),
        ],
      }),
      message: /safe relative path/u,
    },
    {
      label: 'raw file dependency',
      mutate: (manifest: ReturnType<typeof validManifest>) => ({
        ...manifest,
        externalDependencies: [
          { representationId: 'vrm-a', kind: 'vrm', resourceRef: 'file:///private/model.vrm' },
        ],
      }),
      message: /opaque non-file/u,
    },
    {
      label: 'duplicate archive path',
      mutate: (manifest: ReturnType<typeof validManifest>) => ({
        ...manifest,
        embeddedAssets: [
          asset('assets/live2d/model.json', 'application/json'),
          asset('assets/live2d/model.json', 'application/json'),
        ],
      }),
      message: /duplicate identity/u,
    },
    {
      label: 'ambiguous embedded and external representation',
      mutate: (manifest: ReturnType<typeof validManifest>) => ({
        ...manifest,
        embeddedAssets: [asset('assets/live2d/model.json', 'application/json')],
        externalDependencies: [
          { representationId: 'live2d-main', kind: 'live2d', resourceRef: 'asset:live2d-a' },
        ],
      }),
      message: /both embedded and external/u,
    },
  ])('rejects $label', ({ mutate, message }) => {
    expect(() => parseCharacterPortablePackageManifest(mutate(validManifest()))).toThrow(message);
  });

  it('rejects an internal format generation field', () => {
    const forbiddenField = ['format', 'Version'].join('');
    expect(() =>
      parseCharacterPortablePackageManifest({ ...validManifest(), [forbiddenField]: 1 }),
    ).toThrow(/unsupported fields/u);
  });
});

function validManifest() {
  return {
    characterProjectId: 'character-project-a',
    entryRecordPath: 'character/project.json',
    records: [record('character-project', 'character-project-a', 'character/project.json')],
    embeddedAssets: [],
    externalDependencies: [],
  };
}

function record(
  kind: 'character-project' | 'character-version' | 'character-version-lineage',
  recordId: string,
  archivePath: string,
) {
  return { kind, recordId, archivePath, byteLength: 12, integrityDigest: digest };
}

function asset(archivePath: string, mediaType: string) {
  return {
    representationId: 'live2d-main',
    kind: 'live2d' as const,
    archivePath,
    mediaType,
    byteLength: 12,
    integrityDigest: digest,
  };
}
