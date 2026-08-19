import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildSkillActivationId, createNodePiSkillHost } from '../pi/skill-host';
import { createNodeCommandHost } from './command-host';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('CommandHost', () => {
  it('discovers commands independently and interpolates exact arguments', async () => {
    const root = await fixtureRoot();
    const commandRoot = join(root, 'commands');
    await mkdir(commandRoot);
    await writeFile(
      join(commandRoot, 'review.md'),
      `---\ndescription: Review a target.\nargument-hint: <target> [note]\nsupports-arguments: true\n---\nReview $1 with all arguments: $ARGUMENTS. Optional: $2.\n`,
      'utf8',
    );
    const snapshot = await createNodeCommandHost(root).discover([
      { path: commandRoot, source: { kind: 'personal' } },
    ]);
    const record = snapshot.records[0]!;

    expect(record.name).toBe('review');
    expect(snapshot.invokeExact('review', record.activationId, '"release notes" concise')).toBe(
      'Review release notes with all arguments: "release notes" concise. Optional: concise.',
    );
  });

  it('keeps /review independent from a same-name Skill namespace', async () => {
    const root = await fixtureRoot();
    const commandRoot = join(root, 'commands');
    const skillRoot = join(root, '.agents', 'skills', 'review');
    await mkdir(commandRoot);
    await mkdir(skillRoot, { recursive: true });
    await writeFile(
      join(commandRoot, 'review.md'),
      '---\ndescription: Command review.\n---\nCommand body.\n',
      'utf8',
    );
    await writeFile(
      join(skillRoot, 'SKILL.md'),
      '---\nname: review\ndescription: Skill review.\n---\nSkill body.\n',
      'utf8',
    );
    const [commands, skills] = await Promise.all([
      createNodeCommandHost(root).discover([{ path: commandRoot, source: { kind: 'personal' } }]),
      createNodePiSkillHost({
        cwd: root,
        policy: { isTrusted: () => true, isEnabled: () => true },
      }).discover([{ path: join(root, '.agents', 'skills'), source: { kind: 'personal' } }]),
    ]);
    expect(commands.records.map((record) => record.name)).toEqual(['review']);
    expect(skills.records.map((record) => record.name)).toEqual(['review']);
    expect(commands.invokeExact('review', commands.records[0]!.activationId)).toBe('Command body.');
    expect(skills.invokeExact('review', buildSkillActivationId(skills.records[0]!))).toContain(
      'Skill body.',
    );
  });

  it('selects one same-name Command by source priority and reports the shadowed file', async () => {
    const root = await fixtureRoot();
    const personalRoot = join(root, 'personal');
    const projectRoot = join(root, 'project');
    await Promise.all([mkdir(personalRoot), mkdir(projectRoot)]);
    await Promise.all([
      writeFile(
        join(personalRoot, 'review.md'),
        '---\ndescription: Personal review.\n---\nPersonal body.\n',
        'utf8',
      ),
      writeFile(
        join(projectRoot, 'review.md'),
        '---\ndescription: Project review.\n---\nProject body.\n',
        'utf8',
      ),
    ]);

    const snapshot = await createNodeCommandHost(root).discover([
      { path: personalRoot, source: { kind: 'personal' } },
      { path: projectRoot, source: { kind: 'project' } },
    ]);

    expect(snapshot.records).toEqual([
      expect.objectContaining({ name: 'review', source: { kind: 'project' } }),
    ]);
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: 'duplicate-command',
        path: join(personalRoot, 'review.md'),
        source: { kind: 'personal' },
      }),
    ]);
    expect(snapshot.invokeExact('review', snapshot.records[0]!.activationId)).toBe('Project body.');
  });

  it('accepts canonical plugin identities and rejects malformed plugin roots', async () => {
    const root = await fixtureRoot();
    const commandRoot = join(root, 'commands');
    await mkdir(commandRoot);
    await writeFile(
      join(commandRoot, 'review.md'),
      '---\ndescription: Plugin review.\n---\nPlugin body.\n',
      'utf8',
    );

    const snapshot = await createNodeCommandHost(root).discover([
      {
        path: commandRoot,
        source: { kind: 'plugin', pluginId: 'review-tools' },
      },
    ]);
    expect(snapshot.records[0]).toMatchObject({
      source: { kind: 'plugin', pluginId: 'review-tools' },
    });
    await expect(
      createNodeCommandHost(root).discover([
        { path: commandRoot, source: { kind: 'plugin', pluginId: '../escape' } },
      ]),
    ).rejects.toThrow('Plugin id is invalid.');
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-command-host-'));
  roots.push(root);
  return root;
}
