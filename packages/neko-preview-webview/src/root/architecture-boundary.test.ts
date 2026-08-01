import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Preview Root architecture boundary', () => {
  it('mounts the existing ModelViewer through an injected host without a second model renderer', async () => {
    const source = await readFile(new URL('./index.tsx', import.meta.url), 'utf8');
    const modelViewer = await readFile(
      new URL('../model/ModelViewer.tsx', import.meta.url),
      'utf8',
    );
    const sourceModelViewerHost = await readFile(
      new URL('../model/sourceModelViewerHost.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("import { ModelViewer } from '../model/ModelViewer'");
    expect(source).toContain(
      "import { createSourceModelViewerHost } from '../model/sourceModelViewerHost'",
    );
    expect(source).not.toContain('vscodeModelViewerHost');
    expect(source).not.toContain('browserThreeRuntimeFactory');
    expect(source).not.toContain('<canvas');
    expect(modelViewer).not.toContain('getBrowserHostState');
    expect(modelViewer).not.toContain("window.addEventListener('message'");
    for (const [fileName, productionSource] of [
      ['root/index.tsx', source],
      ['model/ModelViewer.tsx', modelViewer],
      ['model/sourceModelViewerHost.ts', sourceModelViewerHost],
    ] as const) {
      expectProductionRootSource(fileName, productionSource);
    }
  });

  it('consumes only opaque authorized media URLs without renderer-owned file transport', async () => {
    const source = await readFile(new URL('./index.tsx', import.meta.url), 'utf8');

    expect(source).toContain('const sourceUrl = descriptor.url;');
    expect(source).toContain('const sourceUrl = projection.descriptor.url;');
    expect(source).not.toContain('neko-media:');
    expect(source).not.toContain('file:');
    expect(source).not.toMatch(/\b(?:https?|blob):\/\//u);
    expect(source).not.toContain('URL.createObjectURL');
    expect(source).not.toContain('FileReader');
    expect(source).not.toContain('new Blob');
    expect(source).not.toContain('absolutePath');
    expect(source).not.toContain('workspacePath');
    expectProductionRootSource('root/index.tsx', source);
  });
});

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
