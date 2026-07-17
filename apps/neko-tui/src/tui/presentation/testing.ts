import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import { createStrictTranslator, type SupportedLocale } from '@neko/shared/i18n';
import { createAgentTerminalPresentationContext } from './context';
import { createAgentTerminalFormatters } from './formatters';
import { createTerminalMarkdownMessages } from './terminal-label-presentation';
import { CLI_TERMINAL_MESSAGE_SOURCE } from './terminal-messages';

export function createTestAgentTerminalPresentation(locale: SupportedLocale = 'en') {
  return createAgentTerminalPresentationContext({
    translator: createStrictTranslator(locale, [
      AGENT_COMMAND_MESSAGE_SOURCE,
      CLI_TERMINAL_MESSAGE_SOURCE,
    ] as const),
    formatters: createAgentTerminalFormatters({ locale, timeZone: 'UTC' }),
  });
}

export function createTestTerminalMarkdownMessages(locale: SupportedLocale = 'en') {
  return createTerminalMarkdownMessages(createTestAgentTerminalPresentation(locale));
}

export function createTestAgentTerminalInvocationContext(locale: SupportedLocale = 'en') {
  return Object.freeze({
    uiLocale: locale,
    promptLocale: locale,
    presentation: createTestAgentTerminalPresentation(locale),
    userConfigPath: '/test/.neko/config.toml',
  });
}
