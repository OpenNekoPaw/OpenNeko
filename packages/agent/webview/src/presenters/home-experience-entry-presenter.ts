import type { AgentDraftInteractionProjection, AgentDomainBinding } from '@neko/agent-contracts';
import {
  AGENT_ENTRY_EXPERIENCE_MODES,
  type AgentEntryExperienceMode,
} from '../entry-experience-mode';

export type HomeExperienceEntryDiagnosticKey =
  | 'chat.entryExperience.validation.bindingPending'
  | 'chat.entryExperience.validation.configurationRequired'
  | 'chat.entryExperience.validation.assistantBindingMismatch'
  | 'chat.entryExperience.validation.workspaceChooserUnavailable'
  | 'chat.entryExperience.validation.workspaceRequired'
  | 'chat.entryExperience.validation.workspaceBindingMismatch'
  | 'chat.entryExperience.validation.characterUnavailable'
  | 'chat.entryExperience.validation.worldUnavailable';

export interface HomeExperienceEntryOptionProjection {
  readonly mode: AgentEntryExperienceMode;
  readonly labelKey: string;
}

export interface HomeExperienceEntryProjection {
  readonly mode: AgentEntryExperienceMode;
  readonly options: readonly HomeExperienceEntryOptionProjection[];
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly submissionBlockedReasonKey?: HomeExperienceEntryDiagnosticKey;
  readonly showWorkspaceControl: boolean;
  readonly showSkillSuggestions: boolean;
}

export interface HomeExperienceEntryProjectionInput {
  readonly mode: AgentEntryExperienceMode;
  readonly draft: AgentDraftInteractionProjection;
  readonly workspaceTarget?: {
    readonly context: Extract<AgentDomainBinding, { readonly kind: 'workspace' }>;
  };
  readonly workspaceChooserAvailable: boolean;
  readonly bindingPending: boolean;
  readonly configurationReady: boolean;
}

const OPTION_LABEL_KEYS: Record<AgentEntryExperienceMode, string> = {
  assistant: 'chat.entryExperience.mode.assistant',
  workspace: 'chat.entryExperience.mode.workspace',
  character: 'chat.entryExperience.mode.character',
  world: 'chat.entryExperience.mode.world',
};

const TITLE_KEYS: Record<AgentEntryExperienceMode, string> = {
  assistant: 'chat.entryExperience.assistant.title',
  workspace: 'chat.entryExperience.workspace.title',
  character: 'chat.entryExperience.character.title',
  world: 'chat.entryExperience.world.title',
};

const DESCRIPTION_KEYS: Record<AgentEntryExperienceMode, string> = {
  assistant: 'chat.entryExperience.assistant.description',
  workspace: 'chat.entryExperience.workspace.description',
  character: 'chat.entryExperience.character.description',
  world: 'chat.entryExperience.world.description',
};

export function projectHomeExperienceEntry(
  input: HomeExperienceEntryProjectionInput,
): HomeExperienceEntryProjection {
  const submissionBlockedReasonKey = projectSubmissionBlockedReason(input);
  return {
    mode: input.mode,
    options: AGENT_ENTRY_EXPERIENCE_MODES.map((mode) => ({
      mode,
      labelKey: OPTION_LABEL_KEYS[mode],
    })),
    titleKey: TITLE_KEYS[input.mode],
    descriptionKey: DESCRIPTION_KEYS[input.mode],
    ...(submissionBlockedReasonKey === undefined ? {} : { submissionBlockedReasonKey }),
    showWorkspaceControl: input.mode === 'workspace',
    showSkillSuggestions: input.mode === 'assistant' || input.mode === 'workspace',
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
    case 'workspace':
      if (!input.workspaceChooserAvailable) {
        return 'chat.entryExperience.validation.workspaceChooserUnavailable';
      }
      if (!input.workspaceTarget) return 'chat.entryExperience.validation.workspaceRequired';
      if (!hasExactWorkspaceBinding(input.draft, input.workspaceTarget.context)) {
        return 'chat.entryExperience.validation.workspaceBindingMismatch';
      }
      return input.configurationReady
        ? undefined
        : 'chat.entryExperience.validation.configurationRequired';
    case 'character':
      return 'chat.entryExperience.validation.characterUnavailable';
    case 'world':
      return 'chat.entryExperience.validation.worldUnavailable';
  }
}

function isAssistantCompatibleDraft(draft: AgentDraftInteractionProjection): boolean {
  if (draft.binding.kind === 'unbound') return draft.bindingReceipt === null;
  return draft.binding.kind === 'assistant' && draft.bindingReceipt !== null;
}

function hasExactWorkspaceBinding(
  draft: AgentDraftInteractionProjection,
  target: Extract<AgentDomainBinding, { readonly kind: 'workspace' }>,
): boolean {
  return (
    draft.binding.kind === 'workspace' &&
    draft.binding.workspaceId === target.workspaceId &&
    draft.binding.workspaceGrantId === target.workspaceGrantId &&
    draft.bindingReceipt !== null
  );
}
