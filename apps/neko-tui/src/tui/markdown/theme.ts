import type { ThemeTokens } from '../types/theme';
import type { TerminalCapabilities } from '../utils/terminal';
import type {
  MarkdownSemanticRole,
  ResolvedTerminalStyle,
  SyntaxTokenRole,
  TerminalStyleRef,
} from './contracts';

export interface TerminalMarkdownThemeResolver {
  resolve(style: TerminalStyleRef | undefined): ResolvedTerminalStyle;
}

export function createTerminalMarkdownThemeResolver(
  theme: ThemeTokens,
  capabilities: TerminalCapabilities,
): TerminalMarkdownThemeResolver {
  return {
    resolve(style): ResolvedTerminalStyle {
      if (style === undefined) return {};
      const foreground = style.syntaxRole
        ? resolveSyntaxColor(theme, style.syntaxRole)
        : style.markdownRole
          ? resolveMarkdownColor(theme, style.markdownRole)
          : undefined;
      return {
        ...style.attributes,
        foreground: capabilities.supportsColor ? foreground : undefined,
        // Deliberately never project syntax theme backgrounds. The terminal owns its background.
        background: undefined,
      };
    },
  };
}

function resolveMarkdownColor(
  theme: ThemeTokens,
  role: MarkdownSemanticRole,
): ResolvedTerminalStyle['foreground'] {
  return theme.markdown[role];
}

function resolveSyntaxColor(
  theme: ThemeTokens,
  role: SyntaxTokenRole,
): ResolvedTerminalStyle['foreground'] {
  return theme.syntax[role];
}
