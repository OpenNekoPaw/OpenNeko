import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectFunctionalScenarios } from './scenario-selection.mjs';

describe('functional P0 scenario selection', () => {
  it('selects the owning Canvas scenarios for a Canvas Webview change', async () => {
    assert.deepEqual(
      await selectFunctionalScenarios(['packages/neko-canvas/packages/webview/src/CanvasApp.tsx']),
      [
        'scripts/webview-functional/scenarios/canvas/canvas-board-basic-professional.p0.scenario.json',
        'scripts/webview-functional/scenarios/canvas/canvas-edit-save-reopen.p0.scenario.json',
        'scripts/webview-functional/scenarios/canvas/canvas-foundational-media.p0.scenario.json',
        'scripts/webview-functional/scenarios/canvas/canvas-invalid-project.p0.scenario.json',
        'scripts/webview-functional/scenarios/canvas/canvas-spatial-groups.p0.scenario.json',
        'scripts/webview-functional/scenarios/canvas/canvas-workspace-board-projection.p0.scenario.json',
      ],
    );
  });

  it('uses workspace dependencies to select consumers of shared changes', async () => {
    const selected = await selectFunctionalScenarios([
      'packages/neko-types/src/vscode/extension/optional-agent-capability-registration.ts',
    ]);

    assert.ok(selected.some((path) => path.includes('/agent/')));
    assert.ok(selected.some((path) => path.includes('/canvas/')));
  });

  it('selects all VS Code P0 scenarios for runner and workflow inputs', async () => {
    const fromRunner = await selectFunctionalScenarios([
      'scripts/webview-functional/operations.mjs',
    ]);
    const fromWorkflow = await selectFunctionalScenarios(['.github/workflows/ui-functional.yml']);

    assert.deepEqual(fromRunner, fromWorkflow);
    assert.deepEqual(fromRunner, [
      'scripts/webview-functional/scenarios/agent/agent-lifecycle-reload.p0.scenario.json',
      'scripts/webview-functional/scenarios/agent/agent-view-submit.p0.scenario.json',
      'scripts/webview-functional/scenarios/canvas/canvas-board-basic-professional.p0.scenario.json',
      'scripts/webview-functional/scenarios/canvas/canvas-edit-save-reopen.p0.scenario.json',
      'scripts/webview-functional/scenarios/canvas/canvas-foundational-media.p0.scenario.json',
      'scripts/webview-functional/scenarios/canvas/canvas-invalid-project.p0.scenario.json',
      'scripts/webview-functional/scenarios/canvas/canvas-spatial-groups.p0.scenario.json',
      'scripts/webview-functional/scenarios/canvas/canvas-workspace-board-projection.p0.scenario.json',
      'scripts/webview-functional/scenarios/cut/cut-add-track-save-reopen.p0.scenario.json',
      'scripts/webview-functional/scenarios/cut/cut-engine-unavailable-authoring.p0.scenario.json',
      'scripts/webview-functional/scenarios/preview/preview-cbz-node-host.p0.scenario.json',
      'scripts/webview-functional/scenarios/preview/preview-docx-node-host.p0.scenario.json',
      'scripts/webview-functional/scenarios/preview/preview-epub-node-host.p0.scenario.json',
      'scripts/webview-functional/scenarios/preview/preview-pdf-node-host.p0.scenario.json',
      'scripts/webview-functional/scenarios/story/story-edit-diagnostic-save-reopen.p0.scenario.json',
    ]);
  });

  it('selects Home Electron scenarios for changes under the application root', async () => {
    assert.deepEqual(
      await selectFunctionalScenarios(['apps/neko-home/src/renderer/App.tsx'], {
        host: 'electron',
      }),
      [
        'scripts/webview-functional/scenarios/home/home-resources-agent-restart.p0.scenario.json',
        'scripts/webview-functional/scenarios/home/home-startup-engine-unavailable-handoff.p0.scenario.json',
      ],
    );
  });

  it('returns an explicit empty selection for unrelated research prose', async () => {
    assert.deepEqual(await selectFunctionalScenarios(['docs/research/competitor-note.md']), []);
  });
});
