import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  openFixtureWorkspace,
  replaceWorkbench,
} from '../../../../scripts/desktop-functional/desktop-operations.mjs';

export const canvasTextFilePreviewScenario = Object.freeze({
  id: 'canvas-text-file-preview',
  owner: '@neko/canvas-webview',
  async prepare({ fixtureHome }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const boardsRoot = join(workspacePath, 'boards');
    const dataRoot = join(workspacePath, 'data');
    await Promise.all([
      mkdir(boardsRoot, { recursive: true }),
      mkdir(dataRoot, { recursive: true }),
      mkdir(join(fixtureHome, '.neko'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        join(boardsRoot, 'text-files.nkc'),
        `${JSON.stringify(textFileCanvasDocument(), null, 2)}\n`,
      ),
      writeFile(join(dataRoot, 'project.json'), '{"name":"OpenNeko","ready":true}\n'),
      writeFile(
        join(dataRoot, 'notes.md'),
        ['# Referenced Markdown', '', 'This content is rendered read-only.'].join('\n'),
      ),
      writeFile(join(dataRoot, 'notes.txt'), 'first line\nsecond line\n'),
      writeFile(join(dataRoot, 'empty.txt'), ''),
      writeFile(join(dataRoot, 'invalid.json'), '{"broken":\n'),
      writeFile(join(dataRoot, 'archive.bin'), new Uint8Array([0, 1, 2, 3])),
    ]);
    return { workspacePath, documentId: 'boards/text-files.nkc' };
  },
  async run({ checkpoint, click, evaluate, prepared, pressKey, screenshot, waitForSelector }) {
    await evaluate('window.resizeTo(1440, 900)');
    await waitForSelector('[data-primary-sidebar="application"]');
    await openFixtureWorkspace(evaluate);
    await replaceWorkbench(
      evaluate,
      `(projection, current, tab, project) => ({
        ...current,
        display: { ...current.display, mode: 'main-only' },
        main: {
          views: [{
            viewId: 'canvas:functional:text-files',
            viewInstanceId: tab.viewInstanceId,
            projectId: project.projectId,
            workspaceId: project.workspaceId,
            kind: 'canvas',
            ownerId: 'canvas:functional:text-files',
            displayLabel: 'text-files.nkc',
            documentId: ${JSON.stringify(prepared.documentId)},
          }],
          groups: [{
            groupId: 'main:primary',
            viewIds: ['canvas:functional:text-files'],
            activeViewId: 'canvas:functional:text-files',
          }],
          activeGroupId: 'main:primary',
        },
      })`,
    );
    const view = '[data-owner-view-id="canvas:functional:text-files"]';
    await waitForSelector(`${view}[data-owner-root="canvas"]`);
    await waitForSelector(
      `${view} [data-node-id="file-json"] [data-text-preview-status="ready"][data-text-preview-kind="json"]`,
    );
    await waitForSelector(
      `${view} [data-node-id="file-markdown"] [data-text-preview-status="ready"][data-text-preview-kind="markdown"] [data-markdown-document="ready"]`,
    );
    await waitForSelector(
      `${view} [data-node-id="file-plain"] [data-text-preview-status="ready"][data-text-preview-kind="plain"]`,
    );
    await waitForSelector(
      `${view} [data-node-id="file-empty"] [data-text-preview-status="ready"] [role="status"]`,
    );
    await waitForSelector(
      `${view} [data-node-id="file-invalid-json"] [data-text-preview-status="unavailable"]`,
    );
    await fitCanvasContent(evaluate);
    await click(`${view} [data-node-id="file-json"]`);
    await waitForSelector(`${view} [data-selection-action="text:edit"]`);
    await waitForSelector(`${view} [data-selection-action="preview:open"]`);
    const desktop = await inspectTextFilePreviews(evaluate);
    assertTextFilePreviews(desktop);
    const desktopActions = await inspectTextFileActions(evaluate);
    assertTextFileActions(desktopActions);
    checkpoint('canvas-text-file-actions-desktop', desktopActions);
    checkpoint('canvas-text-file-preview-desktop', desktop);
    const desktopScreenshot = await screenshot('canvas-text-file-preview-desktop-selected');
    await click(`${view} [data-canvas-viewport-root="true"]`, 0, {
      xRatio: 0.96,
      yRatio: 0.16,
    });
    await evaluate('window.resizeTo(960, 700)');
    await fitCanvasContent(evaluate);
    await pressKey('Escape');
    await evaluate('new Promise((resolve) => setTimeout(resolve, 250))');
    const narrow = await inspectTextFilePreviews(evaluate);
    assertTextFilePreviews(narrow, false);
    if (narrow.viewportWidth > 960 || narrow.nodesOutsideViewport !== 0) {
      throw new Error(`Canvas narrow text File layout is invalid: ${JSON.stringify(narrow)}`);
    }
    checkpoint('canvas-text-file-preview-narrow', narrow);
    const narrowScreenshot = await screenshot('canvas-text-file-preview-narrow');
    await click(`${view} [data-node-id="file-markdown"]`);
    await waitForSelector(`${view} [data-selection-action="text:edit"]`);
    const narrowActions = await inspectTextFileActions(evaluate);
    assertTextFileActions(narrowActions);
    checkpoint('canvas-text-file-actions-narrow', narrowActions);
    const narrowActionsScreenshot = await screenshot('canvas-text-file-actions-narrow');
    await click(`${view} [data-selection-action="text:edit"]`);
    await waitForSelector('.neko-text-editor-root[data-document-mode="markdown"]');
    await evaluate('new Promise((resolve) => setTimeout(resolve, 500))');
    const textEditorHandoff = await evaluate(`(() => ({
      textEditorRootCount: document.querySelectorAll(
        '.neko-text-editor-root[data-document-mode="markdown"]',
      ).length,
      canvasRootCount: document.querySelectorAll('[data-owner-root="canvas"]').length,
      documentText: document.querySelector('.neko-text-editor-root')?.textContent ?? '',
    }))()`);
    if (
      textEditorHandoff.textEditorRootCount !== 1 ||
      textEditorHandoff.canvasRootCount !== 0 ||
      !textEditorHandoff.documentText.includes('Referenced Markdown')
    ) {
      throw new Error(
        `Canvas Text Editor handoff is invalid: ${JSON.stringify(textEditorHandoff)}`,
      );
    }
    checkpoint('canvas-text-file-edit-handoff', textEditorHandoff);
    const textEditorHandoffScreenshot = await screenshot('canvas-text-file-edit-handoff');
    return {
      desktop,
      desktopActions,
      desktopScreenshot,
      narrow,
      narrowActions,
      narrowScreenshot,
      narrowActionsScreenshot,
      textEditorHandoff,
      textEditorHandoffScreenshot,
    };
  },
  assertObservation(_observation, evidence) {
    assertTextFilePreviews(evidence.desktop);
    assertTextFilePreviews(evidence.narrow, false);
    assertTextFileActions(evidence.desktopActions);
    assertTextFileActions(evidence.narrowActions);
    if (evidence.narrow.nodesOutsideViewport !== 0) {
      throw new Error('Canvas text File preview nodes escaped the narrow viewport.');
    }
    if (
      evidence.textEditorHandoff.textEditorRootCount !== 1 ||
      evidence.textEditorHandoff.canvasRootCount !== 0
    ) {
      throw new Error('Canvas text File action did not hand off to one Text Editor Root.');
    }
  },
});

function textFileCanvasDocument() {
  return {
    name: 'Text File Preview',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [
      textFileNode('file-json', 'data/project.json', 'application/json', 40, 40),
      textFileNode('file-markdown', 'data/notes.md', 'text/markdown', 340, 40),
      textFileNode('file-plain', 'data/notes.txt', 'text/plain', 640, 40),
      textFileNode('file-empty', 'data/empty.txt', 'text/plain', 40, 260),
      textFileNode('file-invalid-json', 'data/invalid.json', 'application/json', 340, 260),
      textFileNode('file-unsupported', 'data/archive.bin', 'application/octet-stream', 640, 260),
    ],
    connections: [],
  };
}

function textFileNode(id, path, mediaType, x, y) {
  return {
    id,
    type: 'file',
    position: { x, y },
    size: { width: 280, height: 180 },
    zIndex: 1,
    data: {
      title: path.split('/').at(-1) ?? path,
      path,
      mediaType,
      contentLocator: { kind: 'workspace-file', path },
    },
  };
}

function inspectTextFilePreviews(evaluate) {
  return evaluate(`(() => {
    const view = document.querySelector('[data-owner-view-id="canvas:functional:text-files"]');
    if (!(view instanceof HTMLElement)) throw new Error('Canvas text File View is unavailable.');
    const jsonNode = view.querySelector('[data-node-id="file-json"]');
    const markdownNode = view.querySelector('[data-node-id="file-markdown"]');
    const plainNode = view.querySelector('[data-node-id="file-plain"]');
    const emptyNode = view.querySelector('[data-node-id="file-empty"]');
    const invalidNode = view.querySelector('[data-node-id="file-invalid-json"]');
    const unsupportedNode = view.querySelector('[data-node-id="file-unsupported"]');
    const jsonCard = jsonNode?.querySelector('.node-card');
    const jsonPreview = jsonNode?.querySelector('.canvas-file-node__preview');
    if (
      !(jsonNode instanceof HTMLElement) ||
      !(markdownNode instanceof HTMLElement) ||
      !(plainNode instanceof HTMLElement) ||
      !(emptyNode instanceof HTMLElement) ||
      !(invalidNode instanceof HTMLElement) ||
      !(unsupportedNode instanceof HTMLElement) ||
      !(jsonCard instanceof HTMLElement) ||
      !(jsonPreview instanceof HTMLElement)
    ) {
      throw new Error('Canvas text File preview fixture is incomplete.');
    }
    const cardStyle = getComputedStyle(jsonCard);
    const nodeBounds = [...view.querySelectorAll('[data-node-id]')].map((node) => ({
      id: node.getAttribute('data-node-id'),
      bounds: node.getBoundingClientRect(),
    }));
    const nodesOutsideViewport = nodeBounds.filter(
      ({ bounds }) =>
        bounds.left < 0 ||
        bounds.top < 0 ||
        bounds.right > window.innerWidth ||
        bounds.bottom > window.innerHeight,
    );
    return {
      jsonText: jsonNode.querySelector('.canvas-file-node__text')?.textContent ?? '',
      markdownText: markdownNode.querySelector('.canvas-file-node__markdown')?.textContent ?? '',
      markdownEditorCount: markdownNode.querySelectorAll(
        'textarea, .ProseMirror, [contenteditable="true"]',
      ).length,
      plainText: plainNode.querySelector('.canvas-file-node__text')?.textContent ?? '',
      emptyStatus: emptyNode
        .querySelector('.canvas-file-node')
        ?.getAttribute('data-text-preview-status'),
      emptyText: emptyNode.querySelector('[role="status"]')?.textContent?.trim() ?? '',
      invalidStatus: invalidNode
        .querySelector('.canvas-file-node')
        ?.getAttribute('data-text-preview-status'),
      invalidText: invalidNode.querySelector('[role="status"]')?.textContent?.trim() ?? '',
      unsupportedPreviewStatus: unsupportedNode
        .querySelector('.canvas-file-node')
        ?.getAttribute('data-text-preview-status'),
      unsupportedIconCount: unsupportedNode.querySelectorAll('.canvas-file-node__content svg').length,
      selected: jsonNode.getAttribute('data-node-selected') === 'true',
      selectedNodeIds: [...view.querySelectorAll('[data-node-selected="true"]')].map((node) =>
        node.getAttribute('data-node-id'),
      ),
      nodeBackgroundColor: cardStyle.backgroundColor,
      previewBackgroundColor: getComputedStyle(jsonPreview).backgroundColor,
      borderColor: cardStyle.borderColor,
      outlineWidth: cardStyle.outlineWidth,
      boxShadow: cardStyle.boxShadow,
      viewportWidth: window.innerWidth,
      nodesOutsideViewport: nodesOutsideViewport.length,
      outsideNodeBounds: nodesOutsideViewport.map(({ id, bounds }) => ({
        id,
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
      })),
    };
  })()`);
}

function assertTextFilePreviews(evidence, expectedSelected = true) {
  if (
    !evidence.jsonText.includes('"name": "OpenNeko"') ||
    !evidence.markdownText.includes('Referenced Markdown') ||
    evidence.markdownEditorCount !== 0 ||
    !evidence.plainText.includes('first line\nsecond line') ||
    evidence.emptyStatus !== 'ready' ||
    !evidence.emptyText ||
    evidence.invalidStatus !== 'unavailable' ||
    !evidence.invalidText ||
    evidence.unsupportedPreviewStatus !== null ||
    evidence.unsupportedIconCount !== 1 ||
    evidence.selected !== expectedSelected ||
    (expectedSelected
      ? evidence.selectedNodeIds.join('|') !== 'file-json'
      : evidence.selectedNodeIds.length !== 0) ||
    evidence.nodeBackgroundColor !== 'rgb(255, 255, 255)' ||
    evidence.previewBackgroundColor !== 'rgba(0, 0, 0, 0)' ||
    (expectedSelected && evidence.outlineWidth !== '2px') ||
    evidence.boxShadow === 'none' ||
    evidence.nodesOutsideViewport !== 0
  ) {
    throw new Error(
      `Canvas text File preview presentation is invalid: ${JSON.stringify(evidence)}`,
    );
  }
}

function inspectTextFileActions(evaluate) {
  return evaluate(`(() => {
    const view = document.querySelector('[data-owner-view-id="canvas:functional:text-files"]');
    if (!(view instanceof HTMLElement)) throw new Error('Canvas text File View is unavailable.');
    const toolbar = view.querySelector('[data-selection-context-toolbar="true"]');
    if (!(toolbar instanceof HTMLElement)) throw new Error('Canvas text File toolbar is unavailable.');
    return {
      actionIds: [...toolbar.querySelectorAll('[data-selection-action-location="primary"]')].map(
        (element) => element.getAttribute('data-selection-action'),
      ),
      overflowActionIds:
        toolbar
          .querySelector('[data-selection-overflow]')
          ?.getAttribute('data-selection-overflow-actions')
          ?.split(' ')
          .filter(Boolean) ?? [],
      label: toolbar.querySelector('[data-selection-kind-label]')?.textContent?.trim() ?? '',
      hasError: toolbar.querySelector('[data-material-actions-status="error"]') !== null,
      viewportWidth: window.innerWidth,
    };
  })()`);
}

function assertTextFileActions(evidence) {
  if (
    evidence.actionIds.join('|') !== 'text:edit|node:duplicate|preview:open' ||
    evidence.overflowActionIds.length !== 0 ||
    !['File', '文件'].includes(evidence.label) ||
    evidence.hasError
  ) {
    throw new Error(`Canvas text File actions are invalid: ${JSON.stringify(evidence)}`);
  }
}

async function fitCanvasContent(evaluate) {
  await evaluate(`(() => {
    const view = document.querySelector('[data-owner-view-id="canvas:functional:text-files"]');
    const fit = [...(view?.querySelectorAll('button[aria-label]') ?? [])].find((button) =>
      ['适应内容', 'Fit content'].includes(button.getAttribute('aria-label') ?? ''),
    );
    if (!(fit instanceof HTMLButtonElement)) throw new Error('Canvas fit control is unavailable.');
    fit.click();
  })()`);
  await evaluate('new Promise((resolve) => setTimeout(resolve, 250))');
}
