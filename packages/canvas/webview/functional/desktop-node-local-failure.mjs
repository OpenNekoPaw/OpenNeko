import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  openFixtureWorkspace,
  replaceWorkbench,
} from '../../../../scripts/desktop-functional/desktop-operations.mjs';

const VIEW_ID = 'canvas:functional:node-local-failure';

export const canvasNodeLocalFailureScenario = Object.freeze({
  id: 'canvas-node-local-failure',
  owner: '@neko/canvas-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const boardsRoot = join(workspacePath, 'boards');
    await mkdir(boardsRoot, { recursive: true });
    await writeFile(
      join(boardsRoot, 'node-local-failure.nkc'),
      `${JSON.stringify(
        {
          name: 'Node-local failure',
          viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
          nodes: [
            {
              id: 'available-note',
              type: 'markdown',
              position: { x: 80, y: 80 },
              size: { width: 280, height: 180 },
              zIndex: 1,
              data: { content: '# Available sibling\n\nThis content remains readable.' },
            },
            {
              id: 'unavailable-generation',
              type: 'generation',
              position: { x: 420, y: 80 },
              size: { width: 300, height: 190 },
              zIndex: 2,
              data: {
                recipe: { kind: 'image', prompt: '' },
                outputs: [],
                phase: 'running',
              },
            },
          ],
          connections: [],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    return { workspacePath, documentId: 'boards/node-local-failure.nkc' };
  },
  async run({ checkpoint, click, evaluate, prepared, screenshot, waitForSelector }) {
    await resizeWindow(evaluate, 1200, 800);
    await waitForSelector('[data-primary-sidebar="application"]');
    await openFixtureWorkspace(evaluate);
    await replaceWorkbench(
      evaluate,
      `(projection, current, tab, project) => ({
        ...current,
        display: { ...current.display, mode: 'main-only' },
        main: {
          views: [{
            viewId: ${JSON.stringify(VIEW_ID)},
            viewInstanceId: tab.viewInstanceId,
            projectId: project.projectId,
            workspaceId: project.workspaceId,
            kind: 'canvas',
            ownerId: ${JSON.stringify(VIEW_ID)},
            displayLabel: 'node-local-failure.nkc',
            documentId: ${JSON.stringify(prepared.documentId)},
          }],
          groups: [{
            groupId: 'main:primary',
            viewIds: [${JSON.stringify(VIEW_ID)}],
            activeViewId: ${JSON.stringify(VIEW_ID)},
          }],
          activeGroupId: 'main:primary',
        },
      })`,
    );
    const viewSelector = `[data-owner-view-id="${VIEW_ID}"]`;
    await waitForSelector(`${viewSelector} [data-node-id="available-note"]`);
    await waitForSelector(
      `${viewSelector} [data-canvas-node-unavailable="unavailable-generation"]`,
    );

    const initial = await inspect(evaluate);
    if (
      initial.canvasRootCount !== 1 ||
      initial.availableSiblingCount !== 1 ||
      initial.unavailableNodeCount !== 1 ||
      (!initial.unavailableText.includes('节点的数据无效') &&
        !initial.unavailableText.includes('invalid data'))
    ) {
      throw new Error(
        `Canvas node-local failure projection is invalid: ${JSON.stringify(initial)}`,
      );
    }
    checkpoint('canvas-node-local-failure', initial);
    const initialScreenshot = await screenshot('canvas-node-local-failure');

    await click(`${viewSelector} [data-node-id="unavailable-generation"]`);
    const selected = await inspect(evaluate);
    if (
      selected.selectedUnavailableCount !== 1 ||
      selected.generationInputCount !== 0 ||
      selected.selectionActionCount !== 1 ||
      selected.deleteActionCount !== 1
    ) {
      throw new Error(
        `Unavailable Canvas node exposed executable controls: ${JSON.stringify(selected)}`,
      );
    }
    checkpoint('canvas-node-local-failure-selected', selected);
    const selectedScreenshot = await screenshot('canvas-node-local-failure-selected');

    await click(`${viewSelector} [data-selection-action="delete-selection"]`);
    const repaired = await inspect(evaluate);
    if (repaired.unavailableNodeCount !== 0 || repaired.availableSiblingCount !== 1) {
      throw new Error(`Unavailable Canvas node removal is invalid: ${JSON.stringify(repaired)}`);
    }
    checkpoint('canvas-node-local-failure-removed', repaired);

    return { initial, initialScreenshot, selected, selectedScreenshot, repaired };
  },
});

async function inspect(evaluate) {
  return evaluate(`(() => {
    const view = document.querySelector('[data-owner-view-id="${VIEW_ID}"]');
    if (!(view instanceof HTMLElement)) throw new Error('Canvas fixture View is unavailable.');
    const unavailable = view.querySelector('[data-canvas-node-unavailable="unavailable-generation"]');
    return {
      canvasRootCount:
        (view.matches('[data-owner-root="canvas"]') ? 1 : 0) +
        view.querySelectorAll('[data-owner-root="canvas"]').length,
      availableSiblingCount: view.querySelectorAll(
        '[data-node-id="available-note"][role="group"]'
      ).length,
      unavailableNodeCount: view.querySelectorAll('[data-canvas-node-unavailable]').length,
      unavailableText: unavailable?.textContent ?? '',
      selectedUnavailableCount: view.querySelectorAll(
        '[data-node-id="unavailable-generation"][data-node-selected="true"][role="group"]'
      ).length,
      generationInputCount: view.querySelectorAll('[data-canvas-generation-input="true"]').length,
      selectionActionCount: view.querySelectorAll('[data-selection-action]').length,
      deleteActionCount: view.querySelectorAll(
        '[data-selection-action="delete-selection"]'
      ).length,
    };
  })()`);
}

async function resizeWindow(evaluate, width, height) {
  await evaluate(`window.resizeTo(${String(width)}, ${String(height)})`);
}
