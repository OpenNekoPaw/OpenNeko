import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createNodePiSkillHost } from '@neko-agent/runtime/pi';
import { describe, expect, it, vi } from 'vitest';

import {
  createPersonalSkillManager,
  createPersonalSkillManagementId,
} from './personal-skill-manager';

describe('Personal Skill manager', () => {
  it('stages, validates and atomically installs a Skill into the Pi personal root', async () => {
    await withFixture(async ({ source, personalRoot }) => {
      await writeSkill(source, 'story-planner');
      const manager = createPersonalSkillManager({
        personalSkillRoot: personalRoot,
        selectDirectory: vi.fn(async () => source),
        trashItem: vi.fn(),
      });

      await expect(manager.install('window-1')).resolves.toEqual({
        status: 'installed',
        name: 'story-planner',
      });
      const snapshot = await discoverPersonalSkills(personalRoot);
      expect(snapshot.records).toEqual([
        expect.objectContaining({
          name: 'story-planner',
          source: { kind: 'personal' },
        }),
      ]);
      await expect(manager.install('window-1')).rejects.toThrow('already installed');
    });
  });

  it('removes only a current opaque identity through the recoverable trash port', async () => {
    await withFixture(async ({ source, personalRoot }) => {
      await writeSkill(source, 'story-planner');
      const trashItem = vi.fn(async (path: string) => {
        await rm(path, { recursive: true });
      });
      const manager = createPersonalSkillManager({
        personalSkillRoot: personalRoot,
        selectDirectory: async () => source,
        trashItem,
      });
      await manager.install('window-1');
      const snapshot = await discoverPersonalSkills(personalRoot);
      const record = snapshot.records[0];
      if (!record) throw new Error('Fixture Skill was not discovered.');
      const managementId = createPersonalSkillManagementId(record);

      await expect(manager.remove(managementId, snapshot.records)).resolves.toEqual({
        name: 'story-planner',
      });
      expect(trashItem).toHaveBeenCalledWith(expect.stringMatching(/\/personal\/story-planner$/u));
      await expect(discoverPersonalSkills(personalRoot)).resolves.toMatchObject({ records: [] });
      await expect(
        manager.remove(`/Users/private/${managementId}`, snapshot.records),
      ).rejects.toThrow('identity is invalid');
    });
  });

  it('rejects packages containing symbolic links before Pi validation', async () => {
    await withFixture(async ({ root, source, personalRoot }) => {
      await writeSkill(source, 'unsafe');
      await writeFile(join(root, 'outside.txt'), 'private', 'utf8');
      await symlink(join(root, 'outside.txt'), join(source, 'linked.txt'));
      const manager = createPersonalSkillManager({
        personalSkillRoot: personalRoot,
        selectDirectory: async () => source,
        trashItem: vi.fn(),
      });

      await expect(manager.install('window-1')).rejects.toThrow('symbolic links');
      await expect(discoverPersonalSkills(personalRoot)).resolves.toMatchObject({ records: [] });
    });
  });
});

async function discoverPersonalSkills(personalRoot: string) {
  return createNodePiSkillHost({
    cwd: personalRoot,
    policy: {
      isTrusted: () => true,
      isEnabled: () => true,
    },
  }).discover([{ path: personalRoot, source: { kind: 'personal' } }]);
}

async function writeSkill(root: string, name: string): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Fixture Skill\n---\nUse the fixture method.\n`,
    'utf8',
  );
}

async function withFixture(
  run: (fixture: { root: string; source: string; personalRoot: string }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-personal-skill-'));
  try {
    await run({
      root,
      source: join(root, 'story-planner'),
      personalRoot: join(root, 'personal'),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
