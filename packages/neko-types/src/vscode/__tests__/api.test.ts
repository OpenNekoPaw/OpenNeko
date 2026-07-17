import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelRequest,
  getPendingRequestCount,
  getState,
  getVSCodeAPI,
  isVSCodeContext,
  postMessage,
  resetVSCodeApi,
  sendRequest,
  setState,
  vscodeApi,
} from '../api';
import { createMockVSCodeApi, installMockWebviewWindow } from '../test-utils';

describe('VSCode Webview API bridge', () => {
  afterEach(() => {
    vi.useRealTimers();
    resetVSCodeApi();
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('degrades to no-op helpers outside VS Code webview context', () => {
    expect(getVSCodeAPI()).toBeNull();
    expect(isVSCodeContext()).toBe(false);

    expect(() => postMessage({ type: 'ready' })).not.toThrow();
    expect(getState()).toBeUndefined();
    expect(() => setState({ view: 'preview' })).not.toThrow();
  });

  it('acquires the VS Code API once and reuses the cached instance', () => {
    const webview = installMockWebviewWindow();

    const first = getVSCodeAPI();
    const second = getVSCodeAPI();
    postMessage({ type: 'ready' });

    expect(first).toBe(webview.api);
    expect(second).toBe(webview.api);
    expect(webview.acquireCalls).toBe(1);
    expect(webview.api.postedMessages).toEqual([{ type: 'ready' }]);

    webview.dispose();
  });

  it('uses a pre-acquired window.vscodeApi instance without calling acquireVsCodeApi', () => {
    const api = createMockVSCodeApi({ restored: true });
    let acquireCalls = 0;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        vscodeApi: api,
        acquireVsCodeApi: () => {
          acquireCalls += 1;
          return createMockVSCodeApi();
        },
      },
      writable: true,
    });

    expect(getVSCodeAPI()).toBe(api);
    expect(getState()).toEqual({ restored: true });
    expect(acquireCalls).toBe(0);
  });

  it('delegates session state helpers to the acquired API', () => {
    const api = createMockVSCodeApi({ panel: 'left' });
    const webview = installMockWebviewWindow(api);

    expect(getState()).toEqual({ panel: 'left' });
    setState({ panel: 'right' });

    expect(getState()).toEqual({ panel: 'right' });
    expect(api.stateWrites).toEqual([{ panel: 'right' }]);

    webview.dispose();
  });

  it('resolves request-response messages by matching request id', async () => {
    const webview = installMockWebviewWindow();

    const pending = sendRequest<{ ok: true }>({ type: 'bridge:ping' }, { timeout: 1000 });
    const request = webview.api.postedMessages[0] as { _requestId: string; type: string };

    expect(request).toMatchObject({ type: 'bridge:ping' });
    expect(getPendingRequestCount()).toBe(1);

    webview.dispatchMessage({
      type: 'bridge:pong',
      _requestId: request._requestId,
      payload: { ok: true },
    });

    await expect(pending).resolves.toEqual({ ok: true });
    expect(getPendingRequestCount()).toBe(0);

    webview.dispose();
  });

  it('rejects error responses and clears the pending request', async () => {
    const webview = installMockWebviewWindow();

    const pending = sendRequest({ type: 'bridge:fails' }, { timeout: 1000 });
    const assertion = expect(pending).rejects.toThrow('Nope');
    const request = webview.api.postedMessages[0] as { _requestId: string };
    webview.dispatchMessage({
      type: 'bridge:error',
      _requestId: request._requestId,
      _error: 'Nope',
    });

    await assertion;
    expect(getPendingRequestCount()).toBe(0);

    webview.dispose();
  });

  it('times out pending requests and clears them', async () => {
    vi.useFakeTimers();
    const webview = installMockWebviewWindow();

    const pending = sendRequest({ type: 'bridge:slow' }, { timeout: 250 });
    const assertion = expect(pending).rejects.toThrow('Request timeout: bridge:slow');
    expect(getPendingRequestCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(250);

    await assertion;
    expect(getPendingRequestCount()).toBe(0);

    webview.dispose();
  });

  it('cancels pending requests and ignores repeated cancellation', async () => {
    const webview = installMockWebviewWindow();

    const pending = sendRequest({ type: 'bridge:cancel' }, { timeout: 1000 });
    const assertion = expect(pending).rejects.toThrow('Request cancelled');
    const request = webview.api.postedMessages[0] as { _requestId: string };

    expect(cancelRequest(request._requestId)).toBe(true);
    expect(cancelRequest(request._requestId)).toBe(false);

    await assertion;
    expect(getPendingRequestCount()).toBe(0);

    webview.dispose();
  });

  it('removes the request listener when reset', () => {
    const webview = installMockWebviewWindow();

    void sendRequest({ type: 'bridge:listen' }, { timeout: 1000 }).catch(() => {});
    expect(webview.listeners).toHaveLength(1);

    resetVSCodeApi();

    expect(webview.listeners).toHaveLength(0);
    expect(getPendingRequestCount()).toBe(0);

    webview.dispose();
  });

  it('exposes the wrapper object with shared helpers', () => {
    const webview = installMockWebviewWindow();

    expect(vscodeApi.get()).toBe(webview.api);
    vscodeApi.postMessage({ type: 'wrapper:ready' });

    expect(vscodeApi.isVSCodeContext()).toBe(true);
    expect(webview.api.postedMessages).toEqual([{ type: 'wrapper:ready' }]);

    webview.dispose();
  });
});
