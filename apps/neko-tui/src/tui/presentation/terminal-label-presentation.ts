import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalMessageKey } from './terminal-messages';

export interface TerminalMarkdownMessages {
  readonly fatalTitle: string;
  readonly syntheticColumn: (index: number) => string;
  readonly unresolved: (label: string) => string;
  readonly image: (alt: string) => string;
  readonly linkTarget: (target: string) => string;
  readonly unsafeControl: (control: string) => string;
  readonly unsupportedDestination: (target: string) => string;
  readonly tableGridBudgetExceeded: (cells: number) => string;
  readonly highlightLimitExceeded: string;
}

type Presentation = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export function createTerminalMarkdownMessages(
  presentation: Presentation,
): TerminalMarkdownMessages {
  return {
    fatalTitle: presentation.t('agent.terminal.markdown.fatalTitle'),
    syntheticColumn: (index) =>
      presentation.t('agent.terminal.markdown.syntheticColumn', { index }),
    unresolved: (label) => presentation.t('agent.terminal.markdown.unresolved', { label }),
    image: (alt) => presentation.t('agent.terminal.markdown.image', { alt }),
    linkTarget: (target) => presentation.t('agent.terminal.markdown.linkTarget', { target }),
    unsafeControl: (control) =>
      presentation.t('agent.terminal.markdown.unsafeControl', { control }),
    unsupportedDestination: (target) =>
      presentation.t('agent.terminal.markdown.unsupportedDestination', { target }),
    tableGridBudgetExceeded: (cells) =>
      presentation.t('agent.terminal.markdown.tableGridBudgetExceeded', { cells }),
    highlightLimitExceeded: presentation.t('agent.terminal.markdown.highlightLimitExceeded'),
  };
}

export function presentTaskStatus(value: string, presentation: Presentation): string {
  switch (value) {
    case 'pending':
    case 'running':
    case 'completed':
    case 'failed':
    case 'cancelled':
      return presentation.t(`agent.terminal.value.taskStatus.${value}`);
    default:
      return value;
  }
}

export function presentSessionMode(value: string, presentation: Presentation): string {
  switch (value) {
    case 'agent':
    case 'image':
    case 'video':
    case 'audio':
      return presentation.t(`agent.terminal.value.sessionMode.${value}`);
    default:
      return value;
  }
}

export function presentExecutionMode(value: string, presentation: Presentation): string {
  switch (value) {
    case 'plan':
    case 'ask':
    case 'auto':
      return presentation.t(`agent.terminal.value.executionMode.${value}`);
    default:
      return value;
  }
}

export function presentMediaCategory(value: string, presentation: Presentation): string {
  switch (value) {
    case 'image':
    case 'video':
    case 'audio':
    case 'sequence':
    case 'text':
    case 'document':
      return presentation.t(`agent.terminal.value.mediaCategory.${value}`);
    default:
      return value;
  }
}

export function presentReferenceSource(value: string, presentation: Presentation): string {
  switch (value) {
    case 'workspace file':
      return presentation.t('agent.terminal.value.referenceSource.workspaceFile');
    case 'asset-library':
      return presentation.t('agent.terminal.value.referenceSource.assetLibrary');
    case 'generated-assets':
      return presentation.t('agent.terminal.value.referenceSource.generatedAssets');
    case 'media-library':
      return presentation.t('agent.terminal.value.referenceSource.mediaLibrary');
    case 'entity-graph':
      return presentation.t('agent.terminal.value.referenceSource.entityGraph');
    case 'story':
    case 'canvas':
      return presentation.t(`agent.terminal.value.referenceSource.${value}`);
    default:
      return value;
  }
}

export function presentSuggestionKind(value: string, presentation: Presentation): string {
  switch (value) {
    case 'command':
    case 'skill':
    case 'file':
    case 'asset':
    case 'media':
    case 'entity':
    case 'character':
    case 'scene':
      return presentation.t(`agent.terminal.value.suggestionKind.${value}`);
    case 'canvas-node':
      return presentation.t('agent.terminal.value.suggestionKind.canvasNode');
    default:
      return value;
  }
}
