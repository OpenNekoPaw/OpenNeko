import { describe, expect, it } from 'vitest';
import {
  createDesktopBootstrapRequest,
  DESKTOP_BRIDGE_CONTRACT_VERSION,
  DesktopBridgeContractError,
  parseDesktopBootstrapProjection,
  parseDesktopLifecycleEvent,
} from './bridge-contract';

describe('Desktop bridge contract', () => {
  it('creates a versioned request and rejects an unsupported response version', () => {
    expect(createDesktopBootstrapRequest('request-1')).toEqual({
      schemaVersion: DESKTOP_BRIDGE_CONTRACT_VERSION,
      requestId: 'request-1',
    });
    expect(() =>
      parseDesktopBootstrapProjection({
        ...validProjection(),
        schemaVersion: 2,
      }),
    ).toThrowError(DesktopBridgeContractError);
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
  });

  it('rejects unknown lifecycle events', () => {
    expect(() =>
      parseDesktopLifecycleEvent({
        schemaVersion: 1,
        applicationInstanceId: 'app-1',
        windowId: 'window-1',
        rendererEpoch: 1,
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
    schemaVersion: 1 as const,
    requestId: 'request-1',
    application: {
      schemaVersion: 1 as const,
      applicationId: 'neko-desktop' as const,
      instanceId: 'app-1',
      version: '0.0.1',
    },
    window: {
      windowId: 'window-1',
      rendererEpoch: 1,
    },
    host: {
      id: 'electron-host',
      kind: 'electron' as const,
      ui: 'graphical' as const,
      displayName: 'OpenNeko Desktop',
      version: '43.2.0',
    },
    runtime: {
      platform: 'darwin' as const,
      arch: 'arm64',
      locale: 'zh-CN',
    },
    status: 'foundation-ready' as const,
  };
}
