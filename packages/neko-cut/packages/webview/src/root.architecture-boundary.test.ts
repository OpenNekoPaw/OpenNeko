import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Cut Root architecture boundary', () => {
  it('mounts the complete Cut App through the injected Host bridge', async () => {
    const root = await readFile(path.join(import.meta.dirname, 'root.tsx'), 'utf8');
    const controller = await readFile(
      path.join(import.meta.dirname, 'controllers/CutOtioControllerContext.tsx'),
      'utf8',
    );
    const bridge = await readFile(
      path.join(import.meta.dirname, 'controllers/CutWebviewHostBridgeContext.tsx'),
      'utf8',
    );

    expect(root).toContain('<App presentation={presentation} timelineTarget={timelineTarget} />');
    expect(root).toContain('<CutWebviewHostBridgeProvider bridge={bridge}>');
    expect(root).not.toContain('CutHostAdapterSurface');
    expect(root).not.toContain('getGlobalVSCodeApi');
    expect(controller).toContain('hostBridge.postIntent');
    expect(controller).not.toContain('bridge ??');
    for (const [fileName, source] of [
      ['root.tsx', root],
      ['CutOtioControllerContext.tsx', controller],
      ['CutWebviewHostBridgeContext.tsx', bridge],
    ] as const) {
      expectProductionRootSource(fileName, source);
    }
  });
});

function expectProductionRootSource(fileName: string, source: string): void {
  const forbidden = [
    /\bfrom\s+['"](?:node:|electron(?:\/|['"])|vscode(?:\/|['"]))/u,
    /\bimport\s*\(\s*['"](?:node:|electron(?:\/|['"])|vscode(?:\/|['"]))/u,
    /\bacquireVsCodeApi\b/u,
    /\bgetGlobalVSCodeApi\b/u,
    /\bCutHostAdapterSurface\b/u,
    /\bURL\.createObjectURL\b/u,
    /\bFileReader\b/u,
    /\bnew\s+Blob\b/u,
  ];

  for (const pattern of forbidden) {
    expect(
      source,
      `${fileName} contains forbidden production Root dependency ${pattern}`,
    ).not.toMatch(pattern);
  }
}
