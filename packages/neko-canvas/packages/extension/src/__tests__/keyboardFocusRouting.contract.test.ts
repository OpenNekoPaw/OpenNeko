import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const providerSource = readFileSync(join(__dirname, '../editor/canvasEditorProvider.ts'), 'utf-8');
const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');
const packageManifestSource = readFileSync(join(__dirname, '../../../../package.json'), 'utf-8');
const outlineSource = readFileSync(join(__dirname, '../views/canvasOutlineProvider.ts'), 'utf-8');
const canvasAppSource = readFileSync(
  join(__dirname, '../../../webview/src/CanvasApp.tsx'),
  'utf-8',
);
const infiniteCanvasSource = readFileSync(
  join(__dirname, '../../../webview/src/components/InfiniteCanvas.tsx'),
  'utf-8',
);
const canvasViewportSource = readFileSync(
  join(__dirname, '../../../webview/src/components/CanvasViewport.tsx'),
  'utf-8',
);
const viewportTransformSource = readFileSync(
  join(__dirname, '../../../webview/src/hooks/useViewportTransform.ts'),
  'utf-8',
);
const keyboardControllerSource = readFileSync(
  join(__dirname, '../../../webview/src/hooks/useCanvasKeyboardController.ts'),
  'utf-8',
);

describe('Canvas keyboard focus routing contracts', () => {
  it('does not make a newly resolved but inactive editor the active keyboard target', () => {
    const resolveCustomEditorSource = readMethodBody(providerSource, 'async resolveCustomEditor');
    expect(resolveCustomEditorSource).not.toContain('this.activeWebviewPanel = webviewPanel');
    expect(resolveCustomEditorSource).not.toContain('this.activeDocument = document');
    expect(providerSource).toContain('if (webviewPanel.active) {');
    expect(providerSource).toContain('this.setActiveCanvasEditor(webviewPanel, document);');
    expect(providerSource).toContain(
      'this.webviewPanelsByDocumentUri.set(documentUri, webviewPanel);',
    );
  });

  it('replays keyboard focus after webview ready and marks inactive panels explicitly', () => {
    const readyCaseSource = readCaseBody(providerSource, "case 'ready':");
    const resolveCustomEditorSource = readMethodBody(providerSource, 'async resolveCustomEditor');

    expect(readyCaseSource).toContain('this.focusedWebviews.syncFocus(document.uri.toString());');
    expect(resolveCustomEditorSource).toContain('this.focusedWebviews.markInactive(panelId);');
  });

  it('keeps outline, status, and selection updates scoped to the active document', () => {
    expect(providerSource).toContain('this.updateRememberedCanvasSnapshot(');
    expect(providerSource).toContain(
      'this.canvasSnapshotsByDocumentUri.set(documentUri, canvasData);',
    );
    expect(providerSource).toContain('if (this.isActiveCanvasDocument(document))');
    expect(providerSource).toContain('documentUri: document.uri.toString()');
    expect(providerSource).toContain('this.syncOutline(document.uri.toString(), data);');
  });

  it('routes outline commands back to the document that produced the visible outline tree', () => {
    expect(outlineSource).toContain('documentUri: string;');
    expect(outlineSource).toContain('arguments: [node.id, element.documentUri]');
    expect(outlineSource).toContain('arguments: [connection.id, element.documentUri]');
    expect(extensionSource).toContain('parseCanvasDocumentUri(documentUri)');
    expect(extensionSource).toContain('parseCanvasDocumentUri(element.documentUri)');
  });

  it('does not guess a Canvas keyboard target from the most recent visible side-by-side panel', () => {
    const postKeyboardActionSource = readMethodBody(providerSource, 'async postKeyboardAction');

    expect(postKeyboardActionSource).toContain('allowRecentVisibleFallback: false');
    expect(postKeyboardActionSource).toContain('allowSingleVisibleFallback: true');
  });

  it('keeps the transition editable guard for explicit Extension-originated editor commands', () => {
    const postKeyboardActionSource = readMethodBody(providerSource, 'async postKeyboardAction');

    expect(providerSource).toContain('CANVAS_EDITOR_LEVEL_KEYBOARD_ACTIONS');
    expect(postKeyboardActionSource).toContain('this.focusedWebviews.hasKeyboardEditable(request)');
    expect(postKeyboardActionSource).toContain('await this.hasGlobalKeyboardEditableOwner()');
    expect(providerSource).toContain('hasWebviewKeyboardEditableOwner');
    expect(providerSource).toContain("case 'webviewKeyboardEditable':");
    expect(providerSource).toContain('this.focusedWebviews.markKeyboardEditable(');
    expect(providerSource).toContain('updateWebviewKeyboardEditableOwner');
    expect(canvasAppSource).toContain('useReportWebviewKeyboardEditable(vscode)');
  });

  it('removes Canvas editor-internal editing keybindings while keeping explicit commands', () => {
    const manifest = JSON.parse(packageManifestSource) as {
      contributes?: {
        commands?: Array<{ command?: string }>;
        keybindings?: Array<{ command?: string; key?: string; mac?: string }>;
      };
    };
    const commandIds = new Set(
      (manifest.contributes?.commands ?? []).map((command) => command.command),
    );

    expect(manifest.contributes?.keybindings ?? []).toEqual([]);
    for (const commandId of [
      'neko.canvas.deleteSelected',
      'neko.canvas.escape',
      'neko.canvas.selectAll',
      'neko.canvas.undo',
      'neko.canvas.redo',
      'neko.canvas.resetZoom',
      'neko.canvas.generateSelected',
      'neko.canvas.selectNodeFromOutline',
      'neko.canvas.selectConnectionFromOutline',
    ]) {
      expect(commandIds.has(commandId)).toBe(true);
    }
    expect(extensionSource).toContain('vscode.commands.registerCommand(commandId');
    expect(extensionSource).toContain('canvasEditorProvider.postKeyboardAction(action)');
  });

  it('sends custom document save/revert messages to the matching panel instead of the global active panel', () => {
    expect(providerSource).toContain('private getWebviewPanelForDocument(');
    expect(providerSource).toContain('requestWebviewProjectSnapshot<CanvasData>');
    expect(providerSource).toContain("saveReason: 'vscode-save'");
    expect(providerSource).toContain('CustomDocumentContentChangeEvent<vscode.CustomDocument>');
    expect(providerSource).not.toContain('CustomDocumentEditEvent<vscode.CustomDocument>');
    expect(providerSource).toContain(
      "this.getWebviewPanelForDocument(document)?.webview.postMessage({ type: 'revert' })",
    );
  });

  it('does not let retained Canvas webviews self-activate or run local viewport keys while unfocused', () => {
    expect(canvasAppSource).toMatch(
      /useFocusedWebviewRoot\(\s*rootRef,\s*vscode \? false : true,\s*\)/,
    );
    expect(canvasAppSource).toContain('useCanvasKeyboardController({');
    expect(canvasAppSource).toContain('isKeyboardFocused');
    expect(canvasAppSource).toContain('isKeyboardFocusedRef,');
    expect(keyboardControllerSource).toContain('enabled: state.isKeyboardFocused');
    expect(infiniteCanvasSource).toContain('isSpacePanActive?: boolean;');
    expect(viewportTransformSource).toContain('isSpacePanActive?: boolean;');
    expect(viewportTransformSource).not.toContain("window.addEventListener('keydown'");
    expect(infiniteCanvasSource).not.toContain("window.addEventListener('keydown'");
  });

  it('keeps Canvas editor-level DOM shortcuts in the webview root dispatcher', () => {
    expect(keyboardControllerSource).toContain("createEditorBinding('delete-selected'");
    expect(keyboardControllerSource).toContain("createEditorBinding('delete-selected-backspace'");
    expect(keyboardControllerSource).toContain("createEditorBinding('escape'");
    expect(keyboardControllerSource).toContain("createEditorBinding('select-all'");
    expect(keyboardControllerSource).toContain("createEditorBinding('undo'");
    expect(keyboardControllerSource).toContain("createEditorBinding('redo'");
    expect(keyboardControllerSource).toMatch(/createEditorBinding\(\s*'generate-selected'/);
    expect(keyboardControllerSource).toContain("createViewportBinding('toggle-pan-mode'");
    expect(keyboardControllerSource).toContain("createViewportBinding('space-pan-start'");
    expect(keyboardControllerSource).toContain("createViewportBinding('space-pan-end'");
    expect(canvasAppSource).toContain('getKeyboardBoundaryMetadata({');
    expect(infiniteCanvasSource).toContain("scope: 'viewport'");
  });

  it('keeps Canvas viewport surfaces focusable so inputs can release keyboard ownership', () => {
    expect(canvasAppSource).toContain('className="canvas-main-surface"');
    expect(canvasAppSource).toContain('tabIndex={-1}');
    expect(infiniteCanvasSource).toContain('tabIndex={-1}');
    expect(infiniteCanvasSource).toContain('e.currentTarget.focus();');
    expect(infiniteCanvasSource).toContain('containerRef.current?.focus();');
    expect(infiniteCanvasSource).toContain("hasAttribute('data-canvas-viewport-layer')");
    expect(canvasViewportSource).toContain('data-canvas-viewport-layer');
  });
});

function readMethodBody(source: string, methodStart: string): string {
  const start = source.indexOf(methodStart);
  const nextMethod = source.indexOf('\n  async saveCustomDocument', start);
  return source.slice(start, nextMethod);
}

function readCaseBody(source: string, caseStart: string): string {
  const start = source.indexOf(caseStart);
  const nextCase = source.indexOf('\n      case ', start + caseStart.length);
  return source.slice(start, nextCase);
}
