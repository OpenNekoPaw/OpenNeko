import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { protocol } from 'electron';
import {
  createDesktopContentSecurityPolicy,
  DESKTOP_APP_HOST,
  DESKTOP_APP_ORIGIN,
  DESKTOP_APP_SCHEME,
} from './security';
import { resolveDesktopRendererAsset } from './renderer-asset-path';

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

export function registerDesktopAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: DESKTOP_APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        bypassCSP: false,
      },
    },
  ]);
}

export function registerDesktopAppProtocol(rendererRoot: string): () => void {
  const absoluteRoot = path.resolve(rendererRoot);
  const csp = createDesktopContentSecurityPolicy(DESKTOP_APP_ORIGIN);
  protocol.handle(DESKTOP_APP_SCHEME, async (request) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { Allow: 'GET, HEAD' },
        });
      }
      const url = new URL(request.url);
      if (url.host !== DESKTOP_APP_HOST || url.username || url.password) {
        return new Response('Not Found', { status: 404 });
      }
      const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const filePath = resolveDesktopRendererAsset(absoluteRoot, requestedPath);
      const headers = new Headers({
        'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'Content-Security-Policy': csp,
        'Cross-Origin-Opener-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
      });
      if (request.method === 'HEAD') {
        return new Response(null, { status: 200, headers });
      }
      return new Response(await readFile(filePath), { status: 200, headers });
    } catch (error) {
      if (isMissingFileError(error)) {
        return new Response('Not Found', { status: 404 });
      }
      throw error;
    }
  });
  return () => {
    protocol.unhandle(DESKTOP_APP_SCHEME);
  };
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
