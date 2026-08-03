import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDesktopRetiredJsonStatePort } from './desktop-state-migration-adapter';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop state migration file adapter', () => {
  it('publishes a validated downgrade pair without exposing a partial preflight result', async () => {
    const fixture = await createFixture();
    await expect(
      fixture.port.publishPair({ shell: '{"next":"shell"}', applicationSettings: 'invalid' }),
    ).rejects.toThrow();
    expect(await readFile(fixture.shellPath, 'utf8')).toBe('{"old":"shell"}');
    expect(await readFile(fixture.settingsPath, 'utf8')).toBe('{"old":"settings"}');
    expect((await readdir(fixture.root)).sort()).toEqual(['settings.json', 'shell.json']);

    await fixture.port.publishPair({
      shell: '{"next":"shell"}',
      applicationSettings: '{"next":"settings"}',
    });
    expect(await readFile(fixture.shellPath, 'utf8')).toBe('{"next":"shell"}');
    expect(await readFile(fixture.settingsPath, 'utf8')).toBe('{"next":"settings"}');
  });

  it('archives an imported source once and fails visibly on an archive collision', async () => {
    const fixture = await createFixture();
    await fixture.port.archive('shell');
    await expect(fixture.port.read('shell')).resolves.toBeNull();
    await writeFile(fixture.shellPath, '{"changed":true}', 'utf8');
    await expect(fixture.port.archive('shell')).rejects.toThrow('archive already exists');
    expect(await readFile(fixture.shellPath, 'utf8')).toBe('{"changed":true}');
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-state-adapter-'));
  roots.push(root);
  const shellPath = join(root, 'shell.json');
  const settingsPath = join(root, 'settings.json');
  await Promise.all([
    writeFile(shellPath, '{"old":"shell"}', 'utf8'),
    writeFile(settingsPath, '{"old":"settings"}', 'utf8'),
  ]);
  return {
    root,
    shellPath,
    settingsPath,
    port: createDesktopRetiredJsonStatePort({
      shellStatePath: shellPath,
      applicationSettingsPath: settingsPath,
    }),
  };
}
