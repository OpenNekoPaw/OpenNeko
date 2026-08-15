import { describe, expect, it } from 'vitest';
import type {
  AgentAuthoringBinding,
  AgentDraftInteractionProjection,
  AgentEntryIntentProjection,
  AgentEntryMode,
} from '@neko/agent-contracts';
import { projectHomeExperienceEntry } from '../home-experience-entry-presenter';

describe('home experience entry presenter', () => {
  it('allows Assistant without a Workspace target', () => {
    const projection = projectHomeExperienceEntry({
      mode: 'assistant',
      intent: entryIntent('assistant'),
      draft: draft({ kind: 'unbound' }),
      workspaceChooserAvailable: true,
      bindingPending: false,
      configurationReady: true,
    });

    expect(projection).toMatchObject({
      mode: 'assistant',
      options: [
        { mode: 'assistant', disabled: false },
        { mode: 'authoring', disabled: false },
      ],
      showWorkspaceControl: false,
      showSkillSuggestions: true,
    });
    expect(projection).not.toHaveProperty('submissionBlockedReasonKey');
  });

  it('requires Authoring to select a Workspace and exact binding receipt', () => {
    const target = {
      context: {
        kind: 'workspace' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'grant-1',
      },
      target: { kind: 'content-document' as const, documentId: 'documents/story.md' },
      authority: { kind: 'project' as const, projectId: 'project-1' },
    };

    expect(
      projectHomeExperienceEntry({
        mode: 'authoring',
        intent: entryIntent('authoring'),
        draft: draft(target.context),
        workspaceTarget: { context: target.context },
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).submissionBlockedReasonKey,
    ).toBe('chat.entryExperience.validation.workspaceRequired');
    expect(
      projectHomeExperienceEntry({
        mode: 'authoring',
        intent: entryIntent('authoring'),
        draft: draft({ kind: 'unbound' }),
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).submissionBlockedReasonKey,
    ).toBe('chat.entryExperience.validation.workspaceRequired');
    expect(
      projectHomeExperienceEntry({
        mode: 'authoring',
        intent: entryIntent('authoring'),
        draft: draft(target.context, false),
        workspaceTarget: target,
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).submissionBlockedReasonKey,
    ).toBe('chat.entryExperience.validation.workspaceBindingMismatch');
    expect(
      projectHomeExperienceEntry({
        mode: 'authoring',
        intent: entryIntent('authoring', {
          kind: 'authoring',
          workspaceId: target.context.workspaceId,
          workspaceGrantId: target.context.workspaceGrantId,
          authority: target.authority,
          target: target.target,
        }),
        draft: draft(target.context),
        workspaceTarget: target,
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).submissionBlockedReasonKey,
    ).toBeUndefined();

    const projectContext = {
      context: target.context,
      authority: target.authority,
    };
    expect(
      projectHomeExperienceEntry({
        mode: 'authoring',
        intent: entryIntent('authoring', {
          kind: 'authoring',
          workspaceId: target.context.workspaceId,
          workspaceGrantId: target.context.workspaceGrantId,
          authority: target.authority,
          target: null,
        }),
        draft: draft(target.context),
        workspaceTarget: projectContext,
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
        intent: entryIntent('assistant'),
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

  it('allows Character Dialogue only with the exact selected version receipt', () => {
    const characterLaunches = [
      {
        globalCharacterId: 'character-project-a',
        characterVersionId: 'character-version-a',
        label: 'A',
      },
    ];
    const intent: AgentEntryIntentProjection = {
      mode: 'character-dialogue',
      targetReceipt: {
        targetReceiptId: 'target-receipt-character',
        draftId: 'draft-1',
        connectionId: 'connection-1',
        mode: 'character-dialogue',
        binding: {
          kind: 'character-dialogue',
          mode: 'companion',
          participants: [
            {
              globalCharacterId: 'character-project-a',
              characterVersionId: 'character-version-a',
            },
          ],
        },
      },
    };

    expect(
      projectHomeExperienceEntry({
        mode: 'character-dialogue',
        intent,
        draft: draft({ kind: 'unbound' }),
        characterTargetsAvailable: true,
        characterLaunches,
        characterConversationMode: 'companion',
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).submissionBlockedReasonKey,
    ).toBeUndefined();
    expect(
      projectHomeExperienceEntry({
        mode: 'character-dialogue',
        intent,
        draft: draft({ kind: 'unbound' }),
        characterTargetsAvailable: true,
        characterLaunches: [{ ...characterLaunches[0]!, characterVersionId: 'stale-version' }],
        characterConversationMode: 'companion',
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).submissionBlockedReasonKey,
    ).toBe('chat.entryExperience.validation.characterBindingMismatch');

    const narrativeIntent: AgentEntryIntentProjection = {
      ...intent,
      targetReceipt: {
        ...intent.targetReceipt!,
        binding: {
          kind: 'character-dialogue',
          mode: 'narrative',
          participants: [
            {
              globalCharacterId: 'character-project-a',
              characterVersionId: 'character-version-a',
            },
          ],
        },
      },
    };
    expect(
      projectHomeExperienceEntry({
        mode: 'character-dialogue',
        intent: narrativeIntent,
        draft: draft({ kind: 'unbound' }),
        characterTargetsAvailable: true,
        characterLaunches,
        characterConversationMode: 'narrative',
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).submissionBlockedReasonKey,
    ).toBeUndefined();
    expect(
      projectHomeExperienceEntry({
        mode: 'character-dialogue',
        intent: narrativeIntent,
        draft: draft({ kind: 'unbound' }),
        characterTargetsAvailable: true,
        characterLaunches,
        characterConversationMode: 'companion',
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).submissionBlockedReasonKey,
    ).toBe('chat.entryExperience.validation.characterBindingMismatch');
  });

  it('keeps Character Dialogue and World Experience owner-qualified unavailable', () => {
    for (const mode of ['character-dialogue', 'world-experience'] as const) {
      const projection = projectHomeExperienceEntry({
        mode,
        intent: entryIntent(mode),
        draft: draft({ kind: 'unbound' }),
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      });

      expect(projection.submissionBlockedReasonKey).toBe(
        mode === 'character-dialogue'
          ? 'chat.entryExperience.validation.characterUnavailable'
          : 'chat.entryExperience.validation.worldUnavailable',
      );
      expect(projection.showSkillSuggestions).toBe(false);
    }
    expect(
      projectHomeExperienceEntry({
        mode: 'assistant',
        intent: entryIntent('assistant'),
        draft: draft({ kind: 'unbound' }),
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).options.map((option) => option.mode),
    ).toEqual(['assistant', 'authoring']);
  });

  it('allows World Experience only for the exact World and Character combination', () => {
    const worldLaunch = {
      globalWorldId: 'global-world-a',
      worldVersionId: 'world-version-a',
      label: 'World A',
      versionLabel: 'v1',
    };
    const characterLaunches = [
      {
        globalCharacterId: 'character-a',
        characterVersionId: 'character-version-a',
        label: 'Character A',
      },
    ];
    const intent: AgentEntryIntentProjection = {
      mode: 'world-experience',
      targetReceipt: {
        targetReceiptId: 'target-receipt-world',
        draftId: 'draft-1',
        connectionId: 'connection-1',
        mode: 'world-experience',
        binding: {
          kind: 'world-experience',
          globalWorldId: worldLaunch.globalWorldId,
          worldVersionId: worldLaunch.worldVersionId,
          participants: [
            {
              globalCharacterId: characterLaunches[0]!.globalCharacterId,
              characterVersionId: characterLaunches[0]!.characterVersionId,
            },
          ],
          launch: { kind: 'new' },
        },
      },
    };

    expect(
      projectHomeExperienceEntry({
        mode: 'world-experience',
        intent,
        draft: draft({ kind: 'unbound' }),
        characterLaunches,
        worldLaunch,
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).submissionBlockedReasonKey,
    ).toBeUndefined();
    expect(
      projectHomeExperienceEntry({
        mode: 'world-experience',
        intent,
        draft: draft({ kind: 'unbound' }),
        characterLaunches: [
          { ...characterLaunches[0]!, characterVersionId: 'character-version-other' },
        ],
        worldLaunch,
        workspaceChooserAvailable: true,
        bindingPending: false,
        configurationReady: true,
      }).submissionBlockedReasonKey,
    ).toBe('chat.entryExperience.validation.worldUnavailable');
  });
});

function entryIntent(
  mode: AgentEntryMode,
  binding?: AgentAuthoringBinding,
): AgentEntryIntentProjection {
  return {
    mode,
    targetReceipt: binding
      ? {
          targetReceiptId: 'target-receipt-1',
          draftId: 'draft-1',
          connectionId: 'connection-1',
          mode: 'authoring',
          binding,
        }
      : null,
  };
}

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
