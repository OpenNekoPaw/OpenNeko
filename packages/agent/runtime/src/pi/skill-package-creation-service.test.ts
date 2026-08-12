import { mkdtemp, readFile, readdir, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createNodeSkillPackageCreationService } from './skill-package-creation-service';

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('SkillPackageCreationService', () => {
  it('atomically creates one validated portable package with relative resources', async () => {
    const root = await fixtureRoot();
    const skillRoot = join(root, '.agents', 'skills');
    await expect(
      createNodeSkillPackageCreationService().create({
        skillRoot,
        authorityRoot: root,
        request: {
          target: 'personal',
          skill: {
            name: 'release-notes',
            description: 'Create release notes from repository evidence.',
            body: 'Inspect the repository evidence and write concise release notes.',
          },
          resources: [
            { path: 'references/style.md', encoding: 'utf8', content: '# Style\n\nBe concise.\n' },
          ],
        },
      }),
    ).resolves.toMatchObject({
      name: 'release-notes',
      source: 'personal',
    });

    expect(await readFile(join(skillRoot, 'release-notes', 'SKILL.md'), 'utf8')).toContain(
      'name: release-notes',
    );
    expect(await readFile(join(skillRoot, 'release-notes', 'references', 'style.md'), 'utf8')).toBe(
      '# Style\n\nBe concise.\n',
    );
    expect(
      (await readdir(join(root, '.agents'))).filter((name) => name.includes('staging')),
    ).toEqual([]);
  });

  it.each(['../outside.md', '/tmp/outside.md', 'nested\\outside.md', 'SKILL.md', 'a//b.md'])(
    'rejects unsafe resource path %s without creating the target root',
    async (resourcePath) => {
      const root = await fixtureRoot();
      const skillRoot = join(root, '.agents', 'skills');
      await expect(
        createNodeSkillPackageCreationService().create({
          skillRoot,
          authorityRoot: root,
          request: {
            target: 'personal',
            skill: {
              name: 'unsafe-skill',
              description: 'Unsafe fixture.',
              body: 'Do the task.',
            },
            resources: [{ path: resourcePath, encoding: 'utf8', content: 'unsafe' }],
          },
        }),
      ).rejects.toThrow(/relative path|reserved|escapes/u);
      await expect(readdir(skillRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('preserves an existing same-name package byte-for-byte', async () => {
    const root = await fixtureRoot();
    const skillRoot = join(root, '.agents', 'skills');
    const existing = join(skillRoot, 'existing-skill');
    await mkdir(existing, { recursive: true });
    await writeFile(join(existing, 'SKILL.md'), 'existing bytes', 'utf8');

    await expect(
      createNodeSkillPackageCreationService().create({
        skillRoot,
        authorityRoot: root,
        request: {
          target: 'personal',
          skill: { name: 'existing-skill', description: 'Replacement.', body: 'Replace it.' },
        },
      }),
    ).rejects.toThrow('already exists');
    expect(await readFile(join(existing, 'SKILL.md'), 'utf8')).toBe('existing bytes');
  });

  it('rejects invalid base64 without creating a package', async () => {
    const root = await fixtureRoot();
    const skillRoot = join(root, '.agents', 'skills');
    await expect(
      createNodeSkillPackageCreationService().create({
        skillRoot,
        authorityRoot: root,
        request: {
          target: 'personal',
          skill: { name: 'invalid-resource', description: 'Fixture.', body: 'Do the task.' },
          resources: [{ path: 'assets/data.bin', encoding: 'base64', content: '**invalid**' }],
        },
      }),
    ).rejects.toThrow('invalid base64');
    await expect(readdir(skillRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a Skill root symlink that escapes the authorized filesystem root', async () => {
    const root = await fixtureRoot();
    const outside = await fixtureRoot();
    const agentsRoot = join(root, '.agents');
    await mkdir(agentsRoot, { recursive: true });
    await symlink(outside, join(agentsRoot, 'skills'));

    await expect(
      createNodeSkillPackageCreationService().create({
        skillRoot: join(agentsRoot, 'skills'),
        authorityRoot: root,
        request: {
          target: 'project',
          skill: { name: 'escaped-skill', description: 'Fixture.', body: 'Do the task.' },
        },
      }),
    ).rejects.toThrow('escapes its authorized filesystem root');
    await expect(readdir(outside)).resolves.toEqual([]);
  });

  it('rejects oversized and Pi-invalid packages without publishing or retaining staging', async () => {
    const root = await fixtureRoot();
    const skillRoot = join(root, '.agents', 'skills');
    const service = createNodeSkillPackageCreationService();

    await expect(
      service.create({
        skillRoot,
        authorityRoot: root,
        request: {
          target: 'personal',
          skill: { name: 'too-large', description: 'Fixture.', body: 'Do the task.' },
          resources: [
            { path: 'assets/large.txt', encoding: 'utf8', content: 'x'.repeat(20_000_001) },
          ],
        },
      }),
    ).rejects.toThrow('exceeds');
    await expect(readdir(skillRoot)).rejects.toMatchObject({ code: 'ENOENT' });

    await expect(
      service.create({
        skillRoot,
        authorityRoot: root,
        request: {
          target: 'personal',
          skill: {
            name: 'pi-invalid',
            description: 'x'.repeat(1_025),
            body: 'Do the task.',
          },
        },
      }),
    ).rejects.toThrow('canonical SkillHost validation');
    expect(
      (await readdir(join(root, '.agents'))).filter((name) => name.includes('staging')),
    ).toEqual([]);
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-skill-authoring-'));
  roots.push(root);
  return root;
}
