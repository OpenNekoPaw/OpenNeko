import {
  AGENT_ENTRY_MODES,
  type AgentDraftInteractionProjection,
  type AgentDomainBinding,
  type AgentEntryIntentProjection,
  type AgentEntryMode,
} from '@neko/agent-contracts';

export type HomeExperienceEntryDiagnosticKey =
  | 'chat.entryExperience.validation.bindingPending'
  | 'chat.entryExperience.validation.configurationRequired'
  | 'chat.entryExperience.validation.assistantBindingMismatch'
  | 'chat.entryExperience.validation.workspaceChooserUnavailable'
  | 'chat.entryExperience.validation.workspaceRequired'
  | 'chat.entryExperience.validation.workspaceBindingMismatch'
  | 'chat.entryExperience.validation.characterUnavailable'
  | 'chat.entryExperience.validation.characterRequired'
  | 'chat.entryExperience.validation.characterBindingMismatch'
  | 'chat.entryExperience.validation.worldUnavailable';

export interface HomeExperienceEntryOptionProjection {
  readonly mode: AgentEntryMode;
  readonly labelKey: string;
  readonly disabled: boolean;
  readonly descriptionKey?: HomeExperienceEntryDiagnosticKey;
}

export interface HomeExperienceEntryProjection {
  readonly mode: AgentEntryMode;
  readonly options: readonly HomeExperienceEntryOptionProjection[];
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly submissionBlockedReasonKey?: HomeExperienceEntryDiagnosticKey;
  readonly showWorkspaceControl: boolean;
  readonly showSkillSuggestions: boolean;
}

export interface HomeExperienceEntryProjectionInput {
  readonly mode: AgentEntryMode;
  readonly intent: AgentEntryIntentProjection;
  readonly draft: AgentDraftInteractionProjection;
  readonly workspaceTarget?: {
    readonly context: Extract<AgentDomainBinding, { readonly kind: 'workspace' }>;
    readonly target?: import('@neko/agent-contracts').AgentAuthoringTargetRef;
  };
  readonly workspaceChooserAvailable: boolean;
  readonly characterTargetsAvailable?: boolean;
  readonly characterLaunches?: readonly import('../components/ChatView/InputArea/types').SelectedCharacterLaunch[];
  readonly bindingPending: boolean;
  readonly configurationReady: boolean;
}

const OPTION_LABEL_KEYS: Record<AgentEntryMode, string> = {
  assistant: 'chat.entryExperience.mode.assistant',
  authoring: 'chat.entryExperience.mode.authoring',
  'character-dialogue': 'chat.entryExperience.mode.characterDialogue',
  'world-experience': 'chat.entryExperience.mode.worldExperience',
};

const TITLE_KEYS: Record<AgentEntryMode, string> = {
  assistant: 'chat.entryExperience.assistant.title',
  authoring: 'chat.entryExperience.authoring.title',
  'character-dialogue': 'chat.entryExperience.characterDialogue.title',
  'world-experience': 'chat.entryExperience.worldExperience.title',
};

const DESCRIPTION_KEYS: Record<AgentEntryMode, string> = {
  assistant: 'chat.entryExperience.assistant.description',
  authoring: 'chat.entryExperience.authoring.description',
  'character-dialogue': 'chat.entryExperience.characterDialogue.description',
  'world-experience': 'chat.entryExperience.worldExperience.description',
};

export function projectHomeExperienceEntry(
  input: HomeExperienceEntryProjectionInput,
): HomeExperienceEntryProjection {
  const submissionBlockedReasonKey = projectSubmissionBlockedReason(input);
  return {
    mode: input.mode,
    options: AGENT_ENTRY_MODES.map((mode) => ({
      mode,
      labelKey: OPTION_LABEL_KEYS[mode],
      disabled: false,
      ...(mode === 'world-experience'
        ? { descriptionKey: 'chat.entryExperience.validation.worldUnavailable' as const }
        : {}),
    })),
    titleKey: TITLE_KEYS[input.mode],
    descriptionKey: DESCRIPTION_KEYS[input.mode],
    ...(submissionBlockedReasonKey === undefined ? {} : { submissionBlockedReasonKey }),
    showWorkspaceControl: input.mode === 'authoring',
    showSkillSuggestions: input.mode === 'assistant',
  };
}

