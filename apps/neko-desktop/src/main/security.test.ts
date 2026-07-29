import { describe, expect, it, vi } from 'vitest';
import {
  createDesktopContentSecurityPolicy,
  createDesktopWebPreferences,
  DESKTOP_APP_ORIGIN,
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
    expect(desktopRendererOrigin(`${DESKTOP_APP_ORIGIN}/index.html`)).toBe(
      DESKTOP_APP_ORIGIN,
    );
    expect(
      isAllowedDesktopRendererUrl(`${DESKTOP_APP_ORIGIN}/assets/main.js`, DESKTOP_APP_ORIGIN),
    ).toBe(true);
    expect(isAllowedDesktopRendererUrl('file:///tmp/index.html', DESKTOP_APP_ORIGIN)).toBe(false);
    expect(isAllowedDesktopRendererUrl('https://example.com/', DESKTOP_APP_ORIGIN)).toBe(false);
    expect(
      isAllowedDesktopRendererUrl(
        'neko-app://attacker@desktop/index.html',
        DESKTOP_APP_ORIGIN,
      ),
    ).toBe(false);
  });

  it('defines CSP without inline script, remote script, file or CSP bypass', () => {
    const policy = createDesktopContentSecurityPolicy(DESKTOP_APP_ORIGIN);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain('http:');
    expect(policy).not.toContain('https:');
    expect(policy).not.toContain('file:');
    expect(policy).toContain("img-src 'self' data: blob: neko-media:");
    expect(policy).toContain("connect-src 'self' blob: neko-media:");
  });

  it('authorizes only the configured Vite development resource nonce', () => {
    const policy = createDesktopContentSecurityPolicy('http://localhost:5173', {
      viteDevelopmentNonce: 'openneko-vite-development',
    });

    expect(policy).toContain(
      "script-src 'self' 'nonce-openneko-vite-development'",
    );
    expect(policy).toContain(
      "style-src 'self' 'nonce-openneko-vite-development'",
    );
    expect(policy).not.toContain("'unsafe-inline'");
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
