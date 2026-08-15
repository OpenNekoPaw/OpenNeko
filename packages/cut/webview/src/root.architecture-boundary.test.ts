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

    expect(root).toContain('<App />');
    expect(root).not.toContain('timelineVisible');
    expect(root).not.toContain('timelineTarget');
    expect(root).not.toContain('timeline-only');
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

  it('keeps the timeline monitor on its dual-slot PCM-clock path and poisons Preview Surfaces', async () => {
    const manifest = await readFile(path.join(import.meta.dirname, '../package.json'), 'utf8');
    const app = await readFile(path.join(import.meta.dirname, 'App.tsx'), 'utf8');
    const panel = await readFile(
      path.join(import.meta.dirname, 'components/PreviewPanel/PreviewPanel.tsx'),
      'utf8',
    );
    const clock = await readFile(
      path.join(import.meta.dirname, 'media/CutPreviewClock.ts'),
      'utf8',
    );
    const sources = [manifest, app, panel, clock];

    for (const source of sources) {
      expect(source).not.toContain('@neko/preview-webview');
      expect(source).not.toContain('QuickPreviewSurface');
      expect(source).not.toContain('EmbeddedPreviewSurface');
      expect(source).not.toContain('PreviewRoot');
    }
    expect(panel.match(/<video\b/gu)).toHaveLength(2);
    expect(panel).toContain('<canvas');
    expect(app).toContain('new CutPreviewClock');
    expect(app).toContain('secondaryPreviewVideoRef');
    expect(clock).toContain('primaryAudio?.isClockReady');
    expect(clock).toContain('secondaryAudioDrift');
    expect(app).toContain('presentationActions.seek');
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
