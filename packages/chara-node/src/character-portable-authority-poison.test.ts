import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createCharacterPortableArchivePort } from './character-portable-archive';

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
});
