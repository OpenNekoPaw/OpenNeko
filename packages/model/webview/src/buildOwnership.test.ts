import { access, readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const webviewRoot = new URL('../../../preview/webview/', import.meta.url);
const nonModelEntries = ['audio', 'video', 'pdf', 'cbz', 'epub', 'docx'] as const;

describe('Model Preview package ownership', () => {
  it('owns the only model implementation behind one public entry', async () => {
    const modelManifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      readonly name?: string;
      readonly exports?: Readonly<Record<string, string>>;
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    const domainManifest = JSON.parse(
      await readFile(new URL('../../domain/package.json', import.meta.url), 'utf8'),
    ) as { readonly name?: string };
    const previewManifest = JSON.parse(
      await readFile(new URL('../../../preview/webview/package.json', import.meta.url), 'utf8'),
    ) as { readonly dependencies?: Readonly<Record<string, string>> };
    const previewKernel = await readFile(
      new URL('../../../preview/webview/src/root/viewer-kernel.tsx', import.meta.url),
      'utf8',
    );

    expect(modelManifest.name).toBe('@neko/model-webview');
    expect(modelManifest.exports).toEqual({ './root': './src/root.tsx' });
    expect(modelManifest.dependencies?.['@neko/model-domain']).toBe('workspace:*');
    expect(modelManifest.dependencies?.['@neko/preview-domain']).toBeUndefined();
    expect(domainManifest.name).toBe('@neko/model-domain');
    expect(previewManifest.dependencies?.['@neko/model-domain']).toBe('workspace:*');
    expect(previewManifest.dependencies?.['@neko/model-webview']).toBe('workspace:*');
    expect(previewKernel).toContain("await import('@neko/model-webview/root')");
    expect(previewKernel).not.toContain('../model/');
    await expect(
      access(new URL('../../../preview/webview/src/model/', import.meta.url)),
    ).rejects.toThrow();
    await expect(
      access(new URL('../../../preview/webview/model.html', import.meta.url)),
    ).rejects.toThrow();
    await expect(access(new URL('../../package.json', import.meta.url))).rejects.toThrow();
    await expect(
      access(new URL('../../../preview/domain/src/model-preview.ts', import.meta.url)),
    ).rejects.toThrow();
    await expect(
      access(new URL('../../../preview/domain/src/three-reference.ts', import.meta.url)),
    ).rejects.toThrow();
  });

  it.each(nonModelEntries)(
    'does not load model code from the %s standalone entry',
    async (entry) => {
      const html = await readFile(new URL(`${entry}.html`, webviewRoot), 'utf8');

      expect(html).toContain(`src="/src/${entry}/main.tsx"`);
      expect(html).not.toContain('/src/model/');
      expect(html).not.toContain('model.js');
    },
  );
});
