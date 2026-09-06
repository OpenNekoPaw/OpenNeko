import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  openFixtureWorkspace,
  replaceWorkbench,
} from '../../../../scripts/desktop-functional/desktop-operations.mjs';
import { createDesktopMediaFixtureSet } from '../../../../scripts/desktop-functional/media-fixtures.mjs';

const VIEW_ID = 'canvas:functional:reference-preview';
const REFERENCE = '[data-canvas-generation-reference-preview="image"]';

export const canvasGenerationReferencePreviewScenario = Object.freeze({
  id: 'canvas-generation-reference-preview',
  owner: '@neko/canvas-webview',
  async prepare({ fixtureHome, repositoryRoot }) {
    const workspacePath = join(fixtureHome, 'workspace');
    await mkdir(join(workspacePath, 'boards'), { recursive: true });
    const media = await createDesktopMediaFixtureSet(workspacePath);
    await copyFile(
      join(
        repositoryRoot,
        'scripts/agent-eval/shared-fixtures/document-image-workspace/synthetic-document.epub',
      ),
      join(workspacePath, 'source.epub'),
    );
    const locators = [
      { file: { authority: 'workspace', path: media.image } },
      {
        file: { authority: 'workspace', path: 'source.epub' },
        selector: { kind: 'entry', path: 'OEBPS/images/page-1.png' },
      },
      { file: { authority: 'workspace', path: 'missing-reference-with-long-name.png' } },
    ];
    const documentId = 'boards/reference-preview.nkc';
    await writeFile(
      join(workspacePath, documentId),
      JSON.stringify({
        name: 'Reference preview',
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        nodes: [
          {
            id: 'reference-owner',
            type: 'generation',
            position: { x: 200, y: 80 },
            size: { width: 240, height: 160 },
            zIndex: 1,
            data: {
              recipe: {
                kind: 'image',
                prompt: '参考图预览：工作区图片、EPUB 页面与失效资源。',
                count: 1,
              },
              outputs: [],
              inputMaterials: locators.map((locator) => ({ mediaKind: 'image', locator })),
            },
          },
        ],
        connections: [],
      }),
    );
    return { workspacePath, documentId };
  },
  async run({ evaluate, click, checkpoint, screenshot, waitForSelector, prepared }) {
    await evaluate('window.resizeTo(1200, 800)');
    await waitForSelector('[data-primary-sidebar="application"]');
    await openFixtureWorkspace(evaluate);
    await replaceWorkbench(
      evaluate,
      `(projection, current, tab, project) => ({ ...current,
      display: { ...current.display, mode: 'main-only' },
      main: { views: [{ viewId: '${VIEW_ID}', viewInstanceId: tab.viewInstanceId,
        projectId: project.projectId, workspaceId: project.workspaceId, kind: 'canvas', ownerId: '${VIEW_ID}',
        displayLabel: 'Reference preview', documentId: ${JSON.stringify(prepared.documentId)} }],
        groups: [{ groupId: 'main:primary', viewIds: ['${VIEW_ID}'], activeViewId: '${VIEW_ID}' }], activeGroupId: 'main:primary' }
    })`,
    );
    await waitForSelector('[data-node-id="reference-owner"]');
    await click('[data-node-id="reference-owner"]');
    await waitForSelector(REFERENCE);
    const ready = await inspect(evaluate);
    checkpoint('reference-preview-ready-and-local-failure', ready);
    const full = await screenshot('generation-reference-preview');
    await evaluate('window.resizeTo(900, 700)');
    const compact = await inspect(evaluate);
    const small = await screenshot('generation-reference-preview-small');
    return { ready, compact, screenshots: [full, small] };
  },
});

async function inspect(evaluate) {
  return evaluate(`(async () => {
    for (let attempt = 0; attempt < 80; attempt++) {
      const tiles = [...document.querySelectorAll('${REFERENCE}')];
      const images = tiles.flatMap(tile => [...tile.querySelectorAll('img')]);
      const errors = tiles.flatMap(tile => [...tile.querySelectorAll('[role="alert"]')]);
      if (tiles.length === 3 && images.length === 2 && images.every(image => image.complete && image.naturalWidth > 0) && errors.length === 1) {
        if (errors[0].textContent.trim() || !errors[0].getAttribute('title')) throw new Error('Thumbnail diagnostic is not compact and accessible.');
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { tiles: tiles.length, imageSizes: images.map(image => [image.naturalWidth, image.naturalHeight]),
          errorTitle: errors[0].getAttribute('title'), errorText: errors[0].textContent,
          bounds: tiles.map(tile => { const rect = tile.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; }) };
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Generation references did not settle into two images and one local diagnostic.');
  })()`);
}
