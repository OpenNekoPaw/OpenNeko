import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Preview Root architecture boundary', () => {
  it('delegates model presentation to the dedicated package without a second renderer', async () => {
    const rootSource = await readFile(new URL('./index.tsx', import.meta.url), 'utf8');
    const source = await readFile(new URL('./viewer-kernel.tsx', import.meta.url), 'utf8');
    const modelRoot = await readFile(
      new URL('../../../../model/webview/src/root.tsx', import.meta.url),
      'utf8',
    );
    const modelViewer = await readFile(
      new URL('../../../../model/webview/src/ModelViewer.tsx', import.meta.url),
      'utf8',
    );
    const sourceModelViewerHost = await readFile(
      new URL('../../../../model/webview/src/sourceModelViewerHost.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("await import('@neko/model-webview/root')");
    expect(source).not.toContain("from '@neko/model-webview/root'");
    expect(source).not.toContain('../model/');
    expect(source).not.toContain('createSourceModelViewerHost');
    expect(modelRoot).toContain("import { ModelViewer } from './ModelViewer'");
    expect(modelRoot).toContain(
      "import { createSourceModelViewerHost } from './sourceModelViewerHost'",
    );
    expect(source).not.toContain('vscodeModelViewerHost');
    expect(source).not.toContain('browserThreeRuntimeFactory');
    expect(source).not.toContain('<canvas');
    expect(modelViewer).not.toContain('getBrowserHostState');
    expect(modelViewer).not.toContain("window.addEventListener('message'");
    for (const [fileName, productionSource] of [
      ['root/index.tsx', rootSource],
      ['root/viewer-kernel.tsx', source],
      ['model/root.tsx', modelRoot],
      ['model/ModelViewer.tsx', modelViewer],
      ['model/sourceModelViewerHost.ts', sourceModelViewerHost],
    ] as const) {
      expectProductionRootSource(fileName, productionSource);
    }
  });

  it('consumes only opaque authorized media URLs without renderer-owned file transport', async () => {
    const rootSource = await readFile(new URL('./index.tsx', import.meta.url), 'utf8');
    const source = await readFile(new URL('./viewer-kernel.tsx', import.meta.url), 'utf8');
    const lightweightSource = await readFile(
      new URL('./lightweight-preview.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('src={descriptor.url}');
    expect(rootSource).toContain('snapshotStore.read(descriptor.descriptorId)');
    expect(rootSource).toContain('onSnapshotChange: updateSnapshot');
    expect(rootSource.match(/<PreviewPresentation/gu)).toHaveLength(2);
    expect(lightweightSource).toContain('parsePreviewMediaDescriptor(inputDescriptor)');
    for (const candidate of [rootSource, source, lightweightSource]) {
      expect(candidate).not.toContain('neko-media:');
      expect(candidate).not.toContain('file:');
      expect(candidate).not.toMatch(/\b(?:https?|blob):\/\//u);
      expect(candidate).not.toContain('URL.createObjectURL');
      expect(candidate).not.toContain('FileReader');
      expect(candidate).not.toContain('new Blob');
      expect(candidate).not.toContain('absolutePath');
      expect(candidate).not.toContain('workspacePath');
    }
    for (const viewerModule of [
      '../audio/AudioPlayer',
      '../video/VideoPlayer',
      '../pdf/PdfViewer',
      '../docx/DocxViewer',
      '../epub/EpubViewer',
      '../cbz/CbzViewer',
    ]) {
      expect(source).toContain(`await import('${viewerModule}')`);
      expect(source).not.toContain(`from '${viewerModule}'`);
    }
    expect(source).toContain("await import('@neko/model-webview/root')");
    expect(source).not.toContain("from '@neko/model-webview/root'");
    expectProductionRootSource('root/index.tsx', rootSource);
    expectProductionRootSource('root/viewer-kernel.tsx', source);
    expectProductionRootSource('root/lightweight-preview.tsx', lightweightSource);
  });

  it('exposes one canonical lightweight entry without Cut or Desktop Viewer ownership', async () => {
    const packageManifest = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { readonly exports?: Readonly<Record<string, string>> };
    const cutManifest = await readFile(
      new URL('../../../../cut/webview/package.json', import.meta.url),
      'utf8',
    );
    const cutSources = await readSourceTree(
      new URL('../../../../cut/webview/src', import.meta.url),
    );
    const desktopPreviewSources = await Promise.all(
      [
        'DesktopPreviewSurface.tsx',
        'DesktopAuthorizedPreviewSurface.tsx',
        'DesktopAssistantPreviewSurface.tsx',
      ].map((fileName) =>
        readFile(
          new URL(`../../../../../apps/neko-desktop/src/renderer/${fileName}`, import.meta.url),
          'utf8',
        ),
      ),
    );

    expect(packageManifest.exports?.['./lightweight']).toBeUndefined();
    expect(packageManifest.exports?.['./embedded']).toBeUndefined();
    expect(cutManifest).not.toContain('@neko/preview-webview');
    expect(cutSources).not.toContain('LightweightPreview');
    for (const source of desktopPreviewSources) {
      expect(source).not.toContain('LightweightPreview');
      expect(source).not.toContain('renderPreviewViewer');
      expect(source).not.toMatch(/<(?:img|video|audio)\b/u);
    }
  });

  it('poisons raw paths, alternate URLs, hidden roots and wildcard lightweight renderers', async () => {
    const lightweightSource = await readFile(
      new URL('./lightweight-preview.tsx', import.meta.url),
      'utf8',
    );
    const kernelSource = await readFile(new URL('./viewer-kernel.tsx', import.meta.url), 'utf8');
    const assetConsumer = await readFile(
      new URL('../../../../assets/webview/src/resource-browser/root.tsx', import.meta.url),
      'utf8',
    );
    const canvasConsumer = await readFile(
      new URL(
        '../../../../canvas/webview/src/components/selection/CanvasImagePreviewOverlay.tsx',
        import.meta.url,
      ),
      'utf8',
    );

    expect(lightweightSource).toContain('parsePreviewMediaDescriptor(inputDescriptor)');
    expect(lightweightSource).not.toContain('PreviewRoot');
    expect(lightweightSource).not.toMatch(/\b(?:path|absolutePath|workspacePath)\s*:/u);
    expect(lightweightSource).not.toMatch(/\b(?:https?|file|blob):\/\//u);
    expect(kernelSource).toContain("{ kind: 'image'");
    expect(kernelSource).toContain("{ kind: 'model'");
    expect(kernelSource).not.toMatch(/kind:\s*['"]\*['"]/u);
    for (const consumer of [assetConsumer, canvasConsumer]) {
      expect(consumer).toContain("from '@neko/preview-webview/root'");
      expect(consumer).not.toContain("from '@neko/preview-webview/src/");
      expect(consumer).not.toContain('@neko/model-webview');
      expect(consumer).not.toContain('<PreviewRoot');
    }
  });
});

async function readSourceTree(directory: URL): Promise<string> {
  const normalizedDirectory = new URL(
    directory.href.endsWith('/') ? directory.href : `${directory.href}/`,
  );
  const entries = await readdir(normalizedDirectory, { withFileTypes: true });
  const sources = await Promise.all(
    entries.map(async (entry) => {
      const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, normalizedDirectory);
      if (entry.isDirectory()) return readSourceTree(child);
      return /\.(?:ts|tsx|js|jsx)$/u.test(entry.name) ? readFile(child, 'utf8') : '';
    }),
  );
  return sources.join('\n');
}

function expectProductionRootSource(fileName: string, source: string): void {
  const forbidden = [
    /\bfrom\s+['"](?:node:|electron(?:\/|['"])|vscode(?:\/|['"]))/u,
    /\bimport\s*\(\s*['"](?:node:|electron(?:\/|['"])|vscode(?:\/|['"]))/u,
    /\bacquireBrowserHostState\b/u,
    /\bgetBrowserHostState\b/u,
    /\bPreviewHostAdapterSurface\b/u,
  ];

  for (const pattern of forbidden) {
    expect(
      source,
      `${fileName} contains forbidden production Root dependency ${pattern}`,
    ).not.toMatch(pattern);
  }
}
