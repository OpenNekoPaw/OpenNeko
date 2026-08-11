import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Project Node canonical authority', () => {
  it('does not import SQLite, local metadata, cache, Host, or Electron', async () => {
    const source = await readFile(
      new URL('./project-composition-file-repository.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/local-metadata|sqlite|cache|@neko\/host|electron/u);
  });
});
