import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('Desktop window presentation', () => {
  it('uses the native macOS window shadow around the hidden title bar frame', () => {
    expect(mainSource).toMatch(
      /process\.platform === 'darwin'[\s\S]*?hasShadow\s*:\s*true[\s\S]*?titleBarStyle\s*:\s*'hiddenInset'/u,
    );
  });
});
