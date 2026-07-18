import { describe, expect, it } from 'vitest';
import { nekoDesignTokens } from './tokens';

const toolbarTokenNames = [
  '--neko-toolbar-background',
  '--neko-toolbar-border',
  '--neko-toolbar-foreground',
  '--neko-toolbar-foreground-secondary',
  '--neko-toolbar-hover',
  '--neko-toolbar-accent',
  '--neko-toolbar-accent-glow',
  '--neko-toolbar-divider',
  '--neko-toolbar-shadow',
] as const;

describe('Neko toolbar theme tokens', () => {
  it.each(['dark', 'light', 'highContrast'] as const)(
    'defines the complete shared floating-toolbar palette for %s themes',
    (themeKind) => {
      const tokens = nekoDesignTokens[themeKind];

      for (const tokenName of toolbarTokenNames) {
        expect(tokens).toHaveProperty(tokenName);
      }
    },
  );
});
