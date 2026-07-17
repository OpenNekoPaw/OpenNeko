import type { SlashCommandOption } from './SlashCommandMenu';

export type InputSuggestionTrigger = '/' | '$' | '@';

export interface InputSuggestionOption {
  readonly trigger: InputSuggestionTrigger;
  readonly name: string;
  readonly matchText?: string;
  readonly description?: string;
  readonly insertText?: string;
  readonly kind?: string;
}

export interface ActiveInputSuggestionMenu {
  readonly trigger: InputSuggestionTrigger;
  readonly filterText: string;
  readonly options: readonly InputSuggestionOption[];
}

export interface InputSuggestionSources {
  readonly commands: readonly SlashCommandOption[];
  readonly skills?: readonly InputSuggestionOption[];
  readonly references?: readonly InputSuggestionOption[];
}

export function deriveInputSuggestionMenu(
  value: string,
  sources: InputSuggestionSources,
): ActiveInputSuggestionMenu | null {
  const trigger = readBoundaryTrigger(value);
  if (!trigger) return null;

  const filterText = value.slice(1).toLowerCase();
  if (filterText.includes(' ')) return null;

  const options = getOptionsForTrigger(trigger, sources).filter((option) => {
    const haystack = (option.matchText ?? option.name).toLowerCase();
    return haystack.includes(filterText) || option.name.toLowerCase().startsWith(filterText);
  });

  return {
    trigger,
    filterText,
    options,
  };
}

export function selectInputSuggestion(option: InputSuggestionOption): string {
  return option.insertText ?? `${option.trigger}${option.name} `;
}

function slashCommandsToSuggestions(
  commands: readonly SlashCommandOption[],
): InputSuggestionOption[] {
  return commands.map((command) => ({
    trigger: '/',
    name: command.name,
    description: command.description,
    kind: 'command',
  }));
}

function readBoundaryTrigger(value: string): InputSuggestionTrigger | null {
  if (value.length === 0) return null;
  const first = value[0];
  if (first !== '/' && first !== '$' && first !== '@') return null;
  return first;
}

function getOptionsForTrigger(
  trigger: InputSuggestionTrigger,
  sources: InputSuggestionSources,
): readonly InputSuggestionOption[] {
  switch (trigger) {
    case '/':
      return slashCommandsToSuggestions(sources.commands);
    case '$':
      return sources.skills ?? [];
    case '@':
      return sources.references ?? [];
  }
}
