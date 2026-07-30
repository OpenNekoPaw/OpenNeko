import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverSuites, loadSuite, selectSuiteCases } from './discovery.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('Agent Evaluation v2 suite discovery', () => {
  it('discovers an indexed Agent runtime suite by target and case id', async () => {
    const discovered = await discoverSuites();
    const selected = selectSuiteCases(discovered, {
      target: { kind: 'model', id: 'chat-model-binding' },
      caseGroup: 'canonical',
      caseId: 'explicit-chat-model',
    });
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      suite: {
        id: 'agent-runtime.model-binding',
        owner: { kind: 'agent-runtime', id: 'session-model-binding' },
      },
      scenario: { id: 'explicit-chat-model', schema: 'neko.agent-eval.scenario.v2' },
    });
  });

  it('rejects unknown selectors and unmatched targets', async () => {
    const discovered = await discoverSuites();
    expect(() => selectSuiteCases(discovered, { defaultSuite: true })).toThrow(
      'unknown suite selector field',
    );
    expect(() =>
      selectSuiteCases(discovered, { target: { kind: 'runtime', id: 'unmapped' } }),
    ).toThrow('no v2 Evaluation cases matched');
  });

  it('requires full Host identity when selecting a Skill target', async () => {
    const discovered = await discoverSuites();
    expect(() =>
      selectSuiteCases(discovered, { target: { kind: 'skill', identity: { name: 'storyboard' } } }),
    ).toThrow('requires full Host identity');
  });

  it('rejects suite/case index drift and missing profile references', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-suite-'));
    temporaryDirectories.push(root);
    const source = (await discoverSuites()).find(
      (item) => item.suite.id === 'agent-runtime.model-binding',
    );
    const suiteDirectory = join(root, 'agent-runtime', 'model-binding');
    await fs.mkdir(join(suiteDirectory, 'cases'), { recursive: true });
    const suite = structuredClone(source.suite);
    suite.fixtures[0].root = 'agent-runtime/model-binding/fixture';
    await fs.writeFile(
      join(suiteDirectory, 'suite.json'),
      `${JSON.stringify(suite, null, 2)}\n`,
    );
    const scenario = structuredClone(source.cases[0].scenario);
    scenario.runtimeProfileId = 'missing-profile';
    await fs.writeFile(
      join(suiteDirectory, 'cases', 'explicit-chat-model.json'),
      `${JSON.stringify(scenario, null, 2)}\n`,
    );

    await expect(
      loadSuite(join(suiteDirectory, 'suite.json'), { suitesRoot: root }),
    ).rejects.toThrow('runtime profile reference(s) not found');
  });
});
