import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Project Node canonical authority', () => {
  it('does not import SQLite, local metadata, cache, Host, or Electron', async () => {
    const source = (
      await Promise.all(
        [
          new URL('./project-entity-character-association-repository.ts', import.meta.url),
          new URL('./project-membership-repository.ts', import.meta.url),
        ].map((url) => readFile(url, 'utf8')),
      )
    ).join('\n');
    expect(source).not.toMatch(/local-metadata|sqlite|cache|@neko\/host|electron/u);
  });

  it('has no runtime reader or writer for the retired monolithic composition file', async () => {
    const retiredRepository = new URL('./project-composition-file-repository.ts', import.meta.url);
    await expect(access(retiredRepository)).rejects.toMatchObject({ code: 'ENOENT' });
    const sources = await Promise.all(
      [
        new URL('./index.ts', import.meta.url),
        new URL('../../domain/src/contracts/index.ts', import.meta.url),
        new URL('../../domain/src/application/index.ts', import.meta.url),
        new URL('../../../../apps/neko-desktop/src/main/index.ts', import.meta.url),
      ].map((url) => readFile(url, 'utf8')),
    );
    expect(sources.join('\n')).not.toMatch(
      /project-composition-file-repository|ProjectCompositionFileRepository/u,
    );
  });
});
