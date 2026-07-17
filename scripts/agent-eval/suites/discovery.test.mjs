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
  it('discovers the strict Agent-runtime pilot by target, group, and case id', async () => {
    const discovered = await discoverSuites();
    const selected = selectSuiteCases(discovered, {
      target: { kind: 'runtime', id: 'single-message-tui' },
      caseGroup: 'canonical',
      caseId: 'canonical-answer',
    });
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      suite: {
        id: 'agent-runtime.single-message-tui',
        owner: { kind: 'agent-runtime', id: 'tui-session-runtime' },
      },
      scenario: { id: 'canonical-answer', schema: 'neko.agent-eval.scenario.v2' },
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
      (item) => item.suite.id === 'agent-runtime.single-message-tui',
    );
    const suiteDirectory = join(root, 'agent-runtime', 'single-message-tui');
    await fs.mkdir(join(suiteDirectory, 'cases'), { recursive: true });
    await fs.mkdir(join(suiteDirectory, 'rubrics'), { recursive: true });
    await fs.copyFile(source.file, join(suiteDirectory, 'suite.json'));
    await fs.writeFile(
      join(suiteDirectory, 'rubrics', 'constrained-teaser-answer-quality.json'),
      `${JSON.stringify(source.rubrics['rubrics/constrained-teaser-answer-quality.json'], null, 2)}\n`,
    );
    const scenario = structuredClone(source.cases[0].scenario);
    scenario.runtimeProfileId = 'missing-profile';
    await fs.writeFile(
      join(suiteDirectory, 'cases', 'canonical-answer.json'),
      `${JSON.stringify(scenario, null, 2)}\n`,
    );
    await expect(
      loadSuite(join(suiteDirectory, 'suite.json'), { suitesRoot: root }),
    ).rejects.toThrow('runtime profile reference(s) not found');

    scenario.runtimeProfileId = 'canonical-default';
    scenario.assertions.push({
      id: 'missing-model-profile',
      kind: 'model',
      profileId: 'missing-profile',
      noFallback: true,
      evidenceRef: 'turn-facts',
    });
    await fs.writeFile(
      join(suiteDirectory, 'cases', 'canonical-answer.json'),
      `${JSON.stringify(scenario, null, 2)}\n`,
    );
    await expect(
      loadSuite(join(suiteDirectory, 'suite.json'), { suitesRoot: root }),
    ).rejects.toThrow('model assertion profile reference(s) not found');
  });

  it('loads only contained suite-owned structured output schemas', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-output-schema-'));
    temporaryDirectories.push(root);
    const source = (await discoverSuites()).find(
      (item) => item.suite.id === 'agent-runtime.single-message-tui',
    );
    const suiteDirectory = join(root, 'agent-runtime', 'single-message-tui');
    await fs.mkdir(join(suiteDirectory, 'cases'), { recursive: true });
    await fs.mkdir(join(suiteDirectory, 'schemas'), { recursive: true });
    await fs.mkdir(join(suiteDirectory, 'rubrics'), { recursive: true });
    await fs.copyFile(source.file, join(suiteDirectory, 'suite.json'));
    await fs.writeFile(
      join(suiteDirectory, 'rubrics', 'constrained-teaser-answer-quality.json'),
      `${JSON.stringify(source.rubrics['rubrics/constrained-teaser-answer-quality.json'], null, 2)}\n`,
    );
    const scenario = structuredClone(source.cases[0].scenario);
    scenario.assertions.push({
      id: 'json-contract',
      kind: 'structured-output',
      format: 'json',
      schemaRef: 'schemas/result.json',
      requiredFields: ['status'],
      evidenceRef: 'turn-facts',
    });
    await fs.writeFile(
      join(suiteDirectory, 'cases', 'canonical-answer.json'),
      `${JSON.stringify(scenario, null, 2)}\n`,
    );
    await fs.writeFile(
      join(suiteDirectory, 'schemas', 'result.json'),
      `${JSON.stringify({
        type: 'object',
        required: ['status'],
        additionalProperties: false,
        properties: { status: { type: 'string' } },
      })}\n`,
    );
    const loaded = await loadSuite(join(suiteDirectory, 'suite.json'), { suitesRoot: root });
    expect(loaded.outputSchemas['schemas/result.json']).toMatchObject({ type: 'object' });

    scenario.assertions.at(-1).schemaRef = 'result.json';
    await fs.writeFile(
      join(suiteDirectory, 'cases', 'canonical-answer.json'),
      `${JSON.stringify(scenario, null, 2)}\n`,
    );
    await expect(
      loadSuite(join(suiteDirectory, 'suite.json'), { suitesRoot: root }),
    ).rejects.toThrow('must be owned under suite schemas');
  });

  it('rejects placeholder target hashes and profile hashes that drift from content', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-hash-'));
    temporaryDirectories.push(root);
    const source = (await discoverSuites()).find(
      (item) => item.suite.id === 'agent-runtime.single-message-tui',
    );
    const suiteDirectory = join(root, 'agent-runtime', 'single-message-tui');
    await fs.mkdir(join(suiteDirectory, 'cases'), { recursive: true });
    await fs.mkdir(join(suiteDirectory, 'rubrics'), { recursive: true });
    await fs.copyFile(source.cases[0].file, join(suiteDirectory, 'cases', 'canonical-answer.json'));
    await fs.writeFile(
      join(suiteDirectory, 'rubrics', 'constrained-teaser-answer-quality.json'),
      `${JSON.stringify(source.rubrics['rubrics/constrained-teaser-answer-quality.json'], null, 2)}\n`,
    );
    const suite = structuredClone(source.suite);
    suite.target.contractHash = `sha256:${'f'.repeat(64)}`;
    await fs.writeFile(join(suiteDirectory, 'suite.json'), `${JSON.stringify(suite, null, 2)}\n`);
    await expect(
      loadSuite(join(suiteDirectory, 'suite.json'), { suitesRoot: root }),
    ).rejects.toThrow('must not be a placeholder hash');

    suite.target.contractHash = source.suite.target.contractHash;
    suite.runtimeProfiles[0].configurationHash = `sha256:${'1'.repeat(64)}`;
    await fs.writeFile(join(suiteDirectory, 'suite.json'), `${JSON.stringify(suite, null, 2)}\n`);
    await expect(
      loadSuite(join(suiteDirectory, 'suite.json'), { suitesRoot: root }),
    ).rejects.toThrow('runtime profile canonical-default configurationHash mismatch');
  });
});
