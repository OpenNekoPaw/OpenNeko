import { describe, expect, it, vi } from 'vitest';
import { main, parseArgs, resolvePlanFile } from './run.mjs';

function output() {
  let value = '';
  return {
    write(chunk) {
      value += chunk;
    },
    read() {
      return value;
    },
  };
}

describe('external ablation command', () => {
  it('validates both committed pilot plans without building or starting a TUI', async () => {
    for (const plan of ['thinking-budget', 'media-production-guidance']) {
      const stdout = output();
      const stderr = output();
      const exitCode = await main(['--plan', plan, '--dry-run'], {
        cwd: () => process.cwd(),
        env: {},
        stdout,
        stderr,
      });
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout.read())).toMatchObject({
        ok: true,
        dryRun: true,
      });
      expect(stderr.read()).toBe('');
    }
  });

  it('dispatches real execution by plan mode and preserves outcome exit codes', async () => {
    const stdout = output();
    const runConfiguration = vi.fn(async () => ({ outcome: 'non-comparable' }));
    const exitCode = await main(['--plan', 'thinking-budget'], {
      cwd: () => process.cwd(),
      env: {},
      stdout,
      stderr: output(),
      runConfiguration,
    });
    expect(exitCode).toBe(1);
    expect(runConfiguration).toHaveBeenCalledOnce();
  });

  it('rejects missing, unknown, and repository-escaping plan arguments', () => {
    expect(() => parseArgs([])).toThrow('--plan is required');
    expect(() => parseArgs(['--unknown'])).toThrow('unknown ablation argument');
    expect(() => resolvePlanFile('../outside.json', process.cwd())).toThrow(
      'escapes the repository',
    );
  });
});
