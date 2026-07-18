import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webviewRoot = resolve(__dirname, '../../../webview');

describe('model webview build ownership', () => {
  it('owns an independent Vite entry', () => {
    const config = readFileSync(resolve(webviewRoot, 'vite.config.ts'), 'utf8');
    expect(config).toContain("model: path.resolve(__dirname, 'model.html')");
  });

  it.each(['video', 'audio', 'pdf', 'cbz', 'epub', 'docx'])(
    'keeps Three runtime imports out of the %s entry',
    (entry) => {
      const source = readFileSync(resolve(webviewRoot, 'src', entry, 'main.tsx'), 'utf8');
      expect(source).not.toMatch(/from ['"]three(?:\/|['"])/);
      expect(source).not.toContain('/model/');
    },
  );
});
