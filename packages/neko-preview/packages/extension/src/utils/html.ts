/**
 * Webview HTML Generator
 *
 * Generates HTML for video/audio preview webviews.
 * Supports both dev mode (Vite HMR) and production mode (bundled assets).
 */

import * as vscode from 'vscode';
import { injectLocaleAttribute } from '@neko/shared/vscode/extension';
import { getNonce } from './nonce';

/** Supported preview entry points */
export type PreviewEntry = 'video' | 'audio' | 'pdf' | 'cbz' | 'epub' | 'docx';

/** Document entries fetch tokenized data from the Preview Node loopback host. */
const DOCUMENT_ENTRIES = new Set<PreviewEntry>(['pdf', 'cbz', 'epub', 'docx']);

export interface WebviewHtmlOptions {
  /** Webview instance */
  webview: vscode.Webview;
  /** Extension URI for resolving local resources */
  extensionUri: vscode.Uri;
  /** Entry point */
  entry: PreviewEntry;
  /** Whether to use Vite dev server */
  devMode?: boolean;
  /** Vite dev server port */
  devPort?: number;
}

/**
 * Generate HTML content for the preview webview
 */
export function getWebviewHtml(options: WebviewHtmlOptions): string {
  const { webview, extensionUri, entry, devMode = false, devPort = 5174 } = options;
  const nonce = getNonce();
  const localeAttr = injectLocaleAttribute();

  if (devMode) {
    return getDevHtml(nonce, entry, devPort, localeAttr);
  }

  return getProdHtml(webview, extensionUri, nonce, entry, localeAttr);
}

/** Display names for entry types */
const ENTRY_TITLES: Record<PreviewEntry, string> = {
  video: 'Video Preview',
  audio: 'Audio Preview',
  pdf: 'PDF Preview',
  cbz: 'CBZ Preview',
  epub: 'EPUB Preview',
  docx: 'DOCX Preview',
};

/** Loopback origin shared by the Node document host and Rust media Engine. */
const LOOPBACK_HTTP = 'http://127.0.0.1:*';

/**
 * Dev mode: connect to Vite dev server for HMR
 */
function getDevHtml(
  nonce: string,
  entry: PreviewEntry,
  devPort: number,
  localeAttr: string,
): string {
  const devUrl = `http://localhost:${devPort}`;
  const isDocument = DOCUMENT_ENTRIES.has(entry);
  const isEpub = entry === 'epub';

  // All documents connect to the Node host; EPUB also needs blob: for epubjs.
  const connectSrc = isDocument
    ? isEpub
      ? `connect-src blob: ${devUrl} ${LOOPBACK_HTTP};`
      : `connect-src ${devUrl} ${LOOPBACK_HTTP};`
    : `connect-src ws://localhost:${devPort} ws://127.0.0.1:* ${devUrl} ${LOOPBACK_HTTP};`;

  // Document archive resources use the Node loopback origin.
  const imgSrc = isDocument
    ? `img-src ${devUrl} ${LOOPBACK_HTTP} data: blob:;`
    : `img-src ${devUrl} data: blob:;`;
  const styleSrc = isDocument
    ? `style-src 'unsafe-inline' blob: ${devUrl} ${LOOPBACK_HTTP};`
    : `style-src 'unsafe-inline' ${devUrl};`;
  const fontSrc = isDocument
    ? `font-src ${devUrl} ${LOOPBACK_HTTP} data:;`
    : `font-src ${devUrl} data:;`;

  const workerSrc = entry === 'pdf' ? `worker-src blob:;` : '';
  const frameSrc = isEpub ? `frame-src blob: ${devUrl};` : '';

  return `<!DOCTYPE html>
<html ${localeAttr}>
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		${connectSrc}
		${imgSrc}
		media-src blob:;
		script-src 'nonce-${nonce}' ${devUrl};
		${styleSrc}
		${fontSrc}
		${workerSrc}
		${frameSrc}
	" />
	<title>${ENTRY_TITLES[entry]}</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" type="module" src="${devUrl}/@vite/client"></script>
	<script nonce="${nonce}" type="module" src="${devUrl}/src/${entry}/main.tsx"></script>
</body>
</html>`;
}

/**
 * Production mode: load bundled assets from dist
 */
function getProdHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  nonce: string,
  entry: PreviewEntry,
  localeAttr: string,
): string {
  const distUri = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', `${entry}.js`));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'assets', 'style.css'));
  const csp = webview.cspSource;

  const isDocument = DOCUMENT_ENTRIES.has(entry);
  const isEpub = entry === 'epub';

  const connectSrc = isDocument
    ? isEpub
      ? `connect-src blob: ${LOOPBACK_HTTP};`
      : `connect-src ${LOOPBACK_HTTP};`
    : `connect-src ws://127.0.0.1:* ${LOOPBACK_HTTP};`;

  const imgSrc = isDocument
    ? `img-src ${csp} ${LOOPBACK_HTTP} data: blob:;`
    : `img-src ${csp} data: blob:;`;
  const styleSrc = isDocument
    ? `style-src 'unsafe-inline' blob: ${csp} ${LOOPBACK_HTTP};`
    : `style-src 'unsafe-inline' ${csp};`;
  const fontSrc = isDocument ? `font-src ${csp} ${LOOPBACK_HTTP} data:;` : `font-src ${csp} data:;`;

  const workerSrc = entry === 'pdf' ? `worker-src blob: ${csp};` : '';
  const frameSrc = isEpub ? `frame-src blob: ${csp};` : '';

  return `<!DOCTYPE html>
<html ${localeAttr}>
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta http-equiv="Content-Security-Policy" content="
		default-src 'none';
		${connectSrc}
		${imgSrc}
		media-src blob:;
		script-src 'nonce-${nonce}';
		${styleSrc}
		${fontSrc}
		${workerSrc}
		${frameSrc}
	" />
	<link rel="stylesheet" href="${styleUri}" />
	<title>${ENTRY_TITLES[entry]}</title>
</head>
<body>
	<div id="root"></div>
	<script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
}
