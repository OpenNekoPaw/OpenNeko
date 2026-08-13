import { describe, expect, it } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateDesktopFunctionalScenario } from '../../desktop-functional/scenario-contract.mjs';
import {
  createDesktopAgentEvaluationScenario,
  readAuthorizedConfiguration,
  validateAuthorizedUserConfiguration,
  waitForStableDesktopAgentRenderer,
} from './scenario.mjs';

describe('Desktop Agent declarative scenario adapter', () => {
  it('creates a package-owned functional scenario for an ordinary case id', () => {
    const scenario = createDesktopAgentEvaluationScenario(executionCase(), authorization());

    expect(validateDesktopFunctionalScenario(scenario)).toBe(scenario);
    expect(scenario).toMatchObject({
      id: 'agent-eval-ordinary-new-case',
      owner: '@neko/agent-runtime',
    });
  });

  it('does not own assertion evaluation or case-specific outcome branches', () => {
    const input = executionCase();
    input.assertions = [
      {
        id: 'process',
        kind: 'process-order',
        events: [],
        evidenceRef: 'facts',
      },
    ];

    expect(
      validateDesktopFunctionalScenario(
        createDesktopAgentEvaluationScenario(input, authorization()),
      ),
    ).toMatchObject({ id: 'agent-eval-ordinary-new-case', owner: '@neko/agent-runtime' });
  });

  it('validates and preserves the authorized user TOML without compiling it', () => {
    const source = `default_provider = "provider-1"
default_model = "model-1"

[[providers]]
id = "provider-1"

[[models]]
id = "model-1"
provider_id = "provider-1"
`;
    const validated = validateAuthorizedUserConfiguration(source, authorization());

    expect(validated).toBe(source);
    expect(() =>
      validateAuthorizedUserConfiguration('default_provider =', authorization()),
    ).toThrow('TOML is invalid');
    expect(() =>
      validateAuthorizedUserConfiguration('default_provider = "provider-1"', authorization()),
    ).toThrow('does not declare the approved provider/model identity');
  });

  it('accepts a readable user configuration without requiring mode 0600', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neko-agent-eval-config-'));
    const configurationFile = join(root, 'config.toml');
    const source = `default_provider = "provider-1"
default_model = "model-1"
    `;
    try {
      await writeFile(configurationFile, source, 'utf8');
      await chmod(configurationFile, 0o644);

      await expect(
        readAuthorizedConfiguration({ ...authorization(), configurationFile }),
      ).resolves.toBe(source);
      await expect(readFile(configurationFile, 'utf8')).resolves.toBe(source);
    } finally {
      await rm(root, { recursive: true });
    }
  });

  it('projects a declared fixture Media Library outside the copied Workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neko-agent-eval-media-library-'));
    const repositoryRoot = join(root, 'repository');
    const fixtureHome = join(root, 'fixture-home');
    const fixtureRoot = join(
      repositoryRoot,
      'scripts',
      'agent-eval',
      'shared-fixtures',
      'media-library-workspace',
    );
    const configurationFile = join(root, 'config.toml');
    const config = `default_provider = "provider-1"
default_model = "model-1"

[[providers]]
id = "provider-1"

[[models]]
id = "model-1"
provider_id = "provider-1"
`;
    try {
      await mkdir(join(fixtureRoot, 'media-source'), { recursive: true });
      await mkdir(fixtureHome, { recursive: true });
      await writeFile(join(fixtureRoot, 'media-source', 'library-image.svg'), '<svg />', 'utf8');
      await writeFile(configurationFile, config, 'utf8');
      const input = executionCase();
      input.fixture = {
        root: 'shared-fixtures/media-library-workspace',
        mediaLibrary: {
          libraryName: 'workspace',
          source: 'media-source',
          contentLabel: 'library-image.svg',
        },
      };
      const scenario = createDesktopAgentEvaluationScenario(input, {
        ...authorization(),
        configurationFile,
      });

      const prepared = await scenario.prepare({ fixtureHome, repositoryRoot });

      await expect(
        readFile(join(fixtureHome, 'global-media', 'workspace', 'library-image.svg'), 'utf8'),
      ).resolves.toBe('<svg />');
      await expect(stat(join(prepared.workspacePath, 'media-source'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(readFile(join(fixtureHome, '.neko', 'config.toml'), 'utf8')).resolves.toBe(
        config,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('restarts the stability window when the development Renderer reloads', async () => {
    const origins = [100, 100, 200, 200, 200];
    let clock = 0;

    await expect(
      waitForStableDesktopAgentRenderer({
        evaluate: async () => origins.shift() ?? 200,
        waitForDesktopBridge: async () => undefined,
        waitForSelector: async () => undefined,
        stabilityMs: 200,
        timeoutMs: 2_000,
        now: () => clock,
        delay: async (duration) => {
          clock += duration;
        },
      }),
    ).resolves.toBeUndefined();
    expect(clock).toBe(400);
  });
});

function executionCase() {
  return {
    schema: 'neko.agent-eval.execution-case',
    caseId: 'ordinary-new-case',
    fixture: { root: 'shared-fixtures/empty-workspace' },
    steps: [
      { id: 'submit', kind: 'submit', prompt: 'hello' },
      { id: 'idle', kind: 'wait-for-idle', timeoutMs: 1000 },
    ],
    assertions: [{ id: 'answer', kind: 'final-answer', mode: 'non-empty', evidenceRef: 'facts' }],
    artifactChecks: [],
    budget: { timeoutMs: 1000, repetitions: 1 },
    modelProfiles: [],
  };
}

function authorization() {
  return {
    providerId: 'provider-1',
    modelId: 'model-1',
    configurationFile: '/fixture/config.toml',
    costApproved: true,
  };
}
