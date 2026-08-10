import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('shared floating toolbar surface hierarchy', () => {
  const source = readFileSync(resolve(__dirname, 'tailwind-preset.ts'), 'utf8');

  it('keeps the mode group transparent and uses a neutral active marker', () => {
    expect(source).toMatch(
      /'\.neko-toolbar-mode-group':\s*\{[^}]*background:\s*'transparent'[^}]*'box-shadow':\s*'none'/s,
    );
    expect(source).toMatch(
      /active::after[\s\S]*?border:\s*'1px solid var\(--neko-toolbar-border\)'[\s\S]*?background:\s*'var\(--neko-toolbar-hover\)'[\s\S]*?'box-shadow':\s*'none'/,
    );
  });
});
