import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');

function readRepoSource(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('creative workbench StatusBar boundary', () => {
  it('keeps Cut export snapshots in the Webview and document/task state in the native StatusBar', () => {
    const provider = readRepoSource(
      'packages/neko-cut/packages/extension/src/editor/CutOtioEditorProvider.ts',
    );
    const extension = readRepoSource('packages/neko-cut/packages/extension/src/extension.ts');
    const statusBar = readRepoSource('packages/neko-cut/packages/extension/src/views/statusBar.ts');
    const app = readRepoSource('packages/neko-cut/packages/webview/src/App.tsx');
    const css = readRepoSource('packages/neko-cut/packages/webview/src/index.css');

    expect(provider).toMatch(/type: 'cut:export-task'/);
    expect(app).toMatch(/message\['type'\] === 'cut:export-task'/);
    expect(app).toMatch(/cut-basic-error/);
    expect(statusBar).toMatch(/class StatusBar/);
    expect(statusBar).toMatch(/StatusBarGroup/);
    expect(statusBar).toMatch(/updateDocument/);
    expect(extension).toMatch(/onDocumentStatusUpdate/);
    expect(extension).toMatch(/onExportTaskUpdate/);
    expect(app).not.toMatch(/WorkbenchTopBar|cut-statusbar|cut-status-bar/);
    expect(css).not.toMatch(/\.cut-statusbar|\.cut-status-bar|\.cut-topbar/);
  });

  it('projects Canvas subsystem and projection state to the native StatusBar', () => {
    const statusBar = readRepoSource(
      'packages/neko-canvas/packages/extension/src/views/canvasStatusBar.ts',
    );
    const provider = readRepoSource(
      'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
    );
    const app = readRepoSource('packages/neko-canvas/packages/webview/src/CanvasApp.tsx');

    expect(statusBar).toMatch(/class CanvasStatusBar/);
    expect(statusBar).toMatch(/projectionSummary/);
    expect(statusBar).toMatch(/subsystemSummary/);
    expect(provider).toMatch(/case 'canvasStatus'/);
    expect(provider).toMatch(/readCanvasProjectionSummary/);
    expect(provider).toMatch(/this\.statusBar\.update\(\{/);
    expect(app).toMatch(/type: 'canvasStatus'/);
    expect(app).toMatch(/projectionStatus,/);
    expect(app).not.toMatch(/canvas-status-badge|canvas-statusbar|canvas-status-bar/);
    expect(app).not.toMatch(/subsystemStatusBadge|projectionStatusBadge|ProjectionStatusBadge/);
  });
});
