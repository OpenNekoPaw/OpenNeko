import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const runCliEntrypoint = vi.fn();

vi.mock('./tui/cli', () => ({ runCliEntrypoint }));

describe('OpenNeko TUI canonical application entry', () => {
  it('invokes the app-owned terminal entry with the exact application argv', async () => {
    const { runNekoTuiApplication } = await import('./application');
    const argv = ['node', 'neko', '--version'];

    runNekoTuiApplication(argv);

    expect(runCliEntrypoint).toHaveBeenCalledOnce();
    expect(runCliEntrypoint).toHaveBeenCalledWith(argv);
  });

  it('keeps supported callers on the app executable and poisons old executable references', () => {
    const repoRoot = resolve(__dirname, '../../..');
    const rootPackage = readFileSync(resolve(repoRoot, 'package.json'), 'utf8');
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/agent-evaluation.yml'),
      'utf8',
    );
    const ablationPlan = readFileSync(
      resolve(repoRoot, 'scripts/agent-eval/ablation/plans/media-production-guidance.json'),
      'utf8',
    );
    const protocolSmoke = readFileSync(
      resolve(repoRoot, 'scripts/agent-eval/protocol-smoke.mjs'),
      'utf8',
    );
    const suiteRunner = readFileSync(
      resolve(repoRoot, 'scripts/agent-eval/runner/run-v2-case.mjs'),
      'utf8',
    );
    const callers = [rootPackage, workflow, ablationPlan, protocolSmoke, suiteRunner].join('\n');

    expect(callers).toContain('@neko/app-tui');
    expect(callers).toContain('apps/neko-tui/dist/main.js');
    expect(callers).not.toContain('packages/neko-agent/packages/cli-tui/dist/cli.js');
    expect(callers).not.toContain('./packages/neko-agent/neko');
    expect(callers).not.toMatch(/--filter["', ]+@neko\/cli/u);
    expect(callers).not.toContain('@neko/cli/terminal');
    expect(existsSync(resolve(repoRoot, 'packages/neko-agent/packages/cli-tui'))).toBe(false);
  });
});
