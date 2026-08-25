import { describe, expect, it } from 'vitest';

import {
  parseWorldPortableExportPreview,
  parseWorldPortableImportPreview,
  parseWorldPortablePackageManifest,
} from '../world-portable-package';

const digest = `sha256:${'a'.repeat(64)}`;

describe('World portable package contracts', () => {
  it('parses one strict version-free authoring manifest', () => {
    const manifest = parseWorldPortablePackageManifest({
      worldProjectId: 'world-1',
      entryRecordPath: 'world/project.json',
      records: [
        {
          kind: 'world-project',
          recordId: 'world-1',
          archivePath: 'world/project.json',
          byteLength: 100,
          integrityDigest: digest,
        },
        {
          kind: 'world-version',
          recordId: 'version-1',
          archivePath: 'world/versions/version-1.json',
          byteLength: 80,
          integrityDigest: digest,
        },
      ],
      embeddedResources: [],
      externalDependencies: [
        {
          ownerKind: 'character-version',
          dependencyId: 'character-version-1',
          resourceRef: 'neko-character:character-version-1',
          required: true,
        },
      ],
    });

    expect(manifest.records).toHaveLength(2);
    for (const forbidden of [
      'version',
      'schemaVersion',
      'formatVersion',
      'worldRunId',
      'worldSaveId',
      'events',
      'rawPath',
      'credential',
    ]) {
      expect(manifest).not.toHaveProperty(forbidden);
    }
  });

  it('rejects unsafe, duplicate, file-backed and runtime-bearing manifests', () => {
    const base = {
      worldProjectId: 'world-1',
      entryRecordPath: 'world/project.json',
      records: [
        {
          kind: 'world-project',
          recordId: 'world-1',
          archivePath: 'world/project.json',
          byteLength: 10,
          integrityDigest: digest,
        },
      ],
      embeddedResources: [],
      externalDependencies: [],
    };
    expect(() =>
      parseWorldPortablePackageManifest({ ...base, entryRecordPath: '../project.json' }),
    ).toThrow('safe relative path');
    expect(() => parseWorldPortablePackageManifest({ ...base, worldRunId: 'run-1' })).toThrow(
      'unsupported fields',
    );
    expect(() =>
      parseWorldPortablePackageManifest({
        ...base,
        externalDependencies: [
          {
            ownerKind: 'asset',
            dependencyId: 'asset-1',
            resourceRef: 'file:/private/asset.png',
            required: true,
          },
        ],
      }),
    ).toThrow('opaque non-file');
  });

  it('keeps export and import readiness exact', () => {
    expect(() =>
      parseWorldPortableExportPreview({
        selection: {
          worldProjectId: 'world-1',
          worldVersionId: 'version-1',
          embeddedResourceIds: [],
        },
        records: [
          { kind: 'world-project', recordId: 'world-1' },
          { kind: 'world-version', recordId: 'version-1' },
        ],
        embeddedResources: [],
        externalDependencies: [],
        unresolvedDependencyIds: ['character-1'],
        estimatedExpandedBytes: 100,
        destinationAuthorized: true,
        canExport: true,
      }),
    ).toThrow('must match');
    expect(() =>
      parseWorldPortableImportPreview({
        worldProjectId: 'world-1',
        worldVersionId: 'version-1',
        embeddedResources: [],
        externalDependencies: [],
        conflicts: [{ kind: 'world-project', recordId: 'world-1' }],
        canCommit: true,
      }),
    ).toThrow('must match');
  });
});
