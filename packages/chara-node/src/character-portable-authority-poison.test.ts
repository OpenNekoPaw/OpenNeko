import { readFile } from 'node:fs/promises';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import { describe, expect, it } from 'vitest';
import {
  createCharacterPortableArchivePort,
  readCharacterPortableArchive,
  writeCharacterPortableArchive,
} from './character-portable-archive';

describe('Character portable package authority poison scan', () => {
  it('exposes only bounded read/write transport operations', () => {
    expect(Object.keys(createCharacterPortableArchivePort()).sort()).toEqual(['read', 'write']);
  });

  it('does not introduce durable package, mount, watcher or synchronization identifiers', async () => {
    const sources = await Promise.all([
      readFile(new URL('./character-portable-archive.ts', import.meta.url), 'utf8'),
      readFile(
        new URL(
          '../../chara/src/application/character-portable-package-service.ts',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL('../../chara/src/contracts/character-portable-package.ts', import.meta.url),
        'utf8',
      ),
    ]);
    const productionSource = sources.join('\n');

    expect(productionSource).not.toMatch(
      /\b(?:packageId|packagePath|mountedPackage|packageMount|packageWatcher|watchPackage|syncPackage|recentPackage)\b/u,
    );
    expect(productionSource).not.toMatch(
      /\b(?:conversationId|roomId|companionMemory|narrativeRun|providerSelection|modelSelection|skillGrant|toolGrant|approvalHistory|presentationSnapshot)\b/u,
    );
  });

  it('writes only the closed Character authoring inventory and explicitly selected assets', async () => {
    const projectBytes = new TextEncoder().encode(
      `${JSON.stringify({
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
      })}\n`,
    );
    const assetBytes = new Uint8Array([1, 2, 3, 4]);
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
        {
          representationId: 'portrait-main',
          kind: 'portrait',
          resourceRef: 'asset:portrait-main',
          archivePath: 'assets/portrait/portrait.png',
          entry: true,
          mediaType: 'image/png',
          bytes: assetBytes,
        },
      ],
      externalDependencies: [],
    });
    const decoded = await readCharacterPortableArchive(written.archiveBytes);

    expect([...decoded.bytesByArchivePath.keys()].sort()).toEqual([
      'assets/portrait/portrait.png',
      'character/project.json',
    ]);
    expect(Object.keys(decoded.manifest).sort()).toEqual([
      'characterProjectId',
      'embeddedAssets',
      'entryRecordPath',
      'externalDependencies',
      'records',
    ]);
    expect(JSON.stringify(decoded.manifest)).not.toMatch(
      /conversation|room|memory|runtime|provider|modelSelection|skillGrant|toolGrant|approval|credential|cache|presentationSnapshot/iu,
    );
  });
});
