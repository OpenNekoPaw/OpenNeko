import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockVSCodeApi,
  installMockWebviewWindow,
  type MockWebviewWindow,
} from '@neko/shared/vscode/test-utils';
import { dispatchPreviewDelegate } from './previewDelegates';

describe('dispatchPreviewDelegate', () => {
  const mockWindows: MockWebviewWindow[] = [];
  let postMessage: (message: unknown) => void;
  let api: ReturnType<typeof createMockVSCodeApi>;

  beforeEach(() => {
    api = createMockVSCodeApi();
    postMessage = vi.fn();
    api.postMessage = postMessage;
    mockWindows.push(installMockWebviewWindow(api));
  });

  afterEach(() => {
    for (const mockWindow of mockWindows.splice(0)) {
      mockWindow.dispose();
    }
  });

  it('delegates through the VSCode message boundary', () => {
    dispatchPreviewDelegate(api, {
      action: { id: 'open', label: 'Open', target: 'preview' },
      asset: { kind: 'asset-identity', path: 'pano.exr', mediaType: 'image' },
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:delegateAction',
        action: expect.objectContaining({ target: 'preview' }),
        asset: expect.objectContaining({ path: 'pano.exr' }),
      }),
    );
  });
});
