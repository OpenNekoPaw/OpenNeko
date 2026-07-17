import { describe, expect, it } from 'vitest';
import { validateCutProjectAuthoringTarget } from './cutProjectAuthoringTarget';

describe('Cut project authoring target', () => {
  it('accepts explicit existing and create-new NKV targets', () => {
    expect(
      validateCutProjectAuthoringTarget(
        { kind: 'file', documentUri: 'file:///project/edit.nkv' },
        'existing',
      ),
    ).toEqual({ ok: true, diagnostics: [] });
    expect(
      validateCutProjectAuthoringTarget(
        { kind: 'new', documentUri: 'file:///project/new-edit.nkv' },
        'create',
      ),
    ).toEqual({ ok: true, diagnostics: [] });
  });

  it('rejects active, missing kind, and missing document URI', () => {
    expect(
      validateCutProjectAuthoringTarget(
        { kind: 'active', documentUri: 'file:///project/edit.nkv' },
        'existing',
      ).diagnostics.map(({ code }) => code),
    ).toContain('invalid-authoring-target');
    expect(
      validateCutProjectAuthoringTarget(
        { documentUri: 'file:///project/edit.nkv' },
        'existing',
      ).diagnostics.map(({ code }) => code),
    ).toContain('missing-authoring-target');
    expect(
      validateCutProjectAuthoringTarget({ kind: 'new' }, 'create').diagnostics.map(
        ({ code }) => code,
      ),
    ).toContain('workspace-required');
  });

  it('rejects non-file and non-NKV targets', () => {
    expect(
      validateCutProjectAuthoringTarget(
        { kind: 'file', documentUri: 'https://example.com/edit.nkv' },
        'existing',
      ).diagnostics.map(({ code }) => code),
    ).toContain('invalid-authoring-target');
    expect(
      validateCutProjectAuthoringTarget(
        { kind: 'file', documentUri: 'file:///project/edit.nkc' },
        'existing',
      ).diagnostics.map(({ code }) => code),
    ).toContain('invalid-authoring-target');
  });

  it('rejects create-new on existing-only operations and file on create', () => {
    expect(
      validateCutProjectAuthoringTarget(
        { kind: 'new', documentUri: 'file:///project/new.nkv' },
        'existing',
      ).ok,
    ).toBe(false);
    expect(
      validateCutProjectAuthoringTarget(
        { kind: 'file', documentUri: 'file:///project/existing.nkv' },
        'create',
      ).ok,
    ).toBe(false);
  });
});
