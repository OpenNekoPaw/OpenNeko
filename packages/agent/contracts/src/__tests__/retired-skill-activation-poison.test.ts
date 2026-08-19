import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contracts from '../index';

const PACKAGE_ROOT = join(__dirname, '..', '..');

describe('retired Skill activation contract poison', () => {
  it('removes the retired activation and ToolSet public surface', () => {
    for (const exportName of [
      'buildAgentCapabilityActivationProgressMessage',
      'CORE_TOOLS',
      'DEFAULT_INJECTION_CONFIG',
    ]) {
      expect(contracts).not.toHaveProperty(exportName);
    }

    for (const deleted of [
      'src/agent-capability-activation.ts',
      'src/loading-tier.ts',
      'src/tool-category.ts',
      'src/tool-group.ts',
      'src/tool-injection.ts',
    ]) {
      expect(existsSync(join(PACKAGE_ROOT, deleted)), `${deleted} should not exist`).toBe(false);
    }
  });

  it('keeps the canonical domain capability lifecycle contract', () => {
    expect(contracts).toHaveProperty('isAgentCapabilityInvocationResult');
  });
});
