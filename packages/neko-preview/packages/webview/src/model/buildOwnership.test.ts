import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const webviewRoot = new URL('../../', import.meta.url);
const nonModelEntries = ['audio', 'video', 'pdf', 'cbz', 'epub', 'docx'] as const;

describe('3D reference build ownership', () => {
  it('keeps the model entry and document title owned by 3D Reference', () => {
    const html = readFileSync(new URL('model.html', webviewRoot), 'utf8');

    expect(html).toContain('<title>3D Reference</title>');
    expect(html).toContain('src="/src/model/main.tsx"');
  });

  it.each(nonModelEntries)('does not load the model entry from %s', (entry) => {
    const html = readFileSync(new URL(`${entry}.html`, webviewRoot), 'utf8');

    expect(html).toContain(`src="/src/${entry}/main.tsx"`);
    expect(html).not.toContain('/src/model/');
    expect(html).not.toContain('model.js');
  });
});
