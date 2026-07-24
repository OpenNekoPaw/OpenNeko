import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CutCommandError,
  CutDocumentSessionError,
  CutMediaRuntimeUnavailableError,
} from '@neko-cut/domain';
import { toCutUserDiagnostic } from './cutUserDiagnostic';

describe('toCutUserDiagnostic', () => {
  it('keeps the Host bridge structured and does not open a second native error surface', () => {
    const provider = readFileSync(
      fileURLToPath(new URL('./CutOtioEditorProvider.ts', import.meta.url)),
      'utf8',
    );
    expect(provider).toMatch(/type: 'cut:error',[\s\S]*diagnostic: toCutUserDiagnostic/);
    expect(provider).not.toMatch(/type: 'cut:error',\s*message:/);
    expect(provider).not.toContain('showToUser: true');
  });

  it('preserves actionable Domain and session diagnostic identities', () => {
    expect(
      toCutUserDiagnostic(
        new CutCommandError(
          'clip-placement-overlap',
          'Clip placement would overlap another Clip on the target Track.',
        ),
        'cut:command',
      ),
    ).toEqual({ code: 'clip-placement-overlap' });
    expect(
      toCutUserDiagnostic(
        new CutDocumentSessionError('stale-revision', 'Revision is stale.'),
        'cut:command',
      ),
    ).toEqual({ code: 'stale-revision' });
    expect(
      toCutUserDiagnostic(new CutMediaRuntimeUnavailableError('preview'), 'cut:preview-start'),
    ).toEqual({ code: 'media-runtime-unavailable' });
  });

  it('maps unknown causes by the owning user operation without exposing Error.message', () => {
    expect(toCutUserDiagnostic(new Error('codec exploded'), 'cut:export-start')).toEqual({
      code: 'export-failed',
    });
    expect(toCutUserDiagnostic(new Error('socket exploded'), 'cut:preview-start')).toEqual({
      code: 'preview-failed',
    });
    expect(
      toCutUserDiagnostic(new Error('unexpected implementation defect'), 'cut:command'),
    ).toEqual({ code: 'operation-failed' });
  });
});
