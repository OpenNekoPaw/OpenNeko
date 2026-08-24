import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDesktopDshSkillAuthoringService } from './desktop-dsh-skill-authoring';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop DSH Skill authoring', () => {
  it('publishes an Assistant-created package only to the configured DSH personal root', async () => {
    const workspaceRoot = await fixtureRoot('openneko-personal-workspace-');
    const personalParent = await fixtureRoot('openneko-personal-skill-');
    const service = createDesktopDshSkillAuthoringService({
      assistantSpaceId: 'assistant:one',
      personalSkillRoot: join(personalParent, 'skills'),
      workspaceGrants: workspaceAuthority(workspaceRoot),
      bridge: {
        validateStagedSkill: vi.fn(async () => ({ name: 'personal-skill' })),
        observeSkill: vi.fn(async () => ({
          complete: true,
          skill: {
            name: 'personal-skill',
            source: 'user-dsh',
            provider: 'local',
            userInvocable: true,
            modelInvocable: true,
          },
        })),
      },
    });

    await expect(
      service.create({
        sessionId: 'dsh:assistant',
        context: { kind: 'assistant', assistantSpaceId: 'assistant:one', baseGrantIds: [] },
        package: {
          layout: 'directory',
          skillMarkdown:
            '---\nname: personal-skill\ndescription: Personal Skill.\n---\n# Personal Skill\n',
          resources: [],
        },
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: 'ready', source: 'user-dsh' });
    expect(
      await readFile(join(personalParent, 'skills/personal-skill/SKILL.md'), 'utf8'),
    ).toContain('name: personal-skill');
    await expect(
      readFile(join(workspaceRoot, '.agents/skills/personal-skill/SKILL.md')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('publishes a validated directory package only to the exact Workspace authority', async () => {
    const workspaceRoot = await fixtureRoot('openneko-skill-workspace-');
    const personalParent = await fixtureRoot('openneko-skill-personal-');
    const validateStagedSkill = vi.fn(async () => ({ name: 'sample-skill' }));
    const service = createDesktopDshSkillAuthoringService({
      assistantSpaceId: 'assistant:one',
      personalSkillRoot: join(personalParent, 'skills'),
      workspaceGrants: workspaceAuthority(workspaceRoot),
      bridge: {
        validateStagedSkill,
        observeSkill: vi.fn(async () => ({
          complete: true,
          skill: {
            name: 'sample-skill',
            source: 'project-agents',
            provider: 'local',
            userInvocable: true,
            modelInvocable: true,
          },
        })),
      },
    });
    const skillMarkdown =
      '---\nname: sample-skill\ndescription: Sample Skill.\n---\n# Sample Skill\n';

    await expect(
      service.create({
        sessionId: 'dsh:one',
        context: {
          kind: 'workspace',
          workspaceId: 'workspace:one',
          workspaceGrantId: 'workspace-grant:one',
        },
        package: {
          layout: 'directory',
          skillMarkdown,
          resources: [{ path: 'references/guide.md', content: '# Guide\n' }],
        },
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      status: 'ready',
      name: 'sample-skill',
      layout: 'directory',
      source: 'project-agents',
      provider: 'local',
    });
    expect(
      await readFile(join(workspaceRoot, '.agents/skills/sample-skill/SKILL.md'), 'utf8'),
    ).toBe(skillMarkdown);
    expect(
      await readFile(
        join(workspaceRoot, '.agents/skills/sample-skill/references/guide.md'),
        'utf8',
      ),
    ).toBe('# Guide\n');
    await expect(
      readFile(join(personalParent, 'skills/sample-skill/SKILL.md')),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(validateStagedSkill).toHaveBeenCalledWith({
      stagingRoot: expect.stringContaining('openneko-skill-authoring-'),
      layout: 'directory',
      entry: 'candidate/SKILL.md',
    });
  });

  it('publishes a flat package main file last without replacing an existing target', async () => {
    const workspaceRoot = await fixtureRoot('openneko-flat-skill-');
    const personalParent = await fixtureRoot('openneko-flat-personal-');
    const skillRoot = join(workspaceRoot, '.agents', 'skills');
    await mkdir(skillRoot, { recursive: true });
    await writeFile(join(skillRoot, 'existing-skill.md'), 'ORIGINAL', 'utf8');
    const service = createDesktopDshSkillAuthoringService({
      assistantSpaceId: 'assistant:one',
      personalSkillRoot: join(personalParent, 'skills'),
      workspaceGrants: workspaceAuthority(workspaceRoot),
      bridge: {
        validateStagedSkill: vi.fn(async () => ({ name: 'existing-skill' })),
        observeSkill: vi.fn(),
      },
    });

    await expect(
      service.create({
        sessionId: 'dsh:one',
        context: {
          kind: 'workspace',
          workspaceId: 'workspace:one',
          workspaceGrantId: 'workspace-grant:one',
        },
        package: {
          layout: 'flat',
          skillMarkdown:
            '---\nname: existing-skill\ndescription: Replacement.\n---\n# Replacement\n',
          resources: [{ path: 'existing-skill/guide.md', content: 'MUST_NOT_COMMIT' }],
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'SKILL_AUTHORING_ALREADY_EXISTS' });
    expect(await readFile(join(skillRoot, 'existing-skill.md'), 'utf8')).toBe('ORIGINAL');
    await expect(readFile(join(skillRoot, 'existing-skill/guide.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('preserves an existing directory package without merging staged resources', async () => {
    const workspaceRoot = await fixtureRoot('openneko-existing-directory-skill-');
    const personalParent = await fixtureRoot('openneko-existing-directory-personal-');
    const existingRoot = join(workspaceRoot, '.agents', 'skills', 'existing-skill');
    await mkdir(existingRoot, { recursive: true });
    await writeFile(join(existingRoot, 'SKILL.md'), 'ORIGINAL', 'utf8');
    const service = createDesktopDshSkillAuthoringService({
      assistantSpaceId: 'assistant:one',
      personalSkillRoot: join(personalParent, 'skills'),
      workspaceGrants: workspaceAuthority(workspaceRoot),
      bridge: {
        validateStagedSkill: vi.fn(async () => ({ name: 'existing-skill' })),
        observeSkill: vi.fn(),
      },
    });

    await expect(
      service.create({
        sessionId: 'dsh:one',
        context: {
          kind: 'workspace',
          workspaceId: 'workspace:one',
          workspaceGrantId: 'workspace-grant:one',
        },
        package: {
          layout: 'directory',
          skillMarkdown:
            '---\nname: existing-skill\ndescription: Replacement.\n---\n# Replacement\n',
          resources: [{ path: 'references/guide.md', content: 'MUST_NOT_COMMIT' }],
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'SKILL_AUTHORING_ALREADY_EXISTS' });
    expect(await readFile(join(existingRoot, 'SKILL.md'), 'utf8')).toBe('ORIGINAL');
    await expect(readFile(join(existingRoot, 'references/guide.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('publishes a flat Skill and collision-safe shared-directory resources', async () => {
    const workspaceRoot = await fixtureRoot('openneko-flat-created-');
    const personalParent = await fixtureRoot('openneko-flat-created-personal-');
    const service = createDesktopDshSkillAuthoringService({
      assistantSpaceId: 'assistant:one',
      personalSkillRoot: join(personalParent, 'skills'),
      workspaceGrants: workspaceAuthority(workspaceRoot),
      bridge: {
        validateStagedSkill: vi.fn(async () => ({ name: 'flat-skill' })),
        observeSkill: vi.fn(async () => ({
          complete: true,
          skill: {
            name: 'flat-skill',
            source: 'project-agents',
            provider: 'local',
            userInvocable: true,
            modelInvocable: false,
          },
        })),
      },
    });

    await service.create({
      sessionId: 'dsh:one',
      context: {
        kind: 'workspace',
        workspaceId: 'workspace:one',
        workspaceGrantId: 'workspace-grant:one',
      },
      package: {
        layout: 'flat',
        skillMarkdown:
          '---\nname: flat-skill\ndescription: Flat Skill.\ndisable-model-invocation: true\n---\n# Flat Skill\n',
        resources: [{ path: 'flat-skill/guide.md', content: '# Guide\n' }],
      },
      signal: new AbortController().signal,
    });

    expect(await readFile(join(workspaceRoot, '.agents/skills/flat-skill.md'), 'utf8')).toContain(
      'disable-model-invocation: true',
    );
    expect(await readFile(join(workspaceRoot, '.agents/skills/flat-skill/guide.md'), 'utf8')).toBe(
      '# Guide\n',
    );
  });

  it('rejects resource traversal before creating a staging directory', async () => {
    const workspaceRoot = await fixtureRoot('openneko-invalid-skill-');
    const personalParent = await fixtureRoot('openneko-invalid-personal-');
    const validateStagedSkill = vi.fn();
    const service = createDesktopDshSkillAuthoringService({
      assistantSpaceId: 'assistant:one',
      personalSkillRoot: join(personalParent, 'skills'),
      workspaceGrants: workspaceAuthority(workspaceRoot),
      bridge: { validateStagedSkill, observeSkill: vi.fn() },
    });

    await expect(
      service.create({
        sessionId: 'dsh:one',
        context: {
          kind: 'workspace',
          workspaceId: 'workspace:one',
          workspaceGrantId: 'workspace-grant:one',
        },
        package: {
          layout: 'directory',
          skillMarkdown: '---\nname: invalid-skill\ndescription: Invalid.\n---\n# Invalid\n',
          resources: [{ path: '../escape.txt', content: 'MUST_NOT_ESCAPE' }],
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'SKILL_AUTHORING_RESOURCE_PATH_INVALID' });
    expect(validateStagedSkill).not.toHaveBeenCalled();
    await expect(readFile(join(workspaceRoot, 'escape.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

async function fixtureRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function workspaceAuthority(workspaceRoot: string) {
  return {
    resolveAuthorizedWorkspace: vi.fn(async () => ({
      workspaceGrantId: 'workspace-grant:one',
      windowId: 'window:one',
      workspace: {
        workspaceId: 'workspace:one',
        workspacePath: workspaceRoot,
        displayName: 'Workspace',
        locator: { kind: 'variable' as const, value: '${HOME}/workspace' },
      },
    })),
  };
}
