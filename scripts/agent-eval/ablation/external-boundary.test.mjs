import * as fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(ROOT, '../../..');

describe('ablation Evaluation ownership boundary', () => {
  it('does not create an Agent runtime experiment or direct session owner', async () => {
    const files = (await fs.readdir(ROOT))
      .filter((file) => file.endsWith('.mjs') && !file.endsWith('.test.mjs'))
      .sort();
    const source = (
      await Promise.all(files.map((file) => fs.readFile(join(ROOT, file), 'utf8')))
    ).join('\n');
    expect(source).toContain("from '../runner/run-case.mjs'");
    expect(source).not.toMatch(/from ['"]@neko\/agent/u);
    expect(source).not.toMatch(/\bnew\s+AgentSession\b/u);
    expect(source).not.toContain('ExperimentRunner');
    expect(source).not.toContain('applyAblationToggles');
    expect(source).not.toContain('__ablation');
    expect(source).not.toMatch(/create(?:Standard|Group|Parameter)AblationSuite/u);
  });

  it('poisons removed Agent, TUI, and CLI experiment surfaces', async () => {
    await expect(
      fs.access(join(REPO_ROOT, 'packages/agent/runtime/src/experiment')),
    ).rejects.toThrow();

    const agentRoot = await fs.readFile(
      join(REPO_ROOT, 'packages/agent/runtime/src/index.ts'),
      'utf8',
    );
    expect(agentRoot).not.toMatch(/from ['"]\.\/experiment/u);
    expect(agentRoot).not.toContain('ExperimentRunner');

    await expect(fs.access(join(REPO_ROOT, 'apps/neko-tui/package.json'))).rejects.toThrow();
    await expect(
      fs.access(join(REPO_ROOT, 'packages/neko-agent/packages/cli-tui')),
    ).rejects.toThrow();
  });
});
