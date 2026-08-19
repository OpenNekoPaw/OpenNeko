import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createNodePiSkillHost } from '../../pi/skill-host';
import { createNodeSkillPackageCreationService } from '../../pi/skill-package-creation-service';
import { resolvePersonalAgentSkillsDir, resolveProjectAgentSkillsDir } from '../agent-skill-layout';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Agent Skill layout', () => {
  it('uses only portable .agents/skills roots', () => {
    expect(resolvePersonalAgentSkillsDir('/home/user')).toBe('/home/user/.agents/skills');
    expect(resolveProjectAgentSkillsDir('/workspace')).toBe('/workspace/.agents/skills');
    expect(resolveProjectAgentSkillsDir(undefined)).toBeNull();
  });

  it('ignores and preserves retired .neko/skills bytes during discovery and creation', async () => {
    const home = await fixtureRoot();
    const retiredFile = join(home, '.neko', 'skills', 'retired', 'SKILL.md');
    const retiredBytes = 'retired bytes must remain untouched\n';
    await mkdir(join(home, '.neko', 'skills', 'retired'), { recursive: true });
    await writeFile(retiredFile, retiredBytes, 'utf8');

    const portableRoot = resolvePersonalAgentSkillsDir(home);
    const snapshot = await createNodePiSkillHost({
      cwd: home,
      policy: { isTrusted: () => true, isEnabled: () => true },
    }).discover([{ path: portableRoot, source: { kind: 'personal' } }]);
    expect(snapshot.records).toEqual([]);

    await createNodeSkillPackageCreationService().create({
      skillRoot: portableRoot,
      authorityRoot: home,
      request: {
        target: 'personal',
        skill: {
          name: 'new-skill',
          description: 'A new portable Skill.',
          body: 'Use portable guidance.',
        },
      },
    });

    expect(await readFile(retiredFile, 'utf8')).toBe(retiredBytes);
    expect(await readFile(join(portableRoot, 'new-skill', 'SKILL.md'), 'utf8')).toContain(
      'name: new-skill',
    );
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'openneko-agent-skill-layout-'));
  roots.push(root);
  return root;
}
