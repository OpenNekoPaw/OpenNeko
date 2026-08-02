import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');

function readRepoSource(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('creative workbench Desktop host boundary', () => {
  it('keeps Cut runtime snapshots on the Desktop host bridge', () => {
    const bridge = readRepoSource(
      'packages/cut/webview/src/controllers/cut-host-runtime-webview-bridge.ts',
    );
    const app = readRepoSource('packages/cut/webview/src/App.tsx');
    const css = readRepoSource('packages/cut/webview/src/index.css');

    expect(bridge).toMatch(/type: 'cut:runtime-snapshot'/);
    expect(bridge).toMatch(/type: 'cut:export-tasks'/);
    expect(bridge).toMatch(/type: 'cut:error'/);
    expect(app).toMatch(/message\['type'\] === 'cut:export-task'/);
    expect(app).toMatch(/translateCutDiagnostic/);
    expect(app).toMatch(/useToast/);
    expect(
      existsSync(
        resolve(
          repoRoot,
          'packages/neko-cut/packages/extension/src/editor/CutOtioEditorProvider.ts',
        ),
      ),
    ).toBe(false);
    expect(app).not.toMatch(/cut-basic-error|cut-basic-notice/);
    expect(css).not.toMatch(/\.cut-basic-error|\.cut-basic-notice/);
    expect(app).not.toMatch(/WorkbenchTopBar|cut-statusbar|cut-status-bar/);
    expect(css).not.toMatch(/\.cut-statusbar|\.cut-status-bar|\.cut-topbar/);
  });

  it('routes Canvas status through the Desktop Webview host', () => {
    const host = readRepoSource('packages/canvas/webview/src/host-runtime/canvas-webview-host.ts');
    const app = readRepoSource('packages/canvas/webview/src/CanvasApp.tsx');

    expect(host).toMatch(/case 'canvasStatus'/);
    expect(host).toMatch(/executeCanvasStatus/);
    expect(app).toMatch(/type: 'canvasStatus'/);
    expect(app).toMatch(/projectionStatus,/);
    expect(
      existsSync(
        resolve(
          repoRoot,
          'packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
        ),
      ),
    ).toBe(false);
    expect(app).not.toMatch(/canvas-status-badge|canvas-statusbar|canvas-status-bar/);
    expect(app).not.toMatch(/subsystemStatusBadge|projectionStatusBadge|ProjectionStatusBadge/);
  });
});
