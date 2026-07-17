/**
 * Canvas generation ownership contract tests.
 *
 * Workflow execution is scoped by its explicit Canvas/Agent invocation path.
 * Canvas must not maintain a module-global scheduler registry or pause every
 * document queue through an unscoped cross-extension command.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const schedulerSource = readFileSync(
  join(__dirname, '../services/batchGenerationScheduler.ts'),
  'utf-8',
);
const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');

describe('Canvas generation ownership', () => {
  it('keeps queue state on the scheduler instance', () => {
    expect(schedulerSource).toContain('private queue: GenerationTask[] = []');
    expect(schedulerSource).toContain('private running = new Map<string, GenerationTask>()');
  });

  it('does not register schedulers in module-global mutable state', () => {
    expect(schedulerSource).not.toContain('liveSchedulers');
    expect(schedulerSource).not.toContain('broadcastQuietMode');
  });

  it('does not expose an unscoped global quiet mode', () => {
    expect(schedulerSource).not.toContain('quietReason');
    expect(schedulerSource).not.toContain('setQuietMode(');
    expect(extensionSource).not.toContain('neko.canvas.orchestrator.planStateChanged');
  });
});
