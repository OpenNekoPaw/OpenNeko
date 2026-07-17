import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main, parseArgs, selectSuiteIds } from './ci-run.mjs';
import { discoverSuites } from './suites/discovery.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })),
  );
});

describe('Agent Evaluation CI runner', () => {
  it('parses focused and bounded nightly repetition inputs', () => {
    expect(parseArgs(['--mode', 'focused', '--suite', 'skill.storyboard'])).toEqual({
      mode: 'focused',
      suiteId: 'skill.storyboard',
      repetitions: 1,
    });
    expect(parseArgs(['--mode', 'nightly', '--repetitions', '3'])).toEqual({
      mode: 'nightly',
      repetitions: 3,
    });
    expect(() => parseArgs(['--mode', 'nightly', '--repetitions', '21'])).toThrow('1..20');
  });

  it('maps changed Agent paths to existing focused suites and ignores unrelated docs', async () => {
    const suites = await discoverSuites();
    await expect(
      selectSuiteIds(
        { mode: 'focused', baseSha: 'base', headSha: 'head', repetitions: 1 },
        suites,
        {
          changedPaths: [
            'packages/neko-agent/packages/agent/src/session/agent-session.ts',
            'packages/neko-agent/packages/platform/src/config/config-manager.ts',
            'docs/README.md',
          ],
        },
      ),
    ).resolves.toEqual([
      'agent-runtime.model-binding',
      'agent-runtime.perception-routing',
      'agent-runtime.single-message-tui',
      'agent-runtime.workflow-controller',
    ]);
  });

  it('selects complete TUI runtime coverage for application entry and build changes', async () => {
    const suites = await discoverSuites();
    await expect(
      selectSuiteIds(
        { mode: 'focused', baseSha: 'base', headSha: 'head', repetitions: 1 },
        suites,
        {
          changedPaths: [
            'apps/neko-tui/src/main.ts',
            'apps/neko-tui/src/application.ts',
            'apps/neko-tui/package.json',
            'apps/neko-tui/tsup.config.ts',
          ],
        },
      ),
    ).resolves.toEqual(['agent-runtime.single-message-tui', 'agent-runtime.workflow-controller']);
  });

  it('fails visible when a relevant custom Skill has no indexed suite', async () => {
    const suites = await discoverSuites();
    await expect(
      selectSuiteIds(
        { mode: 'focused', baseSha: 'base', headSha: 'head', repetitions: 1 },
        suites,
        { changedPaths: ['.agents/skills/new-uncovered-skill/SKILL.md'] },
      ),
    ).rejects.toThrow('missing suite');
  });

  it('writes infrastructure-blocked evidence without spawning or mocking Agent', async () => {
    const reportRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-ci-'));
    temporaryDirectories.push(reportRoot);
    const stdout = capture();
    const code = await main(
      [
        '--mode',
        'focused',
        '--suite',
        'agent-runtime.single-message-tui',
        '--report-root',
        reportRoot,
      ],
      { env: {}, stdout, cwd: () => '/repo' },
    );
    expect(code).toBe(2);
    expect(JSON.parse(stdout.text())).toMatchObject({
      outcome: 'infrastructure-blocked',
      runs: [],
      diagnostic: expect.stringContaining('credential'),
    });
    await expect(fs.readFile(join(reportRoot, 'ci-summary.json'), 'utf8')).resolves.toContain(
      'infrastructure-blocked',
    );
  });
});

function capture() {
  let value = '';
  return {
    write(chunk) {
      value += chunk;
    },
    text() {
      return value;
    },
  };
}
