import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('Desktop window presentation', () => {
  it('keeps macOS window edges neutral without a directional native shadow', () => {
    expect(mainSource).toMatch(
      /process\.platform === 'darwin'[\s\S]*?hasShadow\s*:\s*false[\s\S]*?titleBarStyle\s*:\s*'hiddenInset'/u,
    );
  });
});
