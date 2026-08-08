import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildSkillActivationId,
  PiSkillHost,
  SkillHostError,
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
        trusted: true,
        enabled: true,
      }),
    ]);
    expect(snapshot.warnings).toHaveLength(2);
    expect(snapshot.shadowedRecords).toEqual([
      expect.objectContaining({ name: 'shared', source: { kind: 'builtin' } }),
      expect.objectContaining({ name: 'shared', source: { kind: 'personal' } }),
    ]);
    expect(snapshot.invoke('shared')).toContain('Project body');
  });

  it('preserves plugin identity and deterministically selects same-name plugin Skills', async () => {
    await createSkill(root, 'plugin-a', 'shared', 'Plugin A body');
    await createSkill(root, 'plugin-b', 'shared', 'Plugin B body');
    const snapshot = await new PiSkillHost(env, policy).discover([
      {
        path: join(root, 'plugin-b'),
        source: { kind: 'plugin', pluginId: 'beta@market' },
        entryPointKind: 'skill',
      },
      {
        path: join(root, 'plugin-a'),
        source: { kind: 'plugin', pluginId: 'alpha@market' },
        entryPointKind: 'skill',
      },
    ]);

    expect(snapshot.records[0]).toMatchObject({
      name: 'shared',
      source: { kind: 'plugin', pluginId: 'alpha@market' },
    });
    expect(snapshot.warnings).toEqual([
      expect.objectContaining({
        selectedSource: 'plugin',
        selectedPluginId: 'alpha@market',
        shadowedSource: 'plugin',
        shadowedPluginId: 'beta@market',
      }),
    ]);
    await expect(
      snapshot.readModelSelectedContent(snapshot.records[0]!.locator.value),
    ).resolves.toMatchObject({
      receipt: {
        skillName: 'shared',
        source: { kind: 'plugin', pluginId: 'alpha@market' },
      },
    });
    expect(snapshot.invoke('shared')).toContain('Plugin A body');
  });

  it('rejects a plugin Skill root without a valid plugin identity', async () => {
    await createSkill(root, 'plugin', 'invalid-source', 'Body');
    await expect(
      new PiSkillHost(env, policy).discover([
        {
          path: join(root, 'plugin'),
          source: { kind: 'plugin', pluginId: '../invalid' },
          entryPointKind: 'skill',
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
    expect(snapshot.invoke('explicit-only')).toContain('Explicit body');
  });

  it('keeps same-named Skills and command artifacts in independent entry-point namespaces', async () => {
    await createSkill(root, 'project', 'review', 'Skill review body');
    const commandRoot = join(root, 'project-commands');
    await createCommandArtifact(commandRoot, 'review', 'Command review body', {
      argumentHint: '<scope>',
      supportsArguments: true,
    });

    const snapshot = await new PiSkillHost(env, policy).discover([
      ...sourceRoots(root, ['project']),
      {
        path: commandRoot,
        source: { kind: 'project' },
        entryPointKind: 'command-artifact',
      },
    ]);

    const skill = snapshot.records.find((record) => record.entryPoint.kind === 'skill');
    const command = snapshot.records.find(
      (record) => record.entryPoint.kind === 'command-artifact',
    );
    expect(skill).toMatchObject({ name: 'review', entryPoint: { kind: 'skill' } });
    expect(command).toMatchObject({
      name: 'review',
      entryPoint: {
        kind: 'command-artifact',
        commandId: 'review',
        artifactId: 'command:review',
        argumentHint: '<scope>',
        supportsArguments: true,
      },
    });
    expect(snapshot.warnings).toEqual([]);
    expect(buildSkillActivationId(skill!)).not.toBe(buildSkillActivationId(command!));
    expect(snapshot.invokeExact('review', buildSkillActivationId(skill!))).toContain(
      'Skill review body',
    );
    expect(snapshot.invokeExact('review', buildSkillActivationId(command!))).toContain(
      'Command review body',
    );
  });

  it('isolates invalid command artifacts while preserving valid siblings', async () => {
    const commandRoot = join(root, 'project-commands');
    await createCommandArtifact(commandRoot, 'review', 'Review body');
    await writeFile(
      join(commandRoot, 'broken.md'),
      '---\nname: another-name\ndescription: broken fixture\n---\nBroken body\n',
      'utf8',
    );

    const snapshot = await new PiSkillHost(env, policy).discover([
      {
        path: commandRoot,
        source: { kind: 'project' },
        entryPointKind: 'command-artifact',
      },
    ]);

    expect(snapshot.records).toEqual([
      expect.objectContaining({
        name: 'review',
        entryPoint: expect.objectContaining({ kind: 'command-artifact' }),
      }),
    ]);
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid_metadata',
        source: { kind: 'project' },
        path: join(commandRoot, 'broken.md'),
      }),
    ]);
  });

  it('rejects stale or cross-entry activation identities without name fallback', async () => {
    const skillRoot = await createSkill(root, 'project', 'review', 'Version one');
    const host = new PiSkillHost(env, policy);
    const first = await host.discover(sourceRoots(root, ['project']));
    const firstRecord = first.records[0]!;
    await writeFile(join(skillRoot, 'SKILL.md'), skillDocument('review', 'Version two'), 'utf8');
    const second = await host.discover(sourceRoots(root, ['project']));

    expect(() => second.invokeExact('review', buildSkillActivationId(firstRecord))).toThrowError(
      expect.objectContaining<Partial<SkillHostError>>({ code: 'skill-not-found' }),
    );
    expect(second.invoke('review')).toContain('Version two');
  });

  it('exposes only process-local virtual locators and contained relative resources', async () => {
    const skillRoot = await createSkill(root, 'project', 'portable', 'Read references/guide.md');
    await mkdir(join(skillRoot, 'references'));
    await writeFile(join(skillRoot, 'references', 'guide.md'), 'Guide body', 'utf8');
    const host = new PiSkillHost(env, policy);
    const snapshot = await host.discover(sourceRoots(root, ['project']));
    const record = snapshot.records[0]!;
    const resource = snapshot.resource('portable', 'references/guide.md');

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
    expect(() => snapshot.resource('portable', '../secret.txt')).toThrowError(
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
      snapshot.readText(snapshot.resource('portable', 'references/outside.txt')),
    ).rejects.toMatchObject({ code: 'resource-outside-skill' });
  });

  it('refreshes fingerprints on the next discovery while preserving the in-flight snapshot', async () => {
    const skillRoot = await createSkill(root, 'project', 'changing', 'Version one');
    const host = new PiSkillHost(env, policy);
    const first = await host.discover(sourceRoots(root, ['project']));
    await writeFile(join(skillRoot, 'SKILL.md'), skillDocument('changing', 'Version two'), 'utf8');
    const second = await host.discover(sourceRoots(root, ['project']));

    expect(first.records[0]!.fingerprint).not.toBe(second.records[0]!.fingerprint);
    expect(first.invoke('changing')).toContain('Version one');
    expect(second.invoke('changing')).toContain('Version two');
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

  it('executes scripts only after the explicit user/workspace permission policy allows it', async () => {
    const skillRoot = await createSkill(root, 'project', 'processor', 'Use scripts/process.mjs');
    await mkdir(join(skillRoot, 'scripts'));
    await writeFile(join(skillRoot, 'scripts', 'process.mjs'), 'export {};', 'utf8');
    let allowExecution = false;
    const authorize = vi.fn(() =>
      allowExecution
        ? { allowed: true as const }
        : { allowed: false as const, reason: 'user denied' },
    );
    const processorResult = {
      status: 'succeeded' as const,
      processorId: 'skill-script',
      registrationId: 'skill-script:fixture',
      run: { processorRunId: 'processor-run-1', stageId: 'main', attempt: 1 },
      outputs: [],
      diagnostics: [],
      exitCode: 0,
    };
    const execute = vi.fn(async () => processorResult);
    const host = new PiSkillHost(env, policy, {
      authorizer: { authorize },
      executor: { execute },
    });
    const snapshot = await host.discover(sourceRoots(root, ['project']));
    const script = snapshot.resource('processor', 'scripts/process.mjs');
    const input = {
      skillName: 'processor',
      script,
      args: ['--fixture'],
      conversationId: 'conversation-1',
      turnId: 'turn-1',
      workspaceTrusted: true,
    };

    await expect(
      snapshot.executeExternalProcessor({ ...input, workspaceTrusted: false }),
    ).rejects.toMatchObject({ code: 'external-processor-denied' });
    expect(authorize).not.toHaveBeenCalled();

    await expect(snapshot.executeExternalProcessor(input)).rejects.toMatchObject({
      code: 'external-processor-denied',
    });
    expect(execute).not.toHaveBeenCalled();

    allowExecution = true;
    await expect(snapshot.executeExternalProcessor(input)).resolves.toEqual(processorResult);
    expect(execute).toHaveBeenCalledWith({
      physicalScriptPath: expect.stringMatching(/\/project\/processor\/scripts\/process\.mjs$/),
      args: ['--fixture'],
    });
  });
});

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

async function createCommandArtifact(
  commandRoot: string,
  name: string,
  body: string,
  metadata: { readonly argumentHint?: string; readonly supportsArguments?: boolean } = {},
): Promise<void> {
  await mkdir(commandRoot, { recursive: true });
  await writeFile(
    join(commandRoot, `${name}.md`),
    [
      '---',
      `name: ${name}`,
      `description: ${name} command fixture`,
      ...(metadata.argumentHint === undefined ? [] : [`argument-hint: ${metadata.argumentHint}`]),
      `supports-arguments: ${metadata.supportsArguments ?? false}`,
      '---',
      body,
      '',
    ].join('\n'),
    'utf8',
  );
}

function sourceRoots(root: string, sources: readonly Exclude<SkillSourceKind, 'plugin'>[]) {
  return sources.map((kind) => ({
    path: join(root, kind),
    source: { kind },
    entryPointKind: 'skill' as const,
  }));
}
