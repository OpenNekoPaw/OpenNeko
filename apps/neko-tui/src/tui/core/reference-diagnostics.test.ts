import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import { createStrictTranslator } from '@neko/shared/i18n';
import { describe, expect, it } from 'vitest';
import { createAgentTerminalPresentationContext } from '../presentation/context';
import { createAgentTerminalFormatters } from '../presentation/formatters';
import { presentReferenceLoadingDiagnostics } from '../presentation/reference-presentation';
import { CLI_TERMINAL_MESSAGE_SOURCE } from '../presentation/terminal-messages';

function createPresentation(locale: 'en' | 'zh-cn') {
  return createAgentTerminalPresentationContext({
    translator: createStrictTranslator(locale, [
      AGENT_COMMAND_MESSAGE_SOURCE,
      CLI_TERMINAL_MESSAGE_SOURCE,
    ] as const),
    formatters: createAgentTerminalFormatters({ locale, timeZone: 'UTC' }),
  });
}

describe('presentReferenceLoadingDiagnostics', () => {
  it('returns undefined when there are no reference loading errors', () => {
    expect(presentReferenceLoadingDiagnostics([], createPresentation('en'))).toBeUndefined();
  });

  it.each([
    ['en', 'Reference error:', '- @missing.md: ENOENT: /external/原文'],
    ['zh-cn', '引用错误：', '- @missing.md：ENOENT: /external/原文'],
  ] as const)(
    'localizes owned prose while preserving external details for %s',
    (locale, header, row) => {
      expect(
        presentReferenceLoadingDiagnostics(
          [{ reference: '@missing.md', error: 'ENOENT: /external/原文' }],
          createPresentation(locale),
        ),
      ).toBe([header, row].join('\n'));
    },
  );
});
