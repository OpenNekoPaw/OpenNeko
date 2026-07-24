import {
  CutCommandError,
  CutDocumentSessionError,
  CutMediaRuntimeUnavailableError,
  type CutUserDiagnostic,
} from '@neko-cut/domain';
import { CutMediaImportError } from '../services/CutWorkspaceMediaImporter';
import { CutMediaPathError } from '../services/CutWorkspaceMediaPaths';

export function toCutUserDiagnostic(error: unknown, operation: string): CutUserDiagnostic {
  if (error instanceof CutCommandError) return { code: error.code };
  if (error instanceof CutDocumentSessionError) return { code: error.code };
  if (error instanceof CutMediaRuntimeUnavailableError) {
    return { code: 'media-runtime-unavailable' };
  }
  if (error instanceof CutMediaImportError) return { code: 'media-import-failed' };
  if (error instanceof CutMediaPathError) return { code: 'media-path-invalid' };

  if (operation.startsWith('cut:preview-')) return { code: 'preview-failed' };
  if (operation === 'cut:export-start' || operation === 'cut:export-cancel') {
    return { code: 'export-failed' };
  }
  if (operation === 'cut:select-link-media' || operation === 'cut:drop-link-media') {
    return { code: 'media-import-failed' };
  }
  if (operation === 'cut:separate') return { code: 'separate-audio-failed' };
  return { code: 'operation-failed' };
}

export function isKnownCutUserError(error: unknown): boolean {
  return (
    error instanceof CutCommandError ||
    error instanceof CutDocumentSessionError ||
    error instanceof CutMediaRuntimeUnavailableError ||
    error instanceof CutMediaImportError ||
    error instanceof CutMediaPathError
  );
}