function projectSubmissionBlockedReason(
  input: HomeExperienceEntryProjectionInput,
): HomeExperienceEntryDiagnosticKey | undefined {
  if (input.bindingPending) return 'chat.entryExperience.validation.bindingPending';

  switch (input.mode) {
    case 'assistant':
      if (!isAssistantCompatibleDraft(input.draft)) {
        return 'chat.entryExperience.validation.assistantBindingMismatch';
      }
      return input.configurationReady
        ? undefined
        : 'chat.entryExperience.validation.configurationRequired';
    case 'authoring':
      if (!input.workspaceChooserAvailable) {
        return 'chat.entryExperience.validation.workspaceChooserUnavailable';
      }
      if (!input.workspaceTarget?.target) {
        return 'chat.entryExperience.validation.workspaceRequired';
      }
      if (!hasExactAuthoringReceipt(input.intent, input.workspaceTarget)) {
        return 'chat.entryExperience.validation.workspaceBindingMismatch';
      }
      return input.configurationReady
        ? undefined
        : 'chat.entryExperience.validation.configurationRequired';
    case 'character-dialogue':
      if (input.characterTargetsAvailable !== true) {
        return 'chat.entryExperience.validation.characterUnavailable';
      }
      if (!input.characterLaunches || input.characterLaunches.length === 0) {
        return 'chat.entryExperience.validation.characterRequired';
      }
      if (!hasExactCharacterDialogueReceipt(input.intent, input.characterLaunches)) {
        return 'chat.entryExperience.validation.characterBindingMismatch';
      }
      return input.configurationReady
        ? undefined
        : 'chat.entryExperience.validation.configurationRequired';
    case 'world-experience':
      return 'chat.entryExperience.validation.worldUnavailable';
  }
}

function hasExactCharacterDialogueReceipt(
  intent: AgentEntryIntentProjection,
  selections: NonNullable<HomeExperienceEntryProjectionInput['characterLaunches']>,
): boolean {
  const receipt = intent.targetReceipt;
  if (
    intent.mode !== 'character-dialogue' ||
    receipt?.mode !== 'character-dialogue' ||
    receipt.binding.kind !== 'character-dialogue'
  ) {
    return false;
  }
  const expectedParticipants = selections.map((selection) => ({
    characterProjectId: selection.characterProjectId,
    characterVersionId: selection.characterVersionId,
  }));
  return (
    receipt.binding.mode === 'companion' &&
    JSON.stringify(receipt.binding.participants) === JSON.stringify(expectedParticipants) &&
    !receipt.binding.participants.some((participant) => 'storyline' in participant)
  );
}

function isAssistantCompatibleDraft(draft: AgentDraftInteractionProjection): boolean {
  if (draft.binding.kind === 'unbound') return draft.bindingReceipt === null;
  return draft.binding.kind === 'assistant' && draft.bindingReceipt !== null;
}

function hasExactAuthoringReceipt(
  intent: AgentEntryIntentProjection,
  selection: NonNullable<HomeExperienceEntryProjectionInput['workspaceTarget']>,
): boolean {
  const receipt = intent.targetReceipt;
  return (
    intent.mode === 'authoring' &&
    receipt?.mode === 'authoring' &&
    receipt.binding.kind === 'authoring' &&
    receipt.binding.workspaceId === selection.context.workspaceId &&
    receipt.binding.workspaceGrantId === selection.context.workspaceGrantId &&
    JSON.stringify(receipt.binding.target) === JSON.stringify(selection.target)
  );
}
