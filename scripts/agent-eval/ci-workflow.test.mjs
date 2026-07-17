import * as fs from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

describe('Agent Evaluation CI trust boundary', () => {
  it('keeps default PR CI key-free and trusted secrets outside fork-triggered events', async () => {
    const defaultCiText = await fs.readFile('.github/workflows/ci.yml', 'utf8');
    const functionalText = await fs.readFile('.github/workflows/agent-evaluation.yml', 'utf8');
    const runnerText = await fs.readFile('scripts/agent-eval/ci-run.mjs', 'utf8');
    const functional = parse(functionalText);
    expect(defaultCiText).not.toContain('secrets.');
    expect(functional.on).not.toHaveProperty('pull_request');
    expect(functional.on).not.toHaveProperty('pull_request_target');
    expect(functional.on).toHaveProperty('push');
    expect(functional.on).toHaveProperty('schedule');
    expect(functionalText).toContain('secrets.NEKO_AGENT_EVAL_API_KEY');
    expect(runnerText).toContain('infrastructure-blocked');
    expect(functionalText).not.toContain('mock');
  });
});
