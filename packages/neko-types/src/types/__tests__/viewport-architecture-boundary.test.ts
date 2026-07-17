import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = new URL('../../../../../', import.meta.url).pathname;

describe('viewport architecture boundaries', () => {
  it('keeps shared viewport protocol contracts free of React, DOM, VSCode, and Node imports', () => {
    const files = [
      'packages/neko-types/src/types/viewport-protocol.ts',
      'packages/neko-types/src/types/live-compositor.ts',
    ];

    for (const file of files) {
      const source = readFileSync(join(repoRoot, file), 'utf8');

      expect(source).not.toMatch(/from ['"]react(?:\/|['"])/);
      expect(source).not.toMatch(/from ['"]react-dom(?:\/|['"])/);
      expect(source).not.toMatch(/from ['"]vscode['"]/);
      expect(source).not.toMatch(/from ['"]node:/);
      expect(source).not.toMatch(/\bwindow\./);
      expect(source).not.toMatch(/\bdocument\./);
    }
  });

  it('keeps viewport protocol free of generated engine and editor package dependencies', () => {
    const source = readFileSync(
      join(repoRoot, 'packages/neko-types/src/types/viewport-protocol.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/from ['"]\.\.\/generated\//);
    expect(source).not.toMatch(/from ['"]@neko\/neko-client['"]/);
    expect(source).not.toMatch(/from ['"]@neko\/ui['"]/);
    expect(source).not.toMatch(/from ['"]@neko-(?:model|puppet|live)\//);
  });
});
