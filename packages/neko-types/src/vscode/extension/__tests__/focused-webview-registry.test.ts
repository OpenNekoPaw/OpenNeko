import { describe, expect, it, vi } from 'vitest';
import { FocusedWebviewRegistry, type FocusedWebviewPanelLike } from '../focused-webview-registry';

describe('FocusedWebviewRegistry', () => {
  it('routes by document URI before active visible fallback', async () => {
    const registry = new FocusedWebviewRegistry();
    const first = createPanel();
    const second = createPanel();

    registry.register({
      id: 'first',
      viewType: 'neko.canvasEditor',
      documentUri: 'file:///first.nkc',
      panel: first,
      visible: true,
      active: true,
    });
    registry.register({
      id: 'second',
      viewType: 'neko.canvasEditor',
      documentUri: 'file:///second.nkc',
      panel: second,
      visible: true,
    });

    await registry.postKeyboardAction('delete', {
      viewType: 'neko.canvasEditor',
      documentUri: 'file:///second.nkc',
    });

    expect(second.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboardAction', action: 'delete' }),
    );
    expect(first.webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboardAction', action: 'delete' }),
    );
  });

  it('routes to the active visible panel when no document URI is provided', () => {
    const registry = new FocusedWebviewRegistry();
    registry.register({
      id: 'first',
      viewType: 'neko.canvasEditor',
      panel: createPanel(),
      visible: true,
    });
    registry.register({
      id: 'second',
      viewType: 'neko.canvasEditor',
      panel: createPanel(),
      visible: true,
    });

    registry.markActive('second');

    expect(registry.resolve({ viewType: 'neko.canvasEditor' })?.id).toBe('second');
  });

  it('does not mark an inactive hidden panel visible when an out-of-order active event arrives', () => {
    const registry = new FocusedWebviewRegistry();
    const first = createPanel({ visible: true });
    const second = createPanel({ visible: false });

    registry.register({
      id: 'first',
      viewType: 'neko.canvasEditor',
      panel: first,
      visible: true,
    });
    registry.register({
      id: 'second',
      viewType: 'neko.canvasEditor',
      panel: second,
      visible: false,
    });

    registry.markActive('second');

    expect(registry.resolve({ viewType: 'neko.canvasEditor' })?.id).toBe('first');
  });

  it('posts side-by-side keyboard actions only to the focused active panel', async () => {
    const registry = new FocusedWebviewRegistry();
    const first = createPanel();
    const second = createPanel();

    registry.register({
      id: 'left',
      viewType: 'neko.canvasEditor',
      documentUri: 'file:///same-a.nkc',
      panel: first,
      visible: true,
    });
    registry.register({
      id: 'right',
      viewType: 'neko.canvasEditor',
      documentUri: 'file:///same-b.nkc',
      panel: second,
      visible: true,
    });

    registry.markActive('right');
    const posted = await registry.postKeyboardAction('deleteSelected', {
      viewType: 'neko.canvasEditor',
    });

    expect(posted).toBe(true);
    expect(second.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboardAction', action: 'deleteSelected' }),
    );
    expect(first.webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboardAction', action: 'deleteSelected' }),
    );
  });

  it('lets the Webview-side focus handshake establish the unique focused panel', async () => {
    const registry = new FocusedWebviewRegistry();
    const first = createPanel({ active: true, visible: true });
    const second = createPanel({ active: true, visible: true });

    registry.register({
      id: 'left',
      viewType: 'neko.canvasEditor',
      documentUri: 'file:///left.nkc',
      panel: first,
      visible: true,
      active: true,
    });
    registry.register({
      id: 'right',
      viewType: 'neko.canvasEditor',
      documentUri: 'file:///right.nkc',
      panel: second,
      visible: true,
      active: true,
    });

    registry.markKeyboardFocused('left', true);
    registry.markKeyboardFocused('right', true);

    const posted = await registry.postKeyboardAction('deleteSelected', {
      viewType: 'neko.canvasEditor',
      allowRecentVisibleFallback: false,
    });

    expect(posted).toBe(true);
    expect(registry.resolve({ viewType: 'neko.canvasEditor' })?.id).toBe('right');
    expect(first.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboardFocus', focused: false }),
    );
    expect(second.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboardAction', action: 'deleteSelected' }),
    );
  });

  it('lets the Webview-side blur handshake clear keyboard focus without dropping active panel routing', () => {
    const registry = new FocusedWebviewRegistry();
    const panel = createPanel({ visible: true });
    registry.register({
      id: 'canvas',
      viewType: 'neko.canvasEditor',
      panel,
      visible: true,
    });

    registry.markKeyboardFocused('canvas', true);
    registry.markKeyboardEditable('canvas', true);
    registry.markKeyboardFocused('canvas', false);

    expect(
      registry.resolve({ viewType: 'neko.canvasEditor', allowRecentVisibleFallback: false })?.id,
    ).toBe('canvas');
    expect(
      registry.hasKeyboardEditable({
        viewType: 'neko.canvasEditor',
        allowRecentVisibleFallback: false,
      }),
    ).toBe(false);
    expect(panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboardFocus', focused: false }),
    );
  });

  it('keeps Workbench active ownership when Webview DOM focus blurs', async () => {
    const registry = new FocusedWebviewRegistry();
    const panel = createPanel({ visible: true });
    registry.register({
      id: 'canvas',
      viewType: 'neko.canvasEditor',
      panel,
      visible: true,
    });

    registry.markActive('canvas');
    registry.markKeyboardFocused('canvas', false);

    expect(registry.resolve({ viewType: 'neko.canvasEditor' })?.id).toBe('canvas');
    await expect(
      registry.postKeyboardAction('explicitCommand', {
        viewType: 'neko.canvasEditor',
        allowRecentVisibleFallback: false,
      }),
    ).resolves.toBe(true);
    expect(panel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboardAction', action: 'explicitCommand' }),
    );
  });

  it('tracks editable keyboard focus on the resolved panel only', () => {
    const registry = new FocusedWebviewRegistry();
    registry.register({
      id: 'left',
      viewType: 'neko.canvasEditor',
      panel: createPanel(),
      visible: true,
    });
    registry.register({
      id: 'right',
      viewType: 'neko.canvasEditor',
      panel: createPanel(),
      visible: true,
    });

    registry.markKeyboardFocused('right', true);
    registry.markKeyboardEditable('left', true);

    expect(
      registry.hasKeyboardEditable({
        viewType: 'neko.canvasEditor',
        allowRecentVisibleFallback: false,
      }),
    ).toBe(false);

    registry.markKeyboardEditable('right', true);

    expect(
      registry.hasKeyboardEditable({
        viewType: 'neko.canvasEditor',
        allowRecentVisibleFallback: false,
      }),
    ).toBe(true);
  });

  it('clears editable keyboard focus when a panel loses ownership', () => {
    const registry = new FocusedWebviewRegistry();
    registry.register({
      id: 'canvas',
      viewType: 'neko.canvasEditor',
      panel: createPanel(),
      visible: true,
    });

    registry.markKeyboardFocused('canvas', true);
    registry.markKeyboardEditable('canvas', true);
    registry.markKeyboardFocused('canvas', false);

    expect(
      registry.hasKeyboardEditable({
        viewType: 'neko.canvasEditor',
        allowRecentVisibleFallback: false,
      }),
    ).toBe(false);
  });

  it('does not guess between side-by-side visible panels when recent fallback is disabled', async () => {
    const registry = new FocusedWebviewRegistry();
    const first = createPanel();
    const second = createPanel();

    registry.register({
      id: 'left',
      viewType: 'neko.canvasEditor',
      panel: first,
      visible: true,
    });
    registry.register({
      id: 'right',
      viewType: 'neko.canvasEditor',
      panel: second,
      visible: true,
    });

    const posted = await registry.postKeyboardAction('deleteSelected', {
      viewType: 'neko.canvasEditor',
      allowRecentVisibleFallback: false,
    });

    expect(posted).toBe(false);
    expect(first.webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboardAction' }),
    );
    expect(second.webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboardAction' }),
    );
  });

  it('falls back to the most recently focused visible panel', () => {
    const registry = new FocusedWebviewRegistry();
    registry.register({
      id: 'first',
      viewType: 'neko.modelPreview',
      panel: createPanel(),
      visible: true,
    });
    registry.register({
      id: 'second',
      viewType: 'neko.modelPreview',
      panel: createPanel(),
      visible: true,
    });

    registry.markActive('first');
    registry.markActive('second');
    registry.markVisible('second', false);

    expect(registry.resolve({ viewType: 'neko.modelPreview' })?.id).toBe('first');
  });

  it('fails command delivery when no target can be resolved', async () => {
    const registry = new FocusedWebviewRegistry();
    const posted = await registry.postKeyboardAction('delete', {
      viewType: 'neko.canvasEditor',
      allowRecentVisibleFallback: false,
    });

    expect(posted).toBe(false);
  });

  it('cleans up unregistered panels and sends keyboard focus changes', () => {
    const registry = new FocusedWebviewRegistry();
    const first = createPanel();
    const second = createPanel();

    const disposable = registry.register({
      id: 'first',
      viewType: 'neko.canvasEditor',
      panel: first,
      visible: true,
      active: true,
    });
    registry.register({
      id: 'second',
      viewType: 'neko.canvasEditor',
      panel: second,
      visible: true,
    });

    registry.markActive('second');
    disposable.dispose();

    expect(registry.resolve({ viewType: 'neko.canvasEditor', id: 'first' })).toBeUndefined();
    expect(first.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboardFocus', focused: false }),
    );
    expect(second.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboardFocus', focused: true }),
    );
  });

  it('replays the current keyboard focus state for a ready webview', () => {
    const registry = new FocusedWebviewRegistry();
    const first = createPanel();
    const second = createPanel();

    registry.register({
      id: 'first',
      viewType: 'neko.canvasEditor',
      panel: first,
      visible: true,
      active: true,
    });
    registry.register({
      id: 'second',
      viewType: 'neko.canvasEditor',
      panel: second,
      visible: true,
    });

    registry.syncFocus('second');

    expect(second.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboardFocus', focused: false }),
    );
  });

  it('marks an inactive visible panel unfocused without hiding it', () => {
    const registry = new FocusedWebviewRegistry();
    const first = createPanel();
    const second = createPanel();

    registry.register({
      id: 'first',
      viewType: 'neko.canvasEditor',
      panel: first,
      visible: true,
    });
    registry.register({
      id: 'second',
      viewType: 'neko.canvasEditor',
      panel: second,
      visible: true,
    });

    registry.markActive('second');
    registry.markInactive('second');

    expect(second.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'keyboardFocus', focused: false }),
    );
    expect(
      registry.resolve({ viewType: 'neko.canvasEditor', allowRecentVisibleFallback: false }),
    ).toBeUndefined();
    expect(
      registry.resolve({
        viewType: 'neko.canvasEditor',
        allowRecentVisibleFallback: false,
        allowSingleVisibleFallback: true,
      }),
    ).toBeUndefined();
  });
});

function createPanel(
  overrides: Partial<Pick<FocusedWebviewPanelLike, 'active' | 'visible'>> = {},
): FocusedWebviewPanelLike {
  return {
    webview: {
      postMessage: vi.fn(async () => true),
    },
    ...overrides,
  };
}
