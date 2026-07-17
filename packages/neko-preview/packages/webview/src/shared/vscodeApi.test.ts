import { afterEach, describe, expect, it, vi } from 'vitest';

describe('preview vscode api facade', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function loadFacade() {
    vi.resetModules();
    const { installMockWebviewWindow } = await import('@neko/shared/vscode/test-utils');
    const mockWindow = installMockWebviewWindow();
    const mod = await import('./vscodeApi');
    return { getVscodeApi: mod.getVscodeApi, mockWindow };
  }

  it('delegates postMessage and session state to the shared VS Code bridge', async () => {
    const { getVscodeApi, mockWindow } = await loadFacade();
    const api = getVscodeApi();

    api.postMessage({ type: 'ready' });
    api.setState({ panel: 'preview' });

    expect(mockWindow.acquireCalls).toBe(1);
    expect(mockWindow.api.postedMessages).toEqual([{ type: 'ready' }]);
    expect(api.getState()).toEqual({ panel: 'preview' });

    mockWindow.dispose();
  });
});
