import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Automation Node architecture boundaries', () => {
  it('does not import Electron, React, Webview or application-root implementations', async () => {
    const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8');
    for (const pattern of [
      /from\s+['"]electron(?:\/|['"])/u,
      /from\s+['"]react(?:\/|['"])/u,
      /from\s+['"]@neko\/.*-webview(?:\/|['"])/u,
      /from\s+['"].*apps\/neko-desktop/u,
    ]) {
      expect(source, `Automation Node contains forbidden dependency ${pattern}`).not.toMatch(
        pattern,
      );
    }
  });
});
