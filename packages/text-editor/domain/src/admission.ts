import type { ContentFingerprint } from '@neko/content-domain';
import {
  TEXT_DOCUMENT_MAX_BYTES,
  TextDocumentError,
  type TextDocumentDiagnostic,
  type TextDocumentMode,
} from './contracts';

const MODE_BY_EXTENSION: Readonly<Record<string, TextDocumentMode>> = {
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  fountain: 'fountain',
  txt: 'plain-text',
  yaml: 'plain-text',
  yml: 'plain-text',
  xml: 'plain-text',
  html: 'plain-text',
  css: 'plain-text',
  js: 'plain-text',
  jsx: 'plain-text',
  ts: 'plain-text',
  tsx: 'plain-text',
  csv: 'plain-text',
  srt: 'plain-text',
  vtt: 'plain-text',
};

export interface AdmittedTextDocument {
  readonly source: string;
  readonly mode: TextDocumentMode;
  readonly lineEnding: '\n' | '\r\n';
  readonly hasBom: boolean;
  readonly fingerprint: ContentFingerprint;
  readonly diagnostics: readonly TextDocumentDiagnostic[];
}

export function modeForTextDocument(path: string): TextDocumentMode | undefined {
  const extension = path.split('.').at(-1)?.toLowerCase();
  return extension ? MODE_BY_EXTENSION[extension] : undefined;
}

export function admitTextDocument(
  path: string,
  bytes: Uint8Array,
  fingerprint: ContentFingerprint,
  maxBytes = TEXT_DOCUMENT_MAX_BYTES,
): AdmittedTextDocument {
  const mode = modeForTextDocument(path);
  if (!mode) throw admissionError('text-document-unsupported-extension');
  if (bytes.byteLength > maxBytes) throw admissionError('text-document-too-large');
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  let decodedSource: string;
  try {
    decodedSource = new TextDecoder('utf-8', { fatal: true }).decode(
      hasBom ? bytes.subarray(3) : bytes,
    );
  } catch {
    throw admissionError('text-document-invalid-utf8');
  }
  const withoutCrLf = decodedSource.replace(/\r\n/g, '');
  if (
    withoutCrLf.includes('\r') ||
    (decodedSource.includes('\r\n') && withoutCrLf.includes('\n'))
  ) {
    throw admissionError('text-document-mixed-line-endings');
  }
  return {
    source: decodedSource.replace(/\r\n/g, '\n'),
    mode,
    lineEnding: decodedSource.includes('\r\n') ? '\r\n' : '\n',
    hasBom,
    fingerprint,
    diagnostics: [],
  };
}

export function encodeTextDocument(
  source: string,
  lineEnding: '\n' | '\r\n',
  hasBom: boolean,
): Uint8Array {
  const normalized = source.replace(/\r\n|\r|\n/g, lineEnding);
  const bytes = new TextEncoder().encode(normalized);
  if (!hasBom) return bytes;
  const result = new Uint8Array(bytes.length + 3);
  result.set([0xef, 0xbb, 0xbf]);
  result.set(bytes, 3);
  return result;
}

function admissionError(code: TextDocumentDiagnostic['code']): TextDocumentError {
  return new TextDocumentError({ code, severity: 'error' });
}
