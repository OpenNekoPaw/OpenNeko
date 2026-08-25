import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { importPersonalDshSkill } from './desktop-dsh-skill-import';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop personal DSH Skill import', () => {
  it('validates a staged real directory before atomically installing it', async () => {
    const root = await temporaryRoot();
    const selectedDirectory = join(root, 'selected');
    const personalSkillRoot = join(root, 'dsh-home', 'skills');
    const disabledSkillRoot = join(root, 'dsh-home', 'disabled-skills');
    await mkdir(selectedDirectory);
    await writeFile(join(selectedDirectory, 'SKILL.md'), '# Review\n', 'utf8');
    const validateStagedSkill = vi.fn(async () => ({ name: 'review' }));

    await expect(
      importPersonalDshSkill({
        selectedDirectory,
        personalSkillRoot,
        disabledSkillRoot,
        bridge: { validateStagedSkill },
      }),
    ).resolves.toBe('review');

    expect(validateStagedSkill).toHaveBeenCalledWith(
      expect.objectContaining({ layout: 'directory', entry: 'candidate/SKILL.md' }),
    );
    await expect(readFile(join(personalSkillRoot, 'review', 'SKILL.md'), 'utf8')).resolves.toBe(
      '# Review\n',
    );
  });

  it('rejects symbolic links without installing a partial Skill', async () => {
    const root = await temporaryRoot();
    const selectedDirectory = join(root, 'selected');
    const personalSkillRoot = join(root, 'dsh-home', 'skills');
    const disabledSkillRoot = join(root, 'dsh-home', 'disabled-skills');
    await mkdir(selectedDirectory);
    await writeFile(join(selectedDirectory, 'SKILL.md'), '# Review\n', 'utf8');
    await symlink(join(selectedDirectory, 'SKILL.md'), join(selectedDirectory, 'linked.md'));
    const validateStagedSkill = vi.fn(async () => ({ name: 'review' }));

    await expect(
      importPersonalDshSkill({
        selectedDirectory,
        personalSkillRoot,
        disabledSkillRoot,
        bridge: { validateStagedSkill },
      }),
    ).rejects.toThrow('cannot contain symbolic links');
    expect(validateStagedSkill).not.toHaveBeenCalled();
  });

  it('rejects a duplicate name that already exists in the disabled catalog', async () => {
    const root = await temporaryRoot();
    const selectedDirectory = join(root, 'selected');
    const personalSkillRoot = join(root, 'dsh-home', 'skills');
    const disabledSkillRoot = join(root, 'dsh-home', 'disabled-skills');
    await mkdir(selectedDirectory);
    await writeFile(join(selectedDirectory, 'SKILL.md'), '# Review\n', 'utf8');
    await mkdir(join(disabledSkillRoot, 'review'), { recursive: true });
    await writeFile(join(disabledSkillRoot, 'review', 'SKILL.md'), '# Existing\n', 'utf8');

    await expect(
      importPersonalDshSkill({
        selectedDirectory,
        personalSkillRoot,
        disabledSkillRoot,
        bridge: { validateStagedSkill: vi.fn(async () => ({ name: 'review' })) },
      }),
    ).rejects.toThrow("Personal Skill 'review' is already installed");
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-skill-import-test-'));
  roots.push(root);
  return root;
}
