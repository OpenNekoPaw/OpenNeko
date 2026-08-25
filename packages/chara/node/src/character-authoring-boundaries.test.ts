import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Character authoring storage boundary', () => {
  it('has no SQLite, local-metadata, cache, active Workspace, or fallback dependency', async () => {
    const source = await readFile(
      new URL('./character-authoring-file-repository.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/local-metadata|sqlite|cache|activeWorkspace|fallback/u);
  });

  it('keeps the Desktop production composition off the mixed SQLite authoring repository', async () => {
    const source = await readFile(
      new URL('../../../../apps/neko-desktop/src/main/index.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('createCharacterAuthoringFileRepository');
    expect(source).toContain('createPersistentCharacterRuntimeRepositories');
    expect(source).not.toMatch(
      /createPersistentCharacterRepository|initializeCharacterPersistenceTables/u,
    );
  });
});
