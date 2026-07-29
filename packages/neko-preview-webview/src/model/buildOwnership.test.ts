import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const webviewRoot = resolve(__dirname, '../..');
const nonModelEntries = ['audio', 'video', 'pdf', 'cbz', 'epub', 'docx'] as const;

describe('3D reference build ownership', () => {
  it('keeps the model entry and document title owned by 3D Reference', () => {
    const html = readFileSync(resolve(webviewRoot, 'model.html'), 'utf8');

    expect(html).toContain('<title>3D Reference</title>');
    expect(html).toContain('src="/src/model/main.tsx"');
  });

  it.each(nonModelEntries)('does not load the model entry from %s', (entry) => {
    const html = readFileSync(resolve(webviewRoot, `${entry}.html`), 'utf8');

    expect(html).toContain(`src="/src/${entry}/main.tsx"`);
    expect(html).not.toContain('/src/model/');
    expect(html).not.toContain('model.js');
  });
});
