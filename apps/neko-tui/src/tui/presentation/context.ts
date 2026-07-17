import type { StrictMessageParameters, StrictTranslator, SupportedLocale } from '@neko/shared/i18n';

export type AgentTerminalTranslate<MessageKey extends string> = (
  key: MessageKey,
  params?: StrictMessageParameters,
) => string;

export interface AgentTerminalFormatters {
  readonly count: (value: number) => string;
  readonly dateTime: (value: Date | number) => string;
  readonly duration: (milliseconds: number) => string;
  readonly bytes: (value: number) => string;
}

export interface AgentTerminalPresentationContext<MessageKey extends string> {
  readonly uiLocale: SupportedLocale;
  readonly t: AgentTerminalTranslate<MessageKey>;
  readonly format: AgentTerminalFormatters;
}

export function createAgentTerminalPresentationContext<MessageKey extends string>(input: {
  readonly translator: StrictTranslator<MessageKey>;
  readonly formatters: AgentTerminalFormatters;
}): AgentTerminalPresentationContext<MessageKey> {
  return {
    uiLocale: input.translator.locale,
    t: input.translator.t,
    format: input.formatters,
  };
}
