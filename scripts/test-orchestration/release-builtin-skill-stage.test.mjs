import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { stageReleaseBuiltinSkills } from '../prepare-dsh-runtime-stage.mjs';

test('Release builtin Skill stage excludes Character and World without changing the source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'openneko-release-skill-stage-'));
  const sourceRoot = join(root, 'source');
  const stageRoot = join(root, 'stage');
  try {
    for (const name of ['character-creator', 'world-creator', 'storyboard']) {
      const skillRoot = join(sourceRoot, name);
      await mkdir(skillRoot, { recursive: true });
      await writeFile(join(skillRoot, 'SKILL.md'), `# ${name}\n`, 'utf8');
    }

    assert.deepEqual(stageReleaseBuiltinSkills(sourceRoot, stageRoot), ['storyboard']);
    assert.deepEqual(await readdir(stageRoot), ['storyboard']);
    assert.equal(
      await readFile(join(stageRoot, 'storyboard', 'SKILL.md'), 'utf8'),
      '# storyboard\n',
    );
    assert.equal(
      await readFile(join(sourceRoot, 'character-creator', 'SKILL.md'), 'utf8'),
      '# character-creator\n',
    );
    assert.equal(
      await readFile(join(sourceRoot, 'world-creator', 'SKILL.md'), 'utf8'),
      '# world-creator\n',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
