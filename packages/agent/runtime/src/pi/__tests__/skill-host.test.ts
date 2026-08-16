import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildSkillActivationId,
  PiSkillHost,
  SkillHostError,
  type PiSkillHostSnapshot,
  type SkillHostPolicy,
  type SkillSourceKind,
} from '../skill-host';

describe('PiSkillHost', () => {
  let root: string;
  let env: NodeExecutionEnv;
  const policy: SkillHostPolicy = {
    isTrusted: () => true,
    isEnabled: () => true,
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'neko-skill-host-'));
    env = new NodeExecutionEnv({ cwd: root });
  });

  afterEach(async () => {
    await env.cleanup();
    await rm(root, { recursive: true, force: true });
  });

  it('selects trusted enabled project Skills first and reports duplicate warnings', async () => {
    await createSkill(root, 'builtin', 'shared', 'Builtin body');
    await createSkill(root, 'personal', 'shared', 'Personal body');
    await createSkill(root, 'project', 'shared', 'Project body');
    const host = new PiSkillHost(env, policy);

    const snapshot = await host.discover(sourceRoots(root, ['builtin', 'personal', 'project']));

    expect(snapshot.records).toEqual([
      expect.objectContaining({
        name: 'shared',
        source: { kind: 'project' },
      }),
    ]);
    expect(snapshot.warnings).toHaveLength(2);
    expect(snapshot.shadowedRecords).toEqual([
      expect.objectContaining({ name: 'shared', source: { kind: 'builtin' } }),
      expect.objectContaining({ name: 'shared', source: { kind: 'personal' } }),
    ]);
    expect(invokeSelected(snapshot, 'shared')).toContain('Project body');
  });

  it('preserves plugin identity and deterministically selects same-name plugin Skills', async () => {
    await createSkill(root, 'plugin-a', 'shared', 'Plugin A body');
    await createSkill(root, 'plugin-b', 'shared', 'Plugin B body');
    const snapshot = await new PiSkillHost(env, policy).discover([
      {
        path: join(root, 'plugin-b'),
        source: { kind: 'plugin', pluginId: 'beta' },
      },
      {
        path: join(root, 'plugin-a'),
        source: { kind: 'plugin', pluginId: 'alpha' },
      },
    ]);

    expect(snapshot.records[0]).toMatchObject({
      name: 'shared',
      source: { kind: 'plugin', pluginId: 'alpha' },
    });
    expect(snapshot.warnings).toEqual([
      expect.objectContaining({
        selectedSource: 'plugin',
        selectedPluginId: 'alpha',
        shadowedSource: 'plugin',
        shadowedPluginId: 'beta',
      }),
    ]);
    await expect(
      snapshot.readModelSelectedContent(snapshot.records[0]!.locator.value),
    ).resolves.toMatchObject({
      receipt: {
        skillName: 'shared',
        source: { kind: 'plugin', pluginId: 'alpha' },
      },
    });
    expect(invokeSelected(snapshot, 'shared')).toContain('Plugin A body');
  });

  it('rejects a plugin Skill root without a valid plugin identity', async () => {
    await createSkill(root, 'plugin', 'invalid-source', 'Body');
    await expect(
      new PiSkillHost(env, policy).discover([
        {
          path: join(root, 'plugin'),
          source: { kind: 'plugin', pluginId: '../invalid' },
        },
      ]),
    ).rejects.toThrow('invalid plugin id');
  });

  it('keeps explicit-only Skills invokable while excluding them from model disclosure', async () => {
    const directory = await createSkill(root, 'project', 'explicit-only', 'Explicit body');
    await writeFile(
      join(directory, 'SKILL.md'),
      `---\nname: explicit-only\ndescription: explicit fixture\ndisable-model-invocation: true\n---\nExplicit body\n`,
      'utf8',
    );

    const snapshot = await new PiSkillHost(env, policy).discover(sourceRoots(root, ['project']));

    expect(snapshot.skills[0]!.disableModelInvocation).toBe(true);
    expect(invokeSelected(snapshot, 'explicit-only')).toContain('Explicit body');
  });

  it('treats Host-specific portable metadata as inert Skill content metadata', async () => {
    const directory = await createSkill(root, 'project', 'ordinary', 'Ordinary body');
    await writeFile(
      join(directory, 'SKILL.md'),
      `---\nname: ordinary\ndescription: ordinary fixture\nmetadata:\n  openneko.binding: workspace\n  openneko.authoring-target-kind: character-project\n  model: forbidden-provider\n---\nOrdinary body\n`,
      'utf8',
    );

    const snapshot = await new PiSkillHost(env, policy).discover(sourceRoots(root, ['project']));

    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.records[0]).toEqual(
      expect.objectContaining({ name: 'ordinary', source: { kind: 'project' } }),
    );
    expect(invokeSelected(snapshot, 'ordinary')).toContain('Ordinary body');
  });

  it('rejects stale or cross-entry selection identities without name fallback', async () => {
    const skillRoot = await createSkill(root, 'project', 'review', 'Version one');
    const host = new PiSkillHost(env, policy);
    const first = await host.discover(sourceRoots(root, ['project']));
    const firstRecord = first.records[0]!;
    await writeFile(join(skillRoot, 'SKILL.md'), skillDocument('review', 'Version two'), 'utf8');
    const second = await host.discover(sourceRoots(root, ['project']));

    expect(() => second.invokeExact('review', buildSkillActivationId(firstRecord))).toThrowError(
      expect.objectContaining<Partial<SkillHostError>>({
        code: 'skill-not-found',
        message: expect.stringContaining('Skill selection'),
      }),
    );
    expect(invokeSelected(second, 'review')).toContain('Version two');
  });

  it('exposes only process-local virtual locators and contained relative resources', async () => {
    const skillRoot = await createSkill(root, 'project', 'portable', 'Read references/guide.md');
    await mkdir(join(skillRoot, 'references'));
    await writeFile(join(skillRoot, 'references', 'guide.md'), 'Guide body', 'utf8');
    const host = new PiSkillHost(env, policy);
    const snapshot = await host.discover(sourceRoots(root, ['project']));
    const record = snapshot.records[0]!;
    const activationId = buildSkillActivationId(record);
    const resource = snapshot.resource('portable', activationId, 'references/guide.md');

    expect(record.locator.value).toMatch(/^\/__neko_skills\/[0-9a-f-]+\/[0-9a-f]{64}\/SKILL\.md$/);
    expect(record.locator.value).not.toContain(root);
    expect(resource.value).not.toContain(root);
    expect(snapshot.skills[0]!.filePath).toBe(record.locator.value);
    await expect(snapshot.readText(record.locator)).resolves.toContain('Read references/guide.md');
    await expect(snapshot.readText(resource)).resolves.toBe('Guide body');
    await expect(snapshot.readModelSelectedContent(record.locator.value)).resolves.toMatchObject({
      receipt: {
        skillName: 'portable',
        source: { kind: 'project' },
        fingerprint: record.fingerprint,
        locator: record.locator.value,
        locatorKind: 'skill',
      },
    });
    expect(() => snapshot.resource('portable', activationId, '../secret.txt')).toThrowError(
      expect.objectContaining<Partial<SkillHostError>>({ code: 'invalid-resource-path' }),
    );
  });

  it('rejects a symlink that escapes the Skill package', async () => {
    const skillRoot = await createSkill(root, 'project', 'portable', 'Body');
    const outside = join(root, 'outside.txt');
    await writeFile(outside, 'secret', 'utf8');
    await mkdir(join(skillRoot, 'references'));
    await symlink(outside, join(skillRoot, 'references', 'outside.txt'));
    const snapshot = await new PiSkillHost(env, policy).discover(sourceRoots(root, ['project']));

    await expect(
      snapshot.readText(
        snapshot.resource(
          'portable',
          buildSkillActivationId(snapshot.records[0]!),
          'references/outside.txt',
        ),
      ),
    ).rejects.toMatchObject({ code: 'resource-outside-skill' });
  });

  it('refreshes fingerprints on the next discovery while preserving the in-flight snapshot', async () => {
    const skillRoot = await createSkill(root, 'project', 'changing', 'Version one');
    const host = new PiSkillHost(env, policy);
    const first = await host.discover(sourceRoots(root, ['project']));
    await writeFile(join(skillRoot, 'SKILL.md'), skillDocument('changing', 'Version two'), 'utf8');
    const second = await host.discover(sourceRoots(root, ['project']));

    expect(first.records[0]!.fingerprint).not.toBe(second.records[0]!.fingerprint);
    expect(invokeSelected(first, 'changing')).toContain('Version one');
    expect(invokeSelected(second, 'changing')).toContain('Version two');
    await expect(second.readText(first.records[0]!.locator)).rejects.toMatchObject({
      code: 'invalid-locator',
    });
  });

  it('changes the fingerprint when a contained script changes', async () => {
    const skillRoot = await createSkill(root, 'project', 'changing-script', 'Run the script');
    await mkdir(join(skillRoot, 'scripts'));
    const scriptPath = join(skillRoot, 'scripts', 'run.mjs');
    await writeFile(scriptPath, 'export const version = 1;', 'utf8');
    const host = new PiSkillHost(env, policy);
    const first = await host.discover(sourceRoots(root, ['project']));
    await writeFile(scriptPath, 'export const version = 2;', 'utf8');

    const second = await host.discover(sourceRoots(root, ['project']));

    expect(first.records[0]!.fingerprint).not.toBe(second.records[0]!.fingerprint);
  });

  it('filters untrusted or disabled records before duplicate selection', async () => {
    await createSkill(root, 'builtin', 'shared', 'Builtin body');
    await createSkill(root, 'project', 'shared', 'Project body');
    const host = new PiSkillHost(env, {
      isTrusted: ({ source }) => source.kind !== 'project',
      isEnabled: () => true,
    });

    const snapshot = await host.discover(sourceRoots(root, ['builtin', 'project']));

    expect(snapshot.records[0]!.source.kind).toBe('builtin');
    expect(snapshot.warnings).toEqual([]);
  });
});

function invokeSelected(snapshot: PiSkillHostSnapshot, name: string): string {
  const record = snapshot.records.find((candidate) => candidate.name === name);
  if (!record) throw new Error(`Fixture Skill '${name}' is unavailable.`);
  return snapshot.invokeExact(name, buildSkillActivationId(record));
}

async function createSkill(
  root: string,
  source: string,
  name: string,
  body: string,
): Promise<string> {
  const directory = join(root, source, name);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'SKILL.md'), skillDocument(name, body), 'utf8');
  return directory;
}

function skillDocument(name: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${name} fixture\n---\n${body}\n`;
}

function sourceRoots(root: string, sources: readonly Exclude<SkillSourceKind, 'plugin'>[]) {
  return sources.map((kind) => ({
    path: join(root, kind),
    source: { kind },
  }));
}
