import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contracts from '../index';

const PACKAGE_ROOT = join(__dirname, '..', '..');

describe('retired Agent capability contract poison', () => {
  it('removes retired capability, Prompt, Plugin, Skill and Perception exports', () => {
    for (const exportName of [
      'buildAgentCapabilityActivationProgressMessage',
      'buildPluginSlashCommandId',
      'CORE_TOOLS',
      'createDomainRouter',
      'DEFAULT_INJECTION_CONFIG',
      'isAgentCapabilityInvocationResult',
      'isPerceptionTool',
      'localizePromptFragment',
      'SKILL_DIRECTORIES',
    ]) {
      expect(contracts).not.toHaveProperty(exportName);
    }

    for (const deleted of [
      'src/agent-capability-diagnostics.ts',
      'src/agent-capability-activation.ts',
      'src/agent-capability-lifecycle.ts',
      'src/agent-capability.ts',
      'src/capability.ts',
      'src/domain-routing.ts',
      'src/loading-tier.ts',
      'src/perception-tool.ts',
      'src/plugin-command-contract.ts',
      'src/plugin-slash-command.ts',
      'src/portable-skill.ts',
      'src/prompt-fragment.ts',
      'src/reference-contributor.ts',
      'src/resource-display-projection.ts',
      'src/skill.ts',
      'src/tool-category.ts',
      'src/tool-group.ts',
      'src/tool-injection.ts',
    ]) {
      expect(existsSync(join(PACKAGE_ROOT, deleted)), `${deleted} should not exist`).toBe(false);
    }
  });
});
