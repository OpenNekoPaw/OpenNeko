// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMockVSCodeApi,
  installMockWebviewWindow,
  type MockWebviewWindow,
} from '@neko/shared/vscode/test-utils';
import {
  confirmCanvasEntityCandidate,
  requestCanvasEntitySummary,
} from './canvasEntityRouteClient';

describe('canvas entity route client', () => {
  const mockWindows: MockWebviewWindow[] = [];

  afterEach(() => {
    for (const mockWindow of mockWindows.splice(0)) {
      mockWindow.dispose();
    }
  });

  it('sends request/response messages with request ids', async () => {
    const api = createMockVSCodeApi();
    api.postMessage = vi.fn((message: unknown) => {
      const request = message as { readonly _requestId: number };
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: '_response',
            _requestId: request._requestId,
            ok: true,
            summary: { status: 'candidate', displayName: 'Rin' },
          },
        }),
      );
    });
    mockWindows.push(installMockWebviewWindow(api));

    const response = await requestCanvasEntitySummary({
      candidateId: 'candidate-rin',
      characterName: 'Rin',
    });

    expect(api.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'entity.summary',
        candidateId: 'candidate-rin',
        _requestId: expect.any(Number),
      }),
    );
    expect(response).toEqual(
      expect.objectContaining({
        ok: true,
        summary: { status: 'candidate', displayName: 'Rin' },
      }),
    );
  });

  it('routes candidate confirmation through the host', async () => {
    const api = createMockVSCodeApi();
    api.postMessage = vi.fn((message: unknown) => {
      const request = message as { readonly _requestId: number };
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: '_response',
            _requestId: request._requestId,
            ok: true,
          },
        }),
      );
    });
    mockWindows.push(installMockWebviewWindow(api));

    await confirmCanvasEntityCandidate({ candidateId: 'candidate-rin' });

    expect(api.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'entity.confirmCandidate',
        candidateId: 'candidate-rin',
        _requestId: expect.any(Number),
      }),
    );
  });
});
