import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');
const capabilitySource = readFileSync(join(__dirname, '../agentCapabilityProvider.ts'), 'utf-8');
const providerSource = readFileSync(join(__dirname, '../editor/canvasEditorProvider.ts'), 'utf-8');

describe('canvas storyboard import contracts', () => {
  it('exports a storyboard import API on NekoCanvasAPI implementation', () => {
    expect(extensionSource).toContain('storyboard: {');
    expect(extensionSource).toContain(
      'const created = await importStoryboardToCanvas(payload, options);',
    );
    expect(extensionSource).toContain('return created;');
  });

  it('does not register the legacy public command for storyboard payload import', () => {
    expect(extensionSource).not.toContain("'neko.canvas.importStoryboard'");
  });

  it('publishes storyboard import write-back events to external subscribers', () => {
    expect(extensionSource).toContain(
      'canvasEditorProvider.reportStoryboardImport(payload, created);',
    );
  });

  it('imports storyboard payloads through headless Canvas project authoring', () => {
    expect(extensionSource).toContain('new CanvasProjectAuthoringService');
    expect(extensionSource).toContain('canvasProjectAuthoringService.createStoryboardFromPayload');
    expect(extensionSource).not.toContain('await ensureCanvasEditorForStoryboardImport(payload);');
  });

  it('imports generated assets through headless Canvas project authoring', () => {
    expect(extensionSource).toContain('canvasProjectAuthoringService.importAsset({ asset })');
    expect(extensionSource).not.toContain('ensureCanvasEditorForAssetImport');
    expect(extensionSource).not.toContain('canvasEditorProvider.postImportAsset');
    expect(providerSource).toContain('setHeadlessAssetImporter');
    expect(providerSource).not.toContain("type: 'importGeneratedAsset'");
  });

  it('routes Markdown authoring through the headless Canvas project service', () => {
    expect(extensionSource).toContain('canvasProjectAuthoringService.applyAgentContent');
    expect(extensionSource).toContain('canvasProjectAuthoringService.createNode');
    expect(extensionSource).toContain('canvasProjectAuthoringService.createStoryboardFromPayload');
    expect(extensionSource).not.toContain('ensureCanvasEditorForMarkdownMutation');
    expect(extensionSource).not.toContain('isCanvasMarkdownCreationMutation');
  });

  it('does not reveal an arbitrary background canvas for imports or markdown mutations', () => {
    expect(extensionSource).not.toContain('revealAnyCanvasEditor');
    expect(providerSource).not.toContain('revealAnyCanvasEditor');
  });

  it('notifies open Canvas Webviews with a typed host-applied document message', () => {
    expect(providerSource).toContain("type: 'canvas.hostAppliedDocument'");
    expect(providerSource).toContain("reason: 'headless-authoring'");
  });

  it('allows linked resource asset imports without a runtime path', () => {
    expect(extensionSource).toContain(
      'if (!asset?.path && !asset?.documentResourceRef && !asset?.resourceRef)',
    );
    expect(extensionSource).toContain('missing asset path or resource ref');
  });

  it('routes agent storyboard import through the canvas storyboard API', () => {
    expect(capabilitySource).toContain('api.storyboard.import(payload, { startX, startY })');
  });

  it('keeps storyboard import free of automatic entity subgraph projection', () => {
    const importStart = extensionSource.indexOf('async function importStoryboardToCanvas');
    const importEnd = extensionSource.indexOf(
      'async function ensureCanvasEditorForStoryboardImport',
    );
    const importBody = extensionSource.slice(importStart, importEnd);

    expect(importBody).toContain('canvasProjectAuthoringService.createStoryboardFromPayload');
    expect(importBody).toContain('return result.storyboard;');
    expect(importBody).not.toContain("type: 'entity'");
    expect(importBody).not.toContain("type: 'representation-slot'");
    expect(importBody).not.toContain("type: 'occurrence'");
    expect(importBody).not.toContain("type: 'generated-asset'");
  });

  it('backfills explicit candidate confirmations into open storyboard shots', () => {
    expect(providerSource).not.toContain('getDashboardCreativeEntitySource');
    expect(providerSource).toContain("message.type === 'entity.confirmCandidate'");
    expect(providerSource).toContain('this.applyEntityCandidateBackfill([');
  });
});
