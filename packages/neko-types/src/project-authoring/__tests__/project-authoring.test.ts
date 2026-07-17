import { describe, expect, it } from 'vitest';
import {
  NEKO_PROJECT_AUTHORING_CONTRACT_VERSION,
  createNekoProjectAuthoringDiagnostic,
  createNekoProjectAuthoringResult,
  isNekoProjectAuthoringRuntimeHandleValue,
  scanNekoProjectAuthoringCoreDependencies,
  scanNekoProjectAuthoringStaticGuards,
  validateNekoProjectAuthoringAdapterDescriptor,
  validateNekoProjectAuthoringCommandDescriptor,
  validateNekoProjectAuthoringOperationDescriptor,
  validateNekoProjectAuthoringResult,
  validateNekoProjectAuthoringTarget,
} from '../index';
import { createPoisonedNekoProjectAuthoringRoute } from '../test-helpers';

describe('project authoring contracts', () => {
  it('models successful durable authoring results with document identity', () => {
    const result = createNekoProjectAuthoringResult({
      ok: true,
      documentUri: 'file:///workspace/story.nkv',
      created: true,
      revealed: false,
      target: {
        kind: 'new',
        documentUri: 'file:///workspace/story.nkv',
        created: true,
        reveal: false,
      },
      diagnostics: [],
      projectRef: {
        domain: 'cut',
        documentUri: 'file:///workspace/story.nkv',
        projectRevision: 'nkv:digest-1',
        contentDigest: 'digest-1',
      },
      data: { clipIds: ['clip-1'] },
    });

    expect(result.version).toBe(NEKO_PROJECT_AUTHORING_CONTRACT_VERSION);
    expect(validateNekoProjectAuthoringResult(result)).toEqual({ ok: true, diagnostics: [] });
  });

  it('rejects malformed or mismatched returned project revisions', () => {
    const malformed = createNekoProjectAuthoringResult({
      ok: true,
      documentUri: 'file:///workspace/story.nkv',
      diagnostics: [],
      projectRef: {
        domain: 'cut',
        documentUri: 'file:///workspace/story.nkv',
        projectRevision: '   ',
      },
    });
    expect(validateNekoProjectAuthoringResult(malformed)).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: 'invalid-authoring-result', path: ['projectRef'] }),
      ],
    });

    const mismatched = createNekoProjectAuthoringResult({
      ok: true,
      documentUri: 'file:///workspace/story.nkv',
      diagnostics: [],
      projectRef: {
        domain: 'cut',
        documentUri: 'file:///workspace/other.nkv',
        projectRevision: 'nkv:digest-2',
      },
    });
    expect(validateNekoProjectAuthoringResult(mismatched)).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: 'invalid-authoring-result',
          path: ['projectRef', 'documentUri'],
        }),
      ],
    });
  });

  it('rejects successful results that do not name the written document', () => {
    const validation = validateNekoProjectAuthoringResult({
      version: NEKO_PROJECT_AUTHORING_CONTRACT_VERSION,
      ok: true,
      diagnostics: [],
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics).toEqual([
      expect.objectContaining({ code: 'invalid-authoring-result', path: ['documentUri'] }),
    ]);
  });

  it('validates explicit target semantics and runtime handle rejection', () => {
    expect(validateNekoProjectAuthoringTarget({ kind: 'file' }).diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid-authoring-target',
        path: ['target', 'documentUri'],
      }),
    ]);
    expect(
      validateNekoProjectAuthoringTarget({
        kind: 'file',
        documentUri: 'vscode-webview-resource://panel/media.png',
      }).diagnostics,
    ).toEqual([
      expect.objectContaining({
        code: 'runtime-handle-persisted',
        path: ['target', 'documentUri'],
      }),
    ]);
    expect(isNekoProjectAuthoringRuntimeHandleValue('/workspace/media/shot.png')).toBe(false);
    expect(isNekoProjectAuthoringRuntimeHandleValue('/workspace/.neko/cache/thumb.png')).toBe(true);
  });

  it('classifies document-authoring operations as UI-independent', () => {
    expect(
      validateNekoProjectAuthoringOperationDescriptor({
        id: 'cut.importGeneratedClip',
        domain: 'cut',
        kind: 'document-authoring',
        canonicalCommandId: 'neko.cut.authoring.importGeneratedClip',
        requiresActiveEditor: false,
        allowsCreateNew: true,
      }),
    ).toEqual({ ok: true, diagnostics: [] });

    const invalid = validateNekoProjectAuthoringOperationDescriptor({
      id: 'sketch.selectionInpaint',
      domain: 'sketch',
      kind: 'document-authoring',
      requiresActiveEditor: true,
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'invalid-authoring-operation',
      'invalid-authoring-operation',
    ]);
  });

  it('requires non-canonical legacy document commands to point at canonical authoring commands', () => {
    const invalid = validateNekoProjectAuthoringCommandDescriptor({
      commandId: 'neko.sketch.importAsset',
      domain: 'sketch',
      operationId: 'sketch.importImageLayer',
      operationKind: 'document-authoring',
      disposition: 'ui-only-wrapper',
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({ code: 'authoring-ui-bound-route' }),
    ]);

    const migrated = validateNekoProjectAuthoringCommandDescriptor({
      commandId: 'neko.sketch.importAsset',
      domain: 'sketch',
      operationId: 'sketch.importImageLayer',
      operationKind: 'document-authoring',
      disposition: 'ui-only-wrapper',
      canonicalCommandId: 'neko.sketch.authoring.importImageLayer',
    });
    expect(migrated).toEqual({ ok: true, diagnostics: [] });
  });

  it('scans static sources for old UI-bound durable authoring routes', () => {
    const result = scanNekoProjectAuthoringStaticGuards(`
      await commands.executeCommand('neko.model.importAsset', { path });
      webview.postMessage({ type: 'importGeneratedClip' });
    `);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.context?.['ruleId'])).toEqual([
      'legacy-command:neko.model.importAsset',
      'webview-import-generated-clip-message',
    ]);
  });

  it('guards client-neutral authoring cores from UI dependencies', () => {
    const result = scanNekoProjectAuthoringCoreDependencies(`
      import * as vscode from 'vscode';
      vscode.window.showInformationMessage('Saved');
      class Service { panel?: WebviewPanel; }
    `);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'authoring-core-ui-dependency',
      'authoring-core-ui-dependency',
    ]);
  });

  it('validates client adapters as wrappers over the core authoring contract', () => {
    expect(
      validateNekoProjectAuthoringAdapterDescriptor({
        client: 'tui',
        operationId: 'cut.importGeneratedClip',
        usesCoreAuthoringContract: true,
        coreSource: `export class CutProjectAuthoringService {}`,
      }),
    ).toEqual({ ok: true, diagnostics: [] });

    const invalid = validateNekoProjectAuthoringAdapterDescriptor({
      client: 'electron',
      operationId: 'model.importAsset',
      usesCoreAuthoringContract: false,
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.diagnostics).toEqual([
      expect.objectContaining({ code: 'authoring-capability-unavailable' }),
    ]);
  });

  it('provides a poisoned legacy-route helper for path-level tests', () => {
    const route = createPoisonedNekoProjectAuthoringRoute('neko.cut.importGeneratedClip');
    route.assertNotCalled();

    expect(() => route.invoke({ assetPath: '/workspace/out.mp4' })).toThrow(
      'Poisoned project authoring route was invoked: neko.cut.importGeneratedClip',
    );
    expect(route.calls()).toEqual([[{ assetPath: '/workspace/out.mp4' }]]);
  });

  it('wraps project-file diagnostics without losing machine-readable context', () => {
    const diagnostic = createNekoProjectAuthoringDiagnostic({
      code: 'source-resolution-failed',
      message: 'Source cannot be resolved.',
      projectFileDiagnostic: {
        code: 'missing-source',
        severity: 'error',
        message: 'Missing source',
        sourceId: 'source-1',
      },
    });

    expect(diagnostic.projectFileDiagnostic).toEqual(
      expect.objectContaining({ code: 'missing-source', sourceId: 'source-1' }),
    );
  });
});
