export const CUT_USER_DIAGNOSTIC_CODES = [
  'clip-not-found',
  'track-not-found',
  'track-limit',
  'incompatible-track',
  'clip-placement-overlap',
  'invalid-command',
  'identity-conflict',
  'linked-clip-required',
  'locked',
  'document-mismatch',
  'session-mismatch',
  'stale-revision',
  'external-change-conflict',
  'invalid-document',
  'media-runtime-unavailable',
  'media-import-failed',
  'media-path-invalid',
  'media-unavailable',
  'preview-failed',
  'export-failed',
  'separate-audio-failed',
  'fullscreen-failed',
  'project-not-open',
  'operation-failed',
] as const;

export type CutUserDiagnosticCode = (typeof CUT_USER_DIAGNOSTIC_CODES)[number];
const CUT_USER_DIAGNOSTIC_CODE_SET = new Set<string>(CUT_USER_DIAGNOSTIC_CODES);

export interface CutUserDiagnostic {
  readonly code: CutUserDiagnosticCode;
}

export function isCutUserDiagnostic(value: unknown): value is CutUserDiagnostic {
  if (!isRecord(value) || typeof value['code'] !== 'string') return false;
  return CUT_USER_DIAGNOSTIC_CODE_SET.has(value['code']);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
