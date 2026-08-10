import { describe, expect, it } from 'vitest';
import type { AgentDraftInteractionProjection } from '@neko/agent-contracts';
import { projectHomeExperienceEntry } from '../home-experience-entry-presenter';

describe('home experience entry presenter', () => {
  it('allows Assistant without a Workspace target', () => {
    const projection = projectHomeExperienceEntry({
      mode: 'assistant',
      draft: draft({ kind: 'unbound' }),
      workspaceChooserAvailable: true,
      bindingPending: false,
      configurationReady: true,
    });

    expect(projection).toMatchObject({
      mode: 'assistant',
      showWorkspaceControl: false,
      showSkillSuggestions: true,
    });
    expect(projection).not.toHaveProperty('submissionBlockedReasonKey');
  });

  it('requires the selected Workspace and exact binding receipt', () => {
    const target = {
      context: {
        kind: 'workspace' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'grant-1',
      },
    };

    expect(
      projectHomeExperienceEntry({
        mode: 'workspace',
        draft: draft({ kind: 'unbound' }),
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).submissionBlockedReasonKey,
    ).toBe('chat.entryExperience.validation.workspaceRequired');
    expect(
      projectHomeExperienceEntry({
        mode: 'workspace',
        draft: draft(target.context, false),
        workspaceTarget: target,
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).submissionBlockedReasonKey,
    ).toBe('chat.entryExperience.validation.workspaceBindingMismatch');
    expect(
      projectHomeExperienceEntry({
        mode: 'workspace',
        draft: draft(target.context),
        workspaceTarget: target,
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).submissionBlockedReasonKey,
    ).toBeUndefined();
  });

  it('does not accept a stale Workspace binding for Assistant', () => {
    expect(
      projectHomeExperienceEntry({
        mode: 'assistant',
        draft: draft({
          kind: 'workspace',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        }),
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).submissionBlockedReasonKey,
    ).toBe('chat.entryExperience.validation.assistantBindingMismatch');
  });

  it('keeps Character and World owner-qualified unavailable', () => {
    for (const mode of ['character', 'world'] as const) {
      const projection = projectHomeExperienceEntry({
        mode,
        draft: draft({ kind: 'unbound' }),
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      });

      expect(projection.submissionBlockedReasonKey).toBe(
        `chat.entryExperience.validation.${mode}Unavailable`,
      );
      expect(projection.showSkillSuggestions).toBe(false);
    }
    expect(
      projectHomeExperienceEntry({
        mode: 'assistant',
        draft: draft({ kind: 'unbound' }),
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).options.find((option) => option.mode === 'world'),
    ).toMatchObject({ disabled: true });
  });
});

function draft(
  binding: AgentDraftInteractionProjection['binding'],
  withReceipt = binding.kind !== 'unbound',
): AgentDraftInteractionProjection {
  return {
    phase: 'draft',
    draftId: 'draft-1',
    binding,
    bindingReceipt:
      binding.kind === 'unbound' || !withReceipt
        ? null
        : {
            bindingReceiptId: 'receipt-1',
            draftId: 'draft-1',
            connectionId: 'connection-1',
            binding,
          },
  };
}
