import { TOOL_NAMES_SKILLS } from '@neko/agent-contracts';
import { describe, expect, it, vi } from 'vitest';

import { createSkillCreationCapabilityProvider } from './skill-creation-capability-provider';

describe('SkillCreationCapabilityProvider', () => {
  it.each(['personal', 'project'] as const)(
    'binds CreateSkill to the provider-owned %s destination without a target argument',
    async (source) => {
      const createSkill = vi.fn(async () => ({
        name: 'release-notes',
        source,
        fingerprint: 'sha256:fixture',
      }));
      const provider = createSkillCreationCapabilityProvider({ source, createSkill });
      const [tool] = provider.getTools({ hostContext: {} });

      expect(provider.id).toBe('neko-agent-skill-creation');
      expect(tool).toMatchObject({
        name: TOOL_NAMES_SKILLS.CREATE_SKILL,
        requiresConfirmation: true,
        safetyKind: 'confirmation-gated',
      });
      expect(tool?.requirements).toBeUndefined();
      expect(tool?.parameters.properties).not.toHaveProperty('target');
      await expect(
        tool?.execute({
          skill: {
            name: 'release-notes',
            description: 'Prepare release notes.',
            body: '# Release Notes',
          },
        }),
      ).resolves.toEqual({
        success: true,
        data: {
          name: 'release-notes',
          source,
          fingerprint: 'sha256:fixture',
        },
      });
      expect(createSkill).toHaveBeenCalledWith({
        request: {
          target: source,
          skill: {
            name: 'release-notes',
            description: 'Prepare release notes.',
            body: '# Release Notes',
          },
        },
      });
    },
  );

  it('rejects model-selected destinations and malformed definitions locally', async () => {
    const createSkill = vi.fn();
    const [tool] = createSkillCreationCapabilityProvider({
      source: 'personal',
      createSkill,
    }).getTools({ hostContext: {} });

    await expect(
      tool?.execute({
        target: 'project',
        skill: { name: 'unsafe', description: 'Unsafe.', body: '# Unsafe' },
      }),
    ).resolves.toMatchObject({ success: false, error: expect.stringContaining('target') });
    await expect(
      tool?.execute({ skill: { name: 'unsafe', description: '', body: '# Unsafe' } }),
    ).resolves.toMatchObject({ success: false, error: expect.stringContaining('description') });
    expect(createSkill).not.toHaveBeenCalled();
  });
});
