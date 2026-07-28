import type { Session, WebContents, WebPreferences } from 'electron';

type DesktopWillNavigateListener = (event: Electron.Event, url: string) => void;

export interface DesktopWindowSecurityTarget {
  readonly webContents: {
    readonly session: {
      readonly webRequest: {
        onHeadersReceived: Session['webRequest']['onHeadersReceived'];
      };
      setPermissionRequestHandler: Session['setPermissionRequestHandler'];
    };
    isDestroyed(): boolean;
    on(event: 'will-navigate', listener: DesktopWillNavigateListener): void;
    removeListener(event: 'will-navigate', listener: DesktopWillNavigateListener): void;
    setWindowOpenHandler: WebContents['setWindowOpenHandler'];
  };
}

export const DESKTOP_APP_SCHEME = 'neko-app';
export const DESKTOP_APP_HOST = 'desktop';
export const DESKTOP_APP_ORIGIN = `${DESKTOP_APP_SCHEME}://${DESKTOP_APP_HOST}`;

export function createDesktopWebPreferences(preloadPath: string): WebPreferences {
  if (preloadPath.trim().length === 0) {
    throw new Error('Desktop preload path is required.');
  }
  return {
    preload: preloadPath,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: true,
  };
}

export function desktopRendererOrigin(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol === `${DESKTOP_APP_SCHEME}:`) {
    return `${parsed.protocol}//${parsed.host}`;
  }
  return parsed.origin;
}

export function isAllowedDesktopRendererUrl(url: string, allowedOrigin: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return false;
    return desktopRendererOrigin(url) === allowedOrigin;
  } catch {
    return false;
  }
}

export function createDesktopContentSecurityPolicy(allowedOrigin: string): string {
  const connectSources =
    allowedOrigin.startsWith('http://') || allowedOrigin.startsWith('https://')
      ? `'self' ${allowedOrigin} ${toWebSocketOrigin(allowedOrigin)}`
      : "'self'";
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSources}`,
    "media-src 'none'",
    "worker-src 'none'",
  ].join('; ');
}

export function configureDesktopWindowSecurity(
  window: DesktopWindowSecurityTarget,
  allowedOrigin: string,
): () => void {
  const webContents = window.webContents;
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const onWillNavigate: DesktopWillNavigateListener = (event, url) => {
    if (!isAllowedDesktopRendererUrl(url, allowedOrigin)) {
      event.preventDefault();
    }
  };
  webContents.on('will-navigate', onWillNavigate);

  const targetSession = webContents.session;
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  const csp = createDesktopContentSecurityPolicy(allowedOrigin);
  const responseFilter = { urls: [`${allowedOrigin}/*`] };
  targetSession.webRequest.onHeadersReceived(responseFilter, (details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  return () => {
    if (webContents.isDestroyed()) return;
    webContents.removeListener('will-navigate', onWillNavigate);
  };
}

function toWebSocketOrigin(origin: string): string {
  const parsed = new URL(origin);
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  return parsed.origin;
}
