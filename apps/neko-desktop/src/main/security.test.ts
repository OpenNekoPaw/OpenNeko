import { describe, expect, it, vi } from 'vitest';
import {
  createDesktopContentSecurityPolicy,
  createDesktopWebPreferences,
  DESKTOP_APP_ORIGIN,
  desktopRendererContentSecurityPolicyOptions,
  desktopRendererOrigin,
  configureDesktopWindowSecurity,
  isAllowedDesktopRendererUrl,
  type DesktopWindowSecurityTarget,
} from './security';

describe('Desktop security policy', () => {
  it('creates locked renderer preferences', () => {
    expect(createDesktopWebPreferences('/app/preload.js')).toMatchObject({
      preload: '/app/preload.js',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    });
  });

  it('allows only the registered renderer origin', () => {
    expect(desktopRendererOrigin(`${DESKTOP_APP_ORIGIN}/index.html`)).toBe(DESKTOP_APP_ORIGIN);
    expect(
      isAllowedDesktopRendererUrl(`${DESKTOP_APP_ORIGIN}/assets/main.js`, DESKTOP_APP_ORIGIN),
    ).toBe(true);
    expect(isAllowedDesktopRendererUrl('file:///tmp/index.html', DESKTOP_APP_ORIGIN)).toBe(false);
    expect(isAllowedDesktopRendererUrl('https://example.com/', DESKTOP_APP_ORIGIN)).toBe(false);
    expect(
      isAllowedDesktopRendererUrl('openneko://attacker@desktop/index.html', DESKTOP_APP_ORIGIN),
    ).toBe(false);
  });

  it('defines CSP without inline script, remote script, file or CSP bypass', () => {
    const policy = createDesktopContentSecurityPolicy(DESKTOP_APP_ORIGIN);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain('https:');
    expect(policy).not.toContain('file:');
    expect(policy).toContain("img-src 'self' data: blob: openneko://resource");
    expect(policy).toContain("connect-src 'self' openneko://resource blob:");
    expect(policy).toContain('media-src openneko://resource');
    expect(policy).toContain("worker-src 'self'");
    expect(policy).not.toContain('worker-src blob:');
    expect(policy).not.toContain('127.0.0.1');
    expect(policy).not.toContain('neko-media:');
  });

  it('authorizes only the configured Vite development resource nonce', () => {
    const policy = createDesktopContentSecurityPolicy('http://localhost:5173', {
      viteDevelopmentNonce: 'openneko-renderer-style',
    });

    expect(policy).toContain("script-src 'self' 'nonce-openneko-renderer-style'");
    expect(policy).toContain("style-src 'self' 'nonce-openneko-renderer-style'");
    expect(policy).not.toContain("'unsafe-inline'");
  });

  it('can authorize renderer-generated styles without authorizing inline scripts', () => {
    const policy = createDesktopContentSecurityPolicy(DESKTOP_APP_ORIGIN, {
      styleNonce: 'openneko-renderer-style',
    });

    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("script-src 'self' 'nonce-openneko-renderer-style'");
    expect(policy).toContain("style-src 'self' 'nonce-openneko-renderer-style'");
    expect(policy).not.toContain("'unsafe-inline'");
  });

  it('keeps the renderer style nonce in development and packaged window policies', () => {
    expect(desktopRendererContentSecurityPolicyOptions(false)).toEqual({
      styleNonce: 'openneko-renderer-style',
    });
    expect(desktopRendererContentSecurityPolicyOptions(true)).toEqual({
      styleNonce: 'openneko-renderer-style',
      viteDevelopmentNonce: 'openneko-renderer-style',
    });
  });

  it('grants only same-origin sanitized clipboard writes to the Desktop renderer', () => {
    const setPermissionRequestHandler = vi.fn();
    const webContents = {
      session: {
        setPermissionRequestHandler,
        webRequest: { onHeadersReceived: vi.fn() },
      },
      isDestroyed: () => false,
      on: vi.fn(),
      removeListener: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    };
    configureDesktopWindowSecurity(
      { webContents } satisfies DesktopWindowSecurityTarget,
      DESKTOP_APP_ORIGIN,
    );
    const handler = setPermissionRequestHandler.mock.calls[0]?.[0] as unknown as (
      requestingWebContents: unknown,
      permission: string,
      callback: (allowed: boolean) => void,
      details: { requestingUrl: string },
    ) => void;
    if (!handler) throw new Error('Expected a Desktop permission request handler.');

    const allowed = vi.fn();
    handler(webContents, 'clipboard-sanitized-write', allowed, {
      requestingUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
    });
    expect(allowed).toHaveBeenLastCalledWith(true);

    handler(webContents, 'clipboard-read', allowed, {
      requestingUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
    });
    expect(allowed).toHaveBeenLastCalledWith(false);
    handler(webContents, 'clipboard-sanitized-write', allowed, {
      requestingUrl: 'https://example.com/',
    });
    expect(allowed).toHaveBeenLastCalledWith(false);
    handler({}, 'clipboard-sanitized-write', allowed, {
      requestingUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
    });
    expect(allowed).toHaveBeenLastCalledWith(false);
  });

  it('disposes navigation security after Electron destroys the WebContents', () => {
    let destroyed = false;
    let webContentsAccessible = true;
    let webContentsReads = 0;
    const removeListener = vi.fn(() => {
      if (destroyed) throw new TypeError('Object has been destroyed');
    });
    const webContents = {
      session: {
        setPermissionRequestHandler: vi.fn(),
        webRequest: {
          onHeadersReceived: vi.fn(),
        },
      },
      isDestroyed: () => destroyed,
      on: vi.fn(),
      removeListener,
      setWindowOpenHandler: vi.fn(),
    };
    const target = {
      get webContents() {
        webContentsReads += 1;
        if (!webContentsAccessible) throw new TypeError('Object has been destroyed');
        return webContents;
      },
    } satisfies DesktopWindowSecurityTarget;
    const dispose = configureDesktopWindowSecurity(target, DESKTOP_APP_ORIGIN);
    destroyed = true;
    webContentsAccessible = false;

    expect(dispose).not.toThrow();
    expect(webContentsReads).toBe(1);
    expect(removeListener).not.toHaveBeenCalled();
  });
});
