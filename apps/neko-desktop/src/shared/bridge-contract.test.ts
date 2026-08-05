import { describe, expect, it } from 'vitest';
import {
  createDesktopBootstrapRequest,
  DesktopBridgeContractError,
  parseDesktopBootstrapProjection,
  parseDesktopLifecycleEvent,
} from './bridge-contract';

describe('Desktop bridge contract', () => {
  it('creates a canonical request from its semantic identity', () => {
    expect(createDesktopBootstrapRequest('request-1')).toEqual({
      requestId: 'request-1',
    });
  });

  it('rejects a response for another request', () => {
    expect(() => parseDesktopBootstrapProjection(validProjection(), 'request-2')).toThrowError(
      expect.objectContaining({ code: 'desktop-bridge-request-mismatch' }),
    );
  });

  it('parses only the graphical Electron bootstrap projection', () => {
    expect(parseDesktopBootstrapProjection(validProjection(), 'request-1')).toEqual(
      validProjection(),
    );
    expect(() =>
      parseDesktopBootstrapProjection({
        ...validProjection(),
        host: { id: 'forged', kind: 'node', ui: 'headless' },
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-desktop-bridge-payload',
      }),
    );
    expect(() =>
      parseDesktopBootstrapProjection({
        ...validProjection(),
        application: { ...validProjection().application, version: '0.0.1' },
      }),
    ).toThrowError(
      expect.objectContaining({
        diagnostic: expect.objectContaining({ code: 'invalid-application-contract' }),
      }),
    );
    expect(() =>
      parseDesktopBootstrapProjection({
        ...validProjection(),
        host: { ...validProjection().host, version: '43.2.0' },
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid-desktop-bridge-payload' }));
  });

  it('rejects unknown lifecycle events', () => {
    expect(() =>
      parseDesktopLifecycleEvent({
        applicationInstanceId: 'app-1',
        windowId: 'window-1',
        rendererSessionId: 'renderer-session-1',
        sequence: 1,
        type: 'active-window-changed',
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'invalid-desktop-bridge-payload',
      }),
    );
  });
});

function validProjection() {
  return {
    requestId: 'request-1',
    application: {
      applicationId: 'neko-desktop' as const,
      instanceId: 'app-1',
    },
    window: {
      windowId: 'window-1',
      rendererSessionId: 'renderer-session-1',
    },
    host: {
      id: 'electron-host',
      kind: 'electron' as const,
      ui: 'graphical' as const,
      displayName: 'OpenNeko Desktop',
    },
    runtime: {
      platform: 'darwin' as const,
      arch: 'arm64',
      locale: 'zh-CN',
    },
    status: 'foundation-ready' as const,
  };
}
