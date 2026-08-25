import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  openFixtureWorkspace,
  readFetchStatus,
  replaceWorkbench,
} from '../../../../scripts/desktop-functional/desktop-operations.mjs';
import { createDesktopMediaFixtureSet } from '../../../../scripts/desktop-functional/media-fixtures.mjs';

export const canvasOpenNekoConsumerScenario = Object.freeze({
  id: 'canvas-openneko-consumer',
  owner: '@neko/canvas-webview',
  async prepare({ fixtureHome, repositoryRoot }) {
    const workspacePath = join(fixtureHome, 'workspace');
    const boardsRoot = join(workspacePath, 'boards');
    const configRoot = join(fixtureHome, '.neko');
    await Promise.all([
      mkdir(boardsRoot, { recursive: true }),
      mkdir(configRoot, { recursive: true }),
    ]);
    const media = await createDesktopMediaFixtureSet(workspacePath);
    await copyFile(
      join(
        repositoryRoot,
        'scripts',
        'agent-eval',
        'shared-fixtures',
        'document-image-workspace',
        'synthetic-document.epub',
      ),
      join(workspacePath, 'synthetic-document.epub'),
    );
    await Promise.all([
      writeFile(
        join(configRoot, 'config.toml'),
        [
          '[default_models.llm]',
          'provider_id = "canvas-functional"',
          'model_id = "canvas-text"',
          '',
          '[default_models.image]',
          'provider_id = "canvas-functional"',
          'model_id = "canvas-image"',
          '',
          '[default_models.video]',
          'provider_id = "canvas-functional"',
          'model_id = "canvas-video"',
          '',
          '[default_models.audio]',
          'provider_id = "canvas-functional"',
          'model_id = "canvas-audio"',
          '',
          '[default_model_purposes.audio_music_generate]',
          'provider_id = "canvas-functional"',
          'model_id = "canvas-music"',
          '',
          '[[providers]]',
          'id = "canvas-functional"',
          'name = "Canvas Functional"',
          'type = "generic"',
          'api_url = "http://127.0.0.1:1/api"',
          'enabled = true',
          'connection_kind = "local"',
          'requires_api_key = false',
          '',
          '[[models]]',
          'id = "canvas-text"',
          'name = "Canvas Text"',
          'provider_id = "canvas-functional"',
          'type = "llm"',
          'capabilities = ["chat"]',
          'enabled = true',
          '',
          '[[models]]',
          'id = "canvas-image"',
          'name = "Canvas Image"',
          'provider_id = "canvas-functional"',
          'type = "image"',
          'capabilities = ["image.generate"]',
          'enabled = true',
          '',
          '[[models]]',
          'id = "canvas-video"',
          'name = "Canvas Video"',
          'provider_id = "canvas-functional"',
          'type = "video"',
          'capabilities = ["video.generate"]',
          'enabled = true',
          '',
          '[[models]]',
          'id = "canvas-audio"',
          'name = "Canvas Audio"',
          'provider_id = "canvas-functional"',
          'type = "audio"',
          'capabilities = ["audio.generate"]',
          'enabled = true',
          '',
          '[[models]]',
          'id = "canvas-music"',
          'name = "Canvas Music"',
          'provider_id = "canvas-functional"',
          'type = "audio"',
          'capabilities = ["audio.music.generate"]',
          'enabled = true',
          '',
        ].join('\n'),
        { encoding: 'utf8', mode: 0o600 },
      ),
      writeFile(
        join(boardsRoot, 'video.nkc'),
        `${JSON.stringify(
          canvasDocument(
            'Video View',
            'video-node',
            media.webm,
            'video',
            [cutDocumentNode('cut-document-node', 'story.otio'), epubImageNode('epub-image-node')],
            denseConnectionFixture(),
          ),
          null,
          2,
        )}\n`,
      ),
      writeFile(
        join(boardsRoot, 'audio.nkc'),
        `${JSON.stringify(
          canvasDocument('Audio View', 'audio-node', media.audio, 'audio', [
            markdownNode('markdown-node'),
            textFileNode('text-file-node', 'copied-reference.md'),
          ]),
          null,
          2,
        )}\n`,
      ),
      writeFile(join(workspacePath, 'story.otio'), `${JSON.stringify(emptyOtioDocument())}\n`),
      writeFile(
        join(workspacePath, 'copied-reference.md'),
        '# Copied reference\n\nThis file preview must remain available immediately after duplication.\n',
      ),
    ]);
    return {
      workspacePath,
      videoDocumentId: 'boards/video.nkc',
      audioDocumentId: 'boards/audio.nkc',
    };
  },
  async run({
    checkpoint,
    click,
    drag,
    evaluate,
    hover,
    prepared,
    pressKey,
    restartApplication,
    screenshot,
    scroll,
    waitForSelector,
  }) {
    await resizeWindow(evaluate, 1200, 800);
    await waitForSelector('[data-primary-sidebar="application"]');
    const unifiedWorkbench = await evaluate(`(() => ({
      shellCount: document.querySelectorAll('[data-neko-controlled-workbench="true"]').length,
      primarySidebarCount: document.querySelectorAll('[data-primary-sidebar="application"]').length,
    }))()`);
    checkpoint('unified-workbench-entry', unifiedWorkbench);
    const unifiedWorkbenchScreenshot = await screenshot('unified-workbench-entry');
    await openFixtureWorkspace(evaluate);
    await replaceWorkbench(
      evaluate,
      `(projection, current, tab, project) => ({
        ...current,
        display: { ...current.display, mode: 'main-only' },
        main: {
          views: [
            {
              viewId: 'canvas:functional:video',
              viewInstanceId: tab.viewInstanceId,
              projectId: project.projectId,
              workspaceId: project.workspaceId,
              kind: 'canvas',
              ownerId: 'canvas:functional:video',
              displayLabel: 'video.nkc',
              documentId: ${JSON.stringify(prepared.videoDocumentId)},
            },
            {
              viewId: 'canvas:functional:audio',
              viewInstanceId: tab.viewInstanceId,
              projectId: project.projectId,
              workspaceId: project.workspaceId,
              kind: 'canvas',
              ownerId: 'canvas:functional:audio',
              displayLabel: 'audio.nkc',
              documentId: ${JSON.stringify(prepared.audioDocumentId)},
            },
          ],
          groups: [
            {
              groupId: 'main:primary',
              viewIds: ['canvas:functional:video'],
              activeViewId: 'canvas:functional:video',
            },
            {
              groupId: 'main:secondary',
              viewIds: ['canvas:functional:audio'],
              activeViewId: 'canvas:functional:audio',
            },
          ],
          activeGroupId: 'main:primary',
          split: { axis: 'columns', ratio: 0.5 },
        },
      })`,
    );
    await waitForSelector('[data-owner-root="canvas"]');
    await waitForCanvasRoots(evaluate);
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-testid="canvas-media-node"][data-media-type="video"]',
    );
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-node-presentation][data-node-id="epub-image-node"] img',
    );
    await evaluate(`(() => {
      const view = document.querySelector('[data-owner-view-id="canvas:functional:audio"]');
      const control = [...(view?.querySelectorAll('button[aria-label]') ?? [])].find((button) =>
        ['适应内容', 'Fit content'].includes(button.getAttribute('aria-label') ?? ''),
      );
      if (!(control instanceof HTMLButtonElement)) {
        throw new Error('Canvas fit-content control is unavailable for Markdown validation.');
      }
      control.click();
    })()`);
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:audio"] [data-node-presentation][data-node-id="markdown-node"] [data-markdown-document="ready"]',
    );
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:audio"] [data-node-presentation][data-node-id="text-file-node"] [data-text-preview-status="ready"]',
    );
    await waitForCondition(
      evaluate,
      `(() => {
        const image = document.querySelector(
          '[data-owner-view-id="canvas:functional:video"] [data-node-presentation][data-node-id="epub-image-node"] img'
        );
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
      })()`,
      'Canvas EPUB document-entry image did not decode.',
    );
    const epubImageProjection = await evaluate(`(() => {
      const image = document.querySelector(
        '[data-owner-view-id="canvas:functional:video"] [data-node-presentation][data-node-id="epub-image-node"] img'
      );
      if (!(image instanceof HTMLImageElement)) throw new Error('Canvas EPUB image is unavailable.');
      return {
        src: image.currentSrc || image.src,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        objectFit: getComputedStyle(image).objectFit,
      };
    })()`);
    if (
      !epubImageProjection.src.startsWith('openneko://resource/') ||
      !epubImageProjection.complete ||
      epubImageProjection.naturalWidth <= 0 ||
      epubImageProjection.naturalHeight <= 0 ||
      epubImageProjection.objectFit !== 'contain'
    ) {
      throw new Error(
        `Canvas EPUB image projection is invalid: ${JSON.stringify(epubImageProjection)}`,
      );
    }
    const epubResourceStatus = await readFetchStatus(evaluate, epubImageProjection.src);
    if (epubResourceStatus !== 200) {
      throw new Error(`Canvas EPUB image resource returned ${String(epubResourceStatus)}.`);
    }
    checkpoint('canvas-epub-document-entry-image', {
      ...epubImageProjection,
      resourceStatus: epubResourceStatus,
    });
    const epubImageScreenshot = await screenshot('canvas-epub-document-entry-image');
    await click(
      '[data-owner-view-id="canvas:functional:audio"] [data-node-presentation][data-node-id="text-file-node"]',
    );
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:audio"] [data-selection-action="node:duplicate"]',
    );
    await click(
      '[data-owner-view-id="canvas:functional:audio"] [data-selection-action="node:duplicate"]',
    );
    const duplicatedFilePreview = await waitForCopiedFilePreview(evaluate);
    checkpoint('canvas-copied-file-preview-ready', duplicatedFilePreview);
    const duplicatedFilePreviewScreenshot = await screenshot('canvas-copied-file-preview-ready');
    const markdownSelector =
      '[data-owner-view-id="canvas:functional:audio"] [data-node-presentation][data-node-id="markdown-node"]';
    const markdownPreview = await inspectCanvasMarkdownNode(evaluate, markdownSelector);
    if (
      markdownPreview.editing ||
      markdownPreview.textareaCount !== 0 ||
      markdownPreview.proseMirrorCount !== 0 ||
      markdownPreview.wheelOwner !== 'content' ||
      markdownPreview.scrollHeight <= markdownPreview.clientHeight ||
      markdownPreview.headingSize > 18 ||
      markdownPreview.width > 262 ||
      markdownPreview.height > 182
    ) {
      throw new Error(
        `Canvas Markdown compact preview is invalid: ${JSON.stringify(markdownPreview)}`,
      );
    }
    const markdownPreviewScreenshot = await screenshot('canvas-markdown-node-compact-preview');
    await scroll(`${markdownSelector} .canvas-markdown-node__preview`, 0, { deltaY: 120 });
    await evaluate('new Promise((resolve) => setTimeout(resolve, 100))');
    const markdownScrolled = await inspectCanvasMarkdownNode(evaluate, markdownSelector);
    if (
      markdownScrolled.scrollTop <= markdownPreview.scrollTop ||
      Math.abs(markdownScrolled.left - markdownPreview.left) > 0.5 ||
      Math.abs(markdownScrolled.top - markdownPreview.top) > 0.5
    ) {
      throw new Error(
        `Canvas Markdown wheel ownership is invalid: ${JSON.stringify({ before: markdownPreview, after: markdownScrolled })}`,
      );
    }
    checkpoint('canvas-markdown-node-nested-scroll', {
      before: markdownPreview,
      after: markdownScrolled,
    });
    const markdownScrolledScreenshot = await screenshot('canvas-markdown-node-nested-scroll');
    await click(markdownSelector);
    const selectedMarkdownPreview = await inspectCanvasMarkdownNode(evaluate, markdownSelector);
    if (
      selectedMarkdownPreview.editing ||
      selectedMarkdownPreview.textareaCount !== 0 ||
      selectedMarkdownPreview.proseMirrorCount !== 0
    ) {
      throw new Error(
        `Canvas Markdown selection mounted a mutable editor: ${JSON.stringify(selectedMarkdownPreview)}`,
      );
    }
    const markdownActions = await inspectCanvasSelectionActions(
      evaluate,
      'canvas:functional:audio',
    );
    if (
      markdownActions.actionIds.join('|') !== 'canvas:edit-markdown|node:duplicate|preview:open' ||
      markdownActions.disabledActionIds.length !== 0 ||
      markdownActions.overflowActionIds.length !== 0
    ) {
      throw new Error(`Canvas Markdown actions are invalid: ${JSON.stringify(markdownActions)}`);
    }
    const markdownEditorContextBefore = await inspectCanvasSelectionAndViewport(
      evaluate,
      'canvas:functional:audio',
    );
    await click(
      '[data-owner-view-id="canvas:functional:audio"] [data-selection-action="canvas:edit-markdown"]',
    );
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:audio"] [data-canvas-markdown-editor="true"] .ProseMirror[contenteditable="true"]',
    );
    const markdownEditing = await inspectCanvasMarkdownEditor(evaluate, 'canvas:functional:audio');
    if (
      markdownEditing.overlayCount !== 1 ||
      markdownEditing.modal !== 'true' ||
      markdownEditing.editorState !== 'ready' ||
      markdownEditing.canvasInteractionSuspended !== 'true' ||
      markdownEditing.nodeProseMirrorCount !== 0 ||
      markdownEditing.editorProseMirrorCount !== 1 ||
      markdownEditing.contentEditable !== 'true' ||
      markdownEditing.wheelOwner !== 'content' ||
      markdownEditing.overlayWidth < markdownEditing.viewportWidth - 1 ||
      markdownEditing.overlayHeight < markdownEditing.viewportHeight - 1 ||
      !markdownEditing.text.includes('这是一个紧凑的画布分析节点')
    ) {
      throw new Error(
        `Canvas Markdown immersive editing is invalid: ${JSON.stringify(markdownEditing)}`,
      );
    }
    const markdownEditingScreenshot = await screenshot('canvas-markdown-immersive-editing');
    await scroll(
      '[data-owner-view-id="canvas:functional:audio"] .canvas-markdown-editor-overlay__body',
      0,
      { deltaY: 180 },
    );
    await evaluate('new Promise((resolve) => setTimeout(resolve, 100))');
    const markdownEditorScrolled = await inspectCanvasMarkdownEditor(
      evaluate,
      'canvas:functional:audio',
    );
    if (
      markdownEditorScrolled.scrollTop <= markdownEditing.scrollTop ||
      markdownEditorScrolled.viewportTransform !== markdownEditing.viewportTransform
    ) {
      throw new Error(
        `Canvas Markdown immersive scroll changed the Canvas viewport: ${JSON.stringify({ before: markdownEditing, after: markdownEditorScrolled })}`,
      );
    }
    await evaluate(`(() => {
      const editor = document.querySelector(
        '[data-owner-view-id="canvas:functional:audio"] [data-canvas-markdown-editor="true"] .ProseMirror[contenteditable="true"]',
      );
      if (!(editor instanceof HTMLElement)) throw new Error('Canvas Markdown editor is unavailable.');
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
      if (!document.execCommand('insertText', false, ' 沉浸式编辑验收')) {
        throw new Error('Canvas Markdown editor rejected inserted text.');
      }
    })()`);
    await evaluate('new Promise((resolve) => setTimeout(resolve, 100))');
    const markdownEdited = await inspectCanvasMarkdownEditor(evaluate, 'canvas:functional:audio');
    if (!markdownEdited.text.includes('沉浸式编辑验收')) {
      throw new Error(
        `Canvas Markdown edit did not update the Rich Surface: ${JSON.stringify(markdownEdited)}`,
      );
    }
    await click(
      '[data-owner-view-id="canvas:functional:audio"] [data-canvas-markdown-editor-action="close"]',
    );
    await waitForSelector(`${markdownSelector} [data-markdown-document="ready"]`);
    const markdownEditorContextAfter = await inspectCanvasSelectionAndViewport(
      evaluate,
      'canvas:functional:audio',
    );
    const markdownAfterEdit = await inspectCanvasMarkdownNode(evaluate, markdownSelector);
    if (
      JSON.stringify(markdownEditorContextAfter) !== JSON.stringify(markdownEditorContextBefore) ||
      !markdownAfterEdit.text.includes('沉浸式编辑验收')
    ) {
      throw new Error(
        `Canvas Markdown immersive editor did not preserve return state: ${JSON.stringify({ markdownEditorContextBefore, markdownEditorContextAfter, markdownAfterEdit })}`,
      );
    }
    await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(markdownSelector)});
      if (!(node instanceof HTMLElement)) throw new Error('Canvas Markdown node is unavailable.');
      node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    })()`);
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:audio"] [data-canvas-markdown-editor="true"]',
    );
    await pressKey('Escape');
    await waitForSelector(`${markdownSelector} [data-markdown-document="ready"]`);
    await pressKey('Escape');
    checkpoint('canvas-markdown-immersive-editor', {
      preview: markdownPreview,
      selectedPreview: selectedMarkdownPreview,
      actions: markdownActions,
      editing: markdownEditing,
      scrolled: markdownEditorScrolled,
      edited: markdownEdited,
      afterEdit: markdownAfterEdit,
      contextBefore: markdownEditorContextBefore,
      contextAfter: markdownEditorContextAfter,
    });
    await evaluate(`(() => {
      const view = document.querySelector('[data-owner-view-id="canvas:functional:video"]');
      const control = [...(view?.querySelectorAll('button[aria-label]') ?? [])].find((button) =>
        ['适应内容', 'Fit content'].includes(button.getAttribute('aria-label') ?? ''),
      );
      if (!(control instanceof HTMLButtonElement)) {
        throw new Error('Canvas fit-content control is unavailable for connection validation.');
      }
      control.click();
    })()`);
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] .connection-group .connection-line',
    );
    const quietConnections = await inspectCanvasConnectionVisuals(
      evaluate,
      'canvas:functional:video',
    );
    if (
      quietConnections.connectionCount !== 6 ||
      quietConnections.maximumLineOpacity > 0.38 ||
      quietConnections.flowDotCount !== 0
    ) {
      throw new Error(
        `Canvas ordinary connection visuals are not subdued: ${JSON.stringify(quietConnections)}`,
      );
    }
    const quietConnectionsScreenshot = await screenshot('canvas-connections-quiet-default');
    await evaluate(`(() => {
      const view = document.querySelector('[data-owner-view-id="canvas:functional:video"]');
      const hitPath = view?.querySelector('.connection-group path[stroke="transparent"]');
      if (!(hitPath instanceof SVGPathElement)) {
        throw new Error('Canvas connection hit target is unavailable.');
      }
      hitPath.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    })()`);
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] .connection-group[data-selected="true"]',
    );
    const selectedConnectionVisual = await inspectCanvasConnectionVisuals(
      evaluate,
      'canvas:functional:video',
    );
    if (
      selectedConnectionVisual.selectedCount !== 1 ||
      selectedConnectionVisual.selectedLineOpacity !== 0.88 ||
      selectedConnectionVisual.flowDotCount !== 0
    ) {
      throw new Error(
        `Canvas selected connection feedback is invalid: ${JSON.stringify(selectedConnectionVisual)}`,
      );
    }
    const selectedConnectionScreenshot = await screenshot('canvas-connection-selected-emphasis');
    await pressKey('Escape');
    checkpoint('canvas-connection-visual-hierarchy', {
      quiet: quietConnections,
      selected: selectedConnectionVisual,
    });
    await waitForInteractiveSelector(
      evaluate,
      '[data-owner-view-id="canvas:functional:video"] [data-canvas-toolbar-action="open-add-node-popover"]',
    );
    const generationAuthoring = await exerciseCanvasGenerationAuthoring({
      click,
      drag,
      evaluate,
      screenshot,
      viewId: 'canvas:functional:video',
      waitForSelector,
    });
    const authoredNodeCount = generationAuthoring.maximumNodeCount;
    checkpoint('canvas-generation-authoring', generationAuthoring);
    await evaluate(`(() => {
      const view = document.querySelector('[data-owner-view-id="canvas:functional:video"]');
      const control = [...(view?.querySelectorAll('button[aria-label]') ?? [])].find((button) =>
        ['适应内容', 'Fit content'].includes(button.getAttribute('aria-label') ?? ''),
      );
      if (!(control instanceof HTMLButtonElement)) {
        throw new Error('Canvas fit-content control is unavailable.');
      }
      control.click();
    })()`);
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-node-presentation][data-node-id="video-node"]',
    );
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-node-presentation][data-node-id="video-node"]',
      0,
      { xRatio: 0.5, yRatio: 0.95 },
    );
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-selection-action="preview:open"]',
    );
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-selection-action="cut:add-resource"]',
    );
    const selectedNodePresentation = await evaluate(`(() => {
      const view = document.querySelector('[data-owner-view-id="canvas:functional:video"]');
      if (!(view instanceof HTMLElement)) throw new Error('Canvas View is unavailable.');
      return {
        nodeLocalActionCount: view.querySelectorAll('[data-selection-action]').length,
        propertyDockCount: view.querySelectorAll('.neko-creative-workbench-right-panel').length,
      };
    })()`);
    if (
      selectedNodePresentation.nodeLocalActionCount === 0 ||
      selectedNodePresentation.propertyDockCount !== 0
    ) {
      throw new Error(
        `Canvas selected-node presentation is invalid: ${JSON.stringify(selectedNodePresentation)}`,
      );
    }
    checkpoint('canvas-node-selected-without-property-dock', selectedNodePresentation);
    const selectedNodeScreenshot = await screenshot('canvas-node-selected-without-property-dock');
    const videoActions = await inspectCanvasSelectionActions(evaluate, 'canvas:functional:video');
    if (
      videoActions.actionIds.join('|') !==
        'cut:add-resource|video:separate-audio|node:duplicate|preview:open' ||
      videoActions.overflowActionIds.length !== 0
    ) {
      throw new Error(`Canvas video primary actions are invalid: ${JSON.stringify(videoActions)}`);
    }
    const multiSelectionBefore = await evaluate(`(() => {
      const view = document.querySelector('[data-owner-view-id="canvas:functional:video"]');
      const image = view?.querySelector('[data-node-id="epub-image-node"]');
      if (!(view instanceof HTMLElement) || !(image instanceof HTMLElement)) {
        throw new Error('Canvas multi-selection fixture nodes are unavailable.');
      }
      image.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
      const readPosition = (nodeId) => {
        const node = view.querySelector('[data-node-id="' + nodeId + '"]');
        if (!(node instanceof HTMLElement)) throw new Error('Canvas node is unavailable: ' + nodeId);
        return { left: Number.parseFloat(node.style.left), top: Number.parseFloat(node.style.top) };
      };
      return {
        first: readPosition('video-node'),
        second: readPosition('epub-image-node'),
      };
    })()`);
    await waitForCondition(
      evaluate,
      `(() => {
        const view = document.querySelector('[data-owner-view-id="canvas:functional:video"]');
        const toolbar = view?.querySelector('[data-selection-context-toolbar="true"]');
        return toolbar?.getAttribute('data-selection-count') === '2';
      })()`,
      'Canvas did not retain two selected nodes.',
    );
    const multiSelectionPresentation = await evaluate(`(() => {
      const view = document.querySelector('[data-owner-view-id="canvas:functional:video"]');
      if (!(view instanceof HTMLElement)) throw new Error('Canvas View is unavailable.');
      return {
        selectedNodeIds: [...view.querySelectorAll('[data-node-selected="true"]')].map((node) =>
          node.getAttribute('data-node-id'),
        ),
        actionIds: [...view.querySelectorAll('[data-selection-action]')].map((action) =>
          action.getAttribute('data-selection-action'),
        ),
        transformHandleCount: view.querySelectorAll('[data-node-transform-handle]').length,
      };
    })()`);
    checkpoint('canvas-multi-selection-ready', multiSelectionPresentation);
    const multiSelectionScreenshot = await screenshot('canvas-multi-selection-ready');
    await drag(
      '[data-owner-view-id="canvas:functional:video"] [data-node-id="video-node"]',
      '[data-owner-view-id="canvas:functional:video"] [data-canvas-viewport-root="true"]',
      {
        sourcePosition: { xRatio: 0.5, yRatio: 0.5 },
        targetPosition: { xRatio: 0.42, yRatio: 0.62 },
      },
    );
    const multiSelectionAfter = await evaluate(`(() => {
      const view = document.querySelector('[data-owner-view-id="canvas:functional:video"]');
      if (!(view instanceof HTMLElement)) throw new Error('Canvas View is unavailable.');
      const readPosition = (nodeId) => {
        const node = view.querySelector('[data-node-id="' + nodeId + '"]');
        if (!(node instanceof HTMLElement)) throw new Error('Canvas node is unavailable: ' + nodeId);
        return { left: Number.parseFloat(node.style.left), top: Number.parseFloat(node.style.top) };
      };
      const first = readPosition('video-node');
      const second = readPosition('epub-image-node');
      return {
        first,
        second,
        firstDelta: {
          x: first.left - ${String(multiSelectionBefore.first.left)},
          y: first.top - ${String(multiSelectionBefore.first.top)},
        },
        secondDelta: {
          x: second.left - ${String(multiSelectionBefore.second.left)},
          y: second.top - ${String(multiSelectionBefore.second.top)},
        },
        selectedNodeIds: [...view.querySelectorAll('[data-node-selected="true"]')].map((node) =>
          node.getAttribute('data-node-id'),
        ),
      };
    })()`);
    checkpoint('canvas-multi-selection-moved', multiSelectionAfter);
    const multiSelectionMovedScreenshot = await screenshot('canvas-multi-selection-moved');
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-node-presentation][data-node-id="epub-image-node"]',
    );
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-selection-action="preview:open"]',
    );
    const imageActions = await inspectCanvasSelectionActions(evaluate, 'canvas:functional:video');
    if (
      imageActions.actionIds.join('|') !==
        'image:crop|image:upscale|image:redraw|node:duplicate|preview:open' ||
      imageActions.disabledActionIds.join('|') !== 'image:crop|image:upscale|image:redraw' ||
      imageActions.overflowActionIds.length !== 0 ||
      imageActions.actionIds.some((actionId) =>
        ['cut:add-resource', 'video:separate-audio', 'audio:voice-denoise'].includes(actionId),
      )
    ) {
      throw new Error(`Canvas image actions are invalid: ${JSON.stringify(imageActions)}`);
    }
    checkpoint('canvas-image-owner-actions', imageActions);
    const imageActionsScreenshot = await screenshot('canvas-image-owner-actions');
    const imageNodeCountBeforeDuplicate = await evaluate(`(() => {
      const view = document.querySelector('[data-owner-view-id="canvas:functional:video"]');
      return view?.querySelectorAll('[data-node-presentation]').length ?? 0;
    })()`);
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-selection-action="node:duplicate"]',
    );
    await evaluate(`new Promise((resolve, reject) => {
      const deadline = Date.now() + 3000;
      const inspect = () => {
        const view = document.querySelector('[data-owner-view-id="canvas:functional:video"]');
        const toolbar = view?.querySelector('[data-selection-context-toolbar="true"]');
        const error = toolbar?.querySelector('[data-material-actions-status="error"]');
        if (error) {
          reject(new Error('Duplicated Canvas image actions failed: ' + (error.textContent ?? '')));
          return;
        }
        const nodeCount = view?.querySelectorAll('[data-node-presentation]').length ?? 0;
        const loading = toolbar?.querySelector('[data-material-actions-status="loading"]');
        if (nodeCount === ${String(imageNodeCountBeforeDuplicate + 1)} && !loading) {
          resolve(undefined);
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error('Duplicated Canvas image actions did not converge.'));
          return;
        }
        window.setTimeout(inspect, 25);
      };
      inspect();
    })`);
    const duplicatedImageActions = await inspectCanvasSelectionActions(
      evaluate,
      'canvas:functional:video',
    );
    const duplicatedImagePreview = await waitForCopiedImagePreview(evaluate);
    if (
      duplicatedImageActions.actionIds.join('|') !==
        'image:crop|image:upscale|image:redraw|node:duplicate|preview:open' ||
      duplicatedImageActions.disabledActionIds.join('|') !==
        'image:crop|image:upscale|image:redraw' ||
      duplicatedImageActions.overflowActionIds.length !== 0 ||
      duplicatedImageActions.hasError ||
      !duplicatedImagePreview.src.startsWith('openneko://resource/') ||
      duplicatedImagePreview.naturalWidth <= 0 ||
      duplicatedImagePreview.naturalHeight <= 0
    ) {
      throw new Error(
        `Duplicated Canvas image actions are invalid: ${JSON.stringify(duplicatedImageActions)}`,
      );
    }
    checkpoint('canvas-duplicated-image-actions', {
      actions: duplicatedImageActions,
      preview: duplicatedImagePreview,
    });
    const duplicatedImageActionsScreenshot = await screenshot('canvas-duplicated-image-actions');
    const imagePreviewContextBefore = await inspectCanvasSelectionAndViewport(
      evaluate,
      'canvas:functional:video',
    );
    await evaluate(`(() => {
      const node = document.querySelector(
        '[data-owner-view-id="canvas:functional:video"] [data-node-presentation][data-node-id="epub-image-node"]',
      );
      if (!(node instanceof HTMLElement)) throw new Error('Canvas Image node is unavailable.');
      node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    })()`);
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-canvas-image-preview="true"] [data-preview-surface="visual"]',
    );
    const imagePreviewScreenshot = await screenshot('canvas-image-fullscreen-preview');
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-canvas-image-preview="true"] button',
    );
    const imagePreviewContextAfter = await inspectCanvasSelectionAndViewport(
      evaluate,
      'canvas:functional:video',
    );
    if (JSON.stringify(imagePreviewContextAfter) !== JSON.stringify(imagePreviewContextBefore)) {
      throw new Error(
        `Canvas image preview changed selection or viewport: ${JSON.stringify({ imagePreviewContextBefore, imagePreviewContextAfter })}`,
      );
    }
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-node-presentation][data-node-id="video-node"]',
      0,
      { xRatio: 0.5, yRatio: 0.95 },
    );
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-selection-action="cut:add-resource"]',
    );
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-selection-action="cut:add-resource"]',
    );
    await waitForSelector('[data-workbench-cut-panel="true"] .cut-basic-clip');
    const newDraftHandoff = await inspectCanvasCutHandoff(evaluate);
    if (
      newDraftHandoff.clipCount !== 1 ||
      !newDraftHandoff.activeLabel ||
      !['Untitled Cut', '未命名剪辑'].includes(newDraftHandoff.activeLabel)
    ) {
      throw new Error(
        `Canvas media was not added to one new Cut draft: ${JSON.stringify(newDraftHandoff)}`,
      );
    }
    const newDraftHandoffScreenshot = await screenshot('canvas-video-added-to-new-cut');
    await hideFunctionalCutPanel(evaluate);

    await waitForInteractiveSelector(
      evaluate,
      '[data-owner-view-id="canvas:functional:video"] [data-node-presentation][data-node-id="cut-document-node"]',
    );
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-node-presentation][data-node-id="cut-document-node"]',
      0,
      { xRatio: 0.5, yRatio: 0.5 },
    );
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-selection-action="cut:open"]',
    );
    const otioActions = await inspectCanvasSelectionActions(evaluate, 'canvas:functional:video');
    if (
      otioActions.visible.length !== 2 ||
      !otioActions.visible.some((label) => ['打开剪辑', 'Open Cut'].includes(label)) ||
      otioActions.actionIds.includes('cut:add-resource')
    ) {
      throw new Error(`Canvas OTIO actions are invalid: ${JSON.stringify(otioActions)}`);
    }
    const otioActionsScreenshot = await screenshot('canvas-otio-open-action');
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-selection-action="cut:open"]',
    );
    await waitForCondition(
      evaluate,
      `(() => {
        const active = document.querySelector(
          '[data-workbench-cut-panel="true"] .neko-workbench-editor-tab[aria-selected="true"] .neko-workbench-editor-tab__label'
        );
        return active?.textContent?.trim() === 'story.otio';
      })()`,
      'Canvas OTIO action did not open the exact Cut document.',
    );
    const otioOpenedScreenshot = await screenshot('canvas-otio-opened-in-cut');
    await hideFunctionalCutPanel(evaluate);
    await evaluate(`(() => {
      const viewport = document.querySelector(
        '[data-owner-view-id="canvas:functional:video"] [data-canvas-viewport-root="true"]',
      );
      if (!(viewport instanceof HTMLElement)) throw new Error('Canvas viewport is unavailable.');
      viewport.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      return true;
    })()`);
    await waitForCondition(
      evaluate,
      `document.querySelector(
        '[data-owner-view-id="canvas:functional:video"] [data-selection-action]'
      ) === null`,
      'Canvas node-local selection actions did not close after clearing selection.',
    );
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-canvas-toolbar-action="toggle-playback-panel"]',
    );
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:video"] [data-testid="canvas-playback-controller"]',
    );
    await waitForInteractiveSelector(
      evaluate,
      '[data-owner-view-id="canvas:functional:video"] [data-storyline-node="true"][data-source-node-id="video-node"]',
    );
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-storyline-node="true"][data-source-node-id="video-node"]',
    );
    const storylinePlaySelector =
      '[data-owner-view-id="canvas:functional:video"] [data-testid="canvas-playback-controller"] button[title="播放"], [data-owner-view-id="canvas:functional:video"] [data-testid="canvas-playback-controller"] button[title="Play"]';
    await waitForSelector(storylinePlaySelector);
    await click(storylinePlaySelector);
    const storylinePlayback = await waitForCanvasStorylinePlayback(
      evaluate,
      'canvas:functional:video',
      false,
    );
    const storylinePauseSelector =
      '[data-owner-view-id="canvas:functional:video"] [data-testid="canvas-playback-controller"] button[title="暂停"], [data-owner-view-id="canvas:functional:video"] [data-testid="canvas-playback-controller"] button[title="Pause"]';
    await waitForSelector(storylinePauseSelector);
    await click(storylinePauseSelector);
    await waitForCanvasStorylinePlayback(evaluate, 'canvas:functional:video', true);
    checkpoint('canvas-storyline-single-click-transport', {
      currentTime: storylinePlayback.currentTime,
    });
    await click(
      '[data-owner-view-id="canvas:functional:video"] [data-playback-action="close-overlay"]',
    );
    await waitForCanvasPlaybackOverlayRemoved(evaluate, 'canvas:functional:video');
    await hover(
      '[data-owner-view-id="canvas:functional:video"] [data-testid="canvas-media-node"][data-media-type="video"]',
    );
    await waitForCanvasMediaPaused(evaluate, 'canvas:functional:video', 'video', true);
    checkpoint('canvas-video-hover-remains-paused');
    await setCanvasMediaPaused(evaluate, 'canvas:functional:video', 'video', false);
    const videoPlayback = await waitForCanvasMediaPlayback(
      evaluate,
      'canvas:functional:video',
      'video',
    );
    checkpoint('canvas-video-manual-playing', { currentTime: videoPlayback.currentTime });
    await hover(
      '[data-owner-view-id="canvas:functional:audio"] [data-testid="canvas-media-node"][data-media-type="audio"]',
    );
    await waitForCanvasMediaPaused(evaluate, 'canvas:functional:audio', 'audio', true, false);
    const videoAfterPointerLeave = await waitForCanvasMediaPlayback(
      evaluate,
      'canvas:functional:video',
      'video',
      videoPlayback.currentTime,
    );
    checkpoint('canvas-audio-hover-remains-paused');
    await click(
      '[data-owner-view-id="canvas:functional:audio"] [data-node-presentation][data-node-id="audio-node"] [data-canvas-node-label]',
    );
    await waitForSelector(
      '[data-owner-view-id="canvas:functional:audio"] [data-selection-action="cut:add-resource"]',
    );
    const audioActions = await inspectCanvasSelectionActions(evaluate, 'canvas:functional:audio');
    if (
      audioActions.actionIds.join('|') !==
        'cut:add-resource|audio:voice-denoise|node:duplicate|preview:open' ||
      audioActions.disabledActionIds.join('|') !== 'audio:voice-denoise' ||
      audioActions.overflowActionIds.length !== 0 ||
      audioActions.actionIds.includes('video:separate-audio')
    ) {
      throw new Error(`Canvas audio actions are invalid: ${JSON.stringify(audioActions)}`);
    }
    checkpoint('canvas-audio-owner-actions', audioActions);
    const audioActionsScreenshot = await screenshot('canvas-audio-owner-actions');
    await click(
      '[data-owner-view-id="canvas:functional:audio"] [data-testid="preview-lightweight-audio-toggle-playback"]',
    );
    const audioPlayback = await waitForCanvasMediaPlayback(
      evaluate,
      'canvas:functional:audio',
      'audio',
    );
    checkpoint('canvas-audio-playing', { currentTime: audioPlayback.currentTime });
    const playback = {
      videoUrl: videoPlayback.url,
      videoTime: videoPlayback.currentTime,
      videoTimeAfterPointerLeave: videoAfterPointerLeave.currentTime,
      audioUrl: audioPlayback.url,
      audioTime: audioPlayback.currentTime,
    };
    await replaceWorkbench(
      evaluate,
      `(projection, current) => ({
        ...current,
        main: {
          views: [],
          groups: [{ groupId: 'main:primary', viewIds: [] }],
          activeGroupId: 'main:primary',
        },
      })`,
    );
    await waitForCanvasRootsRemoved(evaluate);
    checkpoint('canvas-roots-removed');
    await waitForSelector('[data-empty-main="true"]');
    const emptyMain = await evaluate(`(() => {
      const surface = document.querySelector('[data-empty-main="true"]');
      return {
        heading: surface?.querySelector('h2')?.textContent?.trim(),
        detail: surface?.querySelector('p')?.textContent?.trim(),
        hasDiagnostic: Boolean(surface?.querySelector('code')),
        exposesCanvasNotMounted: surface?.textContent?.includes('desktop-canvas-not-mounted') ?? false,
      };
    })()`);
    checkpoint('empty-main-after-last-tab-closed', emptyMain);
    const emptyMainScreenshot = await screenshot('empty-main-after-last-tab-closed');
    await delay(500);
    const released = [
      await waitForReleasedUrl(evaluate, playback.videoUrl, 'video'),
      await waitForReleasedUrl(evaluate, playback.audioUrl, 'audio'),
    ];
    await restartApplication();
    await waitForSelector('[data-agent-presentation="draft"]');
    const freshEntry = await evaluate(`(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      const active = projection.window.activeTarget;
      const instance = projection.window.workbench;
      return {
        activeTarget: active.kind,
        sceneKind: instance.scene.context.kind,
        scopeKind:
          instance.scene.context.kind === 'agent' ? instance.scene.context.scope.kind : undefined,
        canvasRootCount: document.querySelectorAll('[data-owner-root="canvas"]').length,
        retainedTabCount: projection.window.tabs.length,
      };
    })()`);
    checkpoint('fresh-entry-after-restart', freshEntry);
    const freshEntryScreenshot = await screenshot('fresh-entry-after-restart');
    await openFixtureWorkspace(evaluate);
    await waitForSelector('[data-owner-root="canvas"]');
    const reopenedDefault = await evaluate(`(async () => {
      const projection = await window.openNekoDesktop.shell.getSnapshot();
      const views = projection.window.workbench.layout.main.views;
      return {
        activeTarget: projection.window.activeTarget.kind,
        canvasViews: views
          .filter((view) => view.kind === 'canvas')
          .map((view) => ({ viewId: view.viewId, documentId: view.documentId })),
        canvasRootCount: document.querySelectorAll('[data-owner-root="canvas"]').length,
        placeholderVisible: document.body.innerText.includes('desktop-canvas-not-mounted'),
      };
    })()`);
    checkpoint('default-workspace-canvas-explicitly-reopened', reopenedDefault);
    const restoredScreenshot = await screenshot('default-workspace-canvas-explicitly-reopened');
    const interactionResizeSelector =
      '.neko-controlled-workbench-interaction .neko-controlled-workbench-resize-handle--right';
    await waitForSelector(interactionResizeSelector);
    await waitForInteractiveSelector(evaluate, interactionResizeSelector);
    const interactionWidthBeforeResize = await readInteractionWidth(evaluate);
    const interactionResizeTarget =
      interactionWidthBeforeResize >= 300
        ? '.neko-controlled-workbench-interaction'
        : '.neko-controlled-workbench-main';
    await drag(interactionResizeSelector, interactionResizeTarget, {
      targetPosition: { xRatio: 0.5, yRatio: 0.5 },
    });
    const resizeLifecycle = await waitForResizeLifecycleCompletion(
      evaluate,
      interactionWidthBeforeResize,
    );
    checkpoint('interaction-resize-indicator-cleared', resizeLifecycle);
    const resizedWorkbenchScreenshot = await screenshot('interaction-resize-indicator-cleared');
    await replaceWorkbench(
      evaluate,
      `(projection, current) => ({
        ...current,
        resourceDock: { ...current.resourceDock, presentation: 'docked' },
      })`,
    );
    await waitForSelector('[data-owner-root="assets"] .neko-resource-browser');
    const themeSurfaces = await evaluate(`(() => {
      const agent = document.querySelector(
        '[data-owner-root="agent"] [data-presentation="desktop-dock"]',
      );
      const resources = document.querySelector(
        '[data-owner-root="assets"] .neko-resource-browser',
      );
      const resourceInput = resources?.querySelector('.neko-resource-browser__search > div');
      if (!(agent instanceof HTMLElement)) throw new Error('Desktop Agent package Root is missing.');
      if (!(resources instanceof HTMLElement)) {
        throw new Error('Desktop Resource Browser package Root is missing.');
      }
      if (!(resourceInput instanceof HTMLElement)) {
        throw new Error('Desktop Resource Browser raised input is missing.');
      }
      const composerRail = agent.querySelector('.agent-composer-rail');
      if (!(composerRail instanceof HTMLElement)) {
        throw new Error('Desktop Agent composer rail is missing.');
      }
      const rootStyle = getComputedStyle(document.documentElement);
      const agentStyle = getComputedStyle(agent);
      const composerRailStyle = getComputedStyle(composerRail);
      return {
        agentBackground: agentStyle.backgroundColor,
        composerRailBackground: composerRailStyle.backgroundColor,
        composerRailBorderTopColor: composerRailStyle.borderTopColor,
        composerRailBorderTopWidth: composerRailStyle.borderTopWidth,
        resourceBackground: getComputedStyle(resources).backgroundColor,
        resourceInputBackground: getComputedStyle(resourceInput).backgroundColor,
        resourcePackageHeaderCount: resources.querySelectorAll(
          '.neko-resource-browser__header',
        ).length,
        resourceToolbarActionLabels: Array.from(
          resources.querySelectorAll('.neko-resource-browser__toolbar button[aria-label]'),
          (element) => element.getAttribute('aria-label') ?? '',
        ),
        resourceManagementTitles: Array.from(
          document.querySelectorAll('.project-resource-dock__header strong'),
          (element) => element.textContent?.trim() ?? '',
        ),
        agentDirectModeControlCount: agent.querySelectorAll(
          '.agent-control-chip-mode, .agent-composer-session-mode-menu',
        ).length,
        agentDirectGenerationStatusCount: agent.querySelectorAll(
          '.direct-generation-status, [data-direct-generation-status]',
        ).length,
        desktopMain: rootStyle.getPropertyValue('--neko-desktop-main').trim(),
        desktopSurface: rootStyle.getPropertyValue('--neko-desktop-surface').trim(),
        desktopSurfaceMuted: rootStyle.getPropertyValue('--neko-desktop-surface-muted').trim(),
        desktopSurfaceRaised: rootStyle.getPropertyValue('--neko-desktop-surface-raised').trim(),
      };
    })()`);
    checkpoint('desktop-dock-theme-surfaces', themeSurfaces);
    const themedDockScreenshot = await screenshot('desktop-dock-theme-surfaces');
    return {
      ownerRoot: 'canvas',
      unifiedWorkbench,
      unifiedWorkbenchScreenshot,
      rootCount: 2,
      epubImageProjection,
      epubResourceStatus,
      epubImageScreenshot,
      duplicatedFilePreview,
      duplicatedFilePreviewScreenshot,
      markdownPreview,
      markdownPreviewScreenshot,
      markdownScrolled,
      markdownScrolledScreenshot,
      markdownActions,
      markdownEditing,
      markdownEditingScreenshot,
      markdownEditorScrolled,
      markdownEdited,
      markdownAfterEdit,
      markdownEditorContextBefore,
      markdownEditorContextAfter,
      quietConnections,
      quietConnectionsScreenshot,
      selectedConnectionVisual,
      selectedConnectionScreenshot,
      authoredNodeCount,
      generationAuthoring,
      selectedNodePresentation,
      selectedNodeScreenshot,
      multiSelectionPresentation,
      multiSelectionScreenshot,
      multiSelectionAfter,
      multiSelectionMovedScreenshot,
      videoActions,
      imageActions,
      imageActionsScreenshot,
      duplicatedImageActions,
      duplicatedImagePreview,
      duplicatedImageActionsScreenshot,
      imagePreviewScreenshot,
      audioActions,
      audioActionsScreenshot,
      newDraftHandoff,
      newDraftHandoffScreenshot,
      otioActions,
      otioActionsScreenshot,
      otioOpenedScreenshot,
      locatorBackedNodes: ['video', 'audio', 'epub-document-entry-image'],
      nativeElements: ['video', 'audio', 'img'],
      storylineAdvancedTo: storylinePlayback.currentTime,
      videoManualStartTime: playback.videoTime,
      videoAdvancedTo: playback.videoTimeAfterPointerLeave,
      audioAdvancedTo: playback.audioTime,
      isolatedUrls: playback.videoUrl !== playback.audioUrl,
      releasedStatuses: released,
      emptyMain,
      emptyMainScreenshot,
      freshEntry,
      freshEntryScreenshot,
      reopenedDefault,
      restoredScreenshot,
      resizeLifecycle,
      resizedWorkbenchScreenshot,
      themeSurfaces,
      themedDockScreenshot,
    };
  },
  assertObservation(observation, evidence) {
    if (
      evidence.unifiedWorkbench.shellCount !== 1 ||
      evidence.unifiedWorkbench.primarySidebarCount !== 1
    ) {
      throw new Error(
        `Desktop did not use the canonical unified Workbench entry: ${JSON.stringify(evidence.unifiedWorkbench)}`,
      );
    }
    if (observation.openNekoResourceRequestCount < 3) {
      throw new Error(
        'Canvas did not reach the OpenNeko resource handler for video, audio and EPUB image content.',
      );
    }
    if (
      evidence.epubResourceStatus !== 200 ||
      evidence.epubImageProjection.naturalWidth <= 0 ||
      evidence.epubImageProjection.naturalHeight <= 0 ||
      evidence.epubImageProjection.objectFit !== 'contain'
    ) {
      throw new Error(
        `Canvas EPUB document-entry image evidence is invalid: ${JSON.stringify(evidence.epubImageProjection)}`,
      );
    }
    if (
      evidence.markdownPreview.editing ||
      evidence.markdownPreview.textareaCount !== 0 ||
      evidence.markdownPreview.proseMirrorCount !== 0 ||
      evidence.markdownPreview.wheelOwner !== 'content' ||
      evidence.markdownScrolled.scrollTop <= evidence.markdownPreview.scrollTop ||
      Math.abs(evidence.markdownScrolled.left - evidence.markdownPreview.left) > 0.5 ||
      Math.abs(evidence.markdownScrolled.top - evidence.markdownPreview.top) > 0.5 ||
      evidence.markdownActions.actionIds.join('|') !==
        'canvas:edit-markdown|node:duplicate|preview:open' ||
      evidence.markdownEditing.overlayCount !== 1 ||
      evidence.markdownEditing.editorProseMirrorCount !== 1 ||
      evidence.markdownEditing.nodeProseMirrorCount !== 0 ||
      evidence.markdownEditing.canvasInteractionSuspended !== 'true' ||
      evidence.markdownEditorScrolled.scrollTop <= evidence.markdownEditing.scrollTop ||
      evidence.markdownEditorScrolled.viewportTransform !==
        evidence.markdownEditing.viewportTransform ||
      !evidence.markdownEdited.text.includes('沉浸式编辑验收') ||
      !evidence.markdownAfterEdit.text.includes('沉浸式编辑验收') ||
      JSON.stringify(evidence.markdownEditorContextAfter) !==
        JSON.stringify(evidence.markdownEditorContextBefore)
    ) {
      throw new Error('Canvas Markdown preview and immersive editing were not proven.');
    }
    if (
      evidence.quietConnections.connectionCount !== 6 ||
      evidence.quietConnections.maximumLineOpacity > 0.38 ||
      evidence.quietConnections.flowDotCount !== 0 ||
      evidence.selectedConnectionVisual.selectedCount !== 1 ||
      evidence.selectedConnectionVisual.selectedLineOpacity !== 0.88 ||
      evidence.selectedConnectionVisual.flowDotCount !== 0
    ) {
      throw new Error('Canvas connection visual hierarchy was not proven.');
    }
    if (observation.pcmResponseCount !== 0) {
      throw new Error('Canvas ordinary node playback unexpectedly consumed PCM.');
    }
    if (
      evidence.rootCount !== 2 ||
      evidence.authoredNodeCount !== 4 ||
      evidence.generationAuthoring.catalog.actionIds.join('|') !== 'text|image|video|audio' ||
      evidence.generationAuthoring.kinds.map((item) => item.kind).join('|') !==
        'prompt|image|video|audio' ||
      evidence.generationAuthoring.kinds.some(
        (item) => item.runButtonCount !== 1 || item.alertCount !== 0,
      ) ||
      evidence.generationAuthoring.kinds[0]?.compact?.bodyScrollWidth !==
        evidence.generationAuthoring.kinds[0]?.compact?.bodyClientWidth ||
      evidence.selectedNodePresentation.nodeLocalActionCount === 0 ||
      evidence.selectedNodePresentation.propertyDockCount !== 0 ||
      evidence.multiSelectionPresentation.selectedNodeIds.length !== 2 ||
      !evidence.multiSelectionPresentation.actionIds.includes('group-selection') ||
      !evidence.multiSelectionPresentation.actionIds.includes('node:duplicate') ||
      evidence.multiSelectionPresentation.transformHandleCount !== 0 ||
      evidence.multiSelectionAfter.selectedNodeIds.length !== 2 ||
      Math.abs(
        evidence.multiSelectionAfter.firstDelta.x - evidence.multiSelectionAfter.secondDelta.x,
      ) > 0.5 ||
      Math.abs(
        evidence.multiSelectionAfter.firstDelta.y - evidence.multiSelectionAfter.secondDelta.y,
      ) > 0.5 ||
      (Math.abs(evidence.multiSelectionAfter.firstDelta.x) < 1 &&
        Math.abs(evidence.multiSelectionAfter.firstDelta.y) < 1) ||
      !evidence.isolatedUrls ||
      evidence.newDraftHandoff.clipCount !== 1 ||
      !evidence.otioActions.actionIds.includes('cut:open') ||
      evidence.otioActions.actionIds.includes('cut:add-resource') ||
      evidence.videoActions.actionIds.join('|') !==
        'cut:add-resource|video:separate-audio|node:duplicate|preview:open' ||
      evidence.imageActions.actionIds.join('|') !==
        'image:crop|image:upscale|image:redraw|node:duplicate|preview:open' ||
      evidence.imageActions.disabledActionIds.join('|') !==
        'image:crop|image:upscale|image:redraw' ||
      evidence.imageActions.overflowActionIds.length !== 0 ||
      evidence.duplicatedImageActions.actionIds.join('|') !==
        'image:crop|image:upscale|image:redraw|node:duplicate|preview:open' ||
      evidence.duplicatedImageActions.disabledActionIds.join('|') !==
        'image:crop|image:upscale|image:redraw' ||
      evidence.duplicatedImageActions.overflowActionIds.length !== 0 ||
      evidence.duplicatedImageActions.hasError ||
      !evidence.duplicatedImagePreview.src.startsWith('openneko://resource/') ||
      evidence.duplicatedImagePreview.naturalWidth <= 0 ||
      evidence.duplicatedImagePreview.naturalHeight <= 0 ||
      evidence.duplicatedFilePreview.status !== 'ready' ||
      evidence.duplicatedFilePreview.kind !== 'markdown' ||
      !evidence.duplicatedFilePreview.text.includes('Copied reference') ||
      evidence.audioActions.actionIds.join('|') !==
        'cut:add-resource|audio:voice-denoise|node:duplicate|preview:open' ||
      evidence.audioActions.disabledActionIds.join('|') !== 'audio:voice-denoise' ||
      evidence.audioActions.overflowActionIds.length !== 0 ||
      evidence.storylineAdvancedTo <= 0 ||
      evidence.videoAdvancedTo <= evidence.videoManualStartTime + 0.15 ||
      evidence.audioAdvancedTo <= 0
    ) {
      throw new Error('Canvas package-owned two-View playback isolation was not proven.');
    }
    if (evidence.releasedStatuses.some((status) => status !== 0)) {
      throw new Error('Canvas View teardown left an OpenNeko resource reachable.');
    }
    if (
      !evidence.emptyMain.heading ||
      !evidence.emptyMain.detail ||
      evidence.emptyMain.hasDiagnostic ||
      evidence.emptyMain.exposesCanvasNotMounted
    ) {
      throw new Error('Desktop did not render a diagnostic-free empty Main surface.');
    }
    if (
      evidence.freshEntry.activeTarget !== 'home' ||
      evidence.freshEntry.sceneKind !== 'agent' ||
      evidence.freshEntry.scopeKind !== 'unbound' ||
      evidence.freshEntry.canvasRootCount !== 0 ||
      evidence.freshEntry.retainedTabCount !== 1
    ) {
      throw new Error(
        'Desktop restart did not open a fresh Entry while retaining Project navigation.',
      );
    }
    if (
      evidence.reopenedDefault.activeTarget !== 'project' ||
      evidence.reopenedDefault.canvasRootCount !== 1 ||
      evidence.reopenedDefault.canvasViews.length !== 1 ||
      evidence.reopenedDefault.canvasViews[0]?.documentId !== 'neko/boards/workspace.nkc' ||
      evidence.reopenedDefault.placeholderVisible
    ) {
      throw new Error(
        'Explicit Project navigation did not reopen the canonical Workspace Canvas Main View.',
      );
    }
    if (
      evidence.resizeLifecycle.widthAfter === evidence.resizeLifecycle.widthBefore ||
      evidence.resizeLifecycle.resizingOwnerCount !== 0
    ) {
      throw new Error('Desktop left Dock resize did not clear its active resize indicator.');
    }
    if (
      evidence.themeSurfaces.desktopMain !== '#ffffff' ||
      evidence.themeSurfaces.desktopSurface !== '#fafafa' ||
      evidence.themeSurfaces.desktopSurfaceMuted !== '#f3f3f2' ||
      evidence.themeSurfaces.desktopSurfaceRaised !== '#ffffff' ||
      evidence.themeSurfaces.agentBackground !== 'rgb(255, 255, 255)' ||
      evidence.themeSurfaces.composerRailBackground !== 'rgb(255, 255, 255)' ||
      evidence.themeSurfaces.composerRailBorderTopWidth !== '0px' ||
      evidence.themeSurfaces.resourceBackground !== 'rgb(255, 255, 255)' ||
      evidence.themeSurfaces.resourceInputBackground !== 'rgb(255, 255, 255)' ||
      evidence.themeSurfaces.resourcePackageHeaderCount !== 0 ||
      evidence.themeSurfaces.resourceToolbarActionLabels.some((label) =>
        ['刷新', 'Refresh'].includes(label),
      ) ||
      !evidence.themeSurfaces.resourceToolbarActionLabels.some((label) =>
        ['列表视图', 'List view', '网格视图', 'Grid view'].includes(label),
      ) ||
      evidence.themeSurfaces.resourceManagementTitles.length !== 1 ||
      evidence.themeSurfaces.agentDirectModeControlCount !== 0 ||
      evidence.themeSurfaces.agentDirectGenerationStatusCount !== 0 ||
      !['资源管理', 'Resource management'].includes(
        evidence.themeSurfaces.resourceManagementTitles[0],
      )
    ) {
      throw new Error(
        `Desktop primary regions did not share one Main surface and chrome: ${JSON.stringify(evidence.themeSurfaces)}`,
      );
    }
  },
});

async function exerciseCanvasGenerationAuthoring({
  click,
  drag,
  evaluate,
  screenshot,
  viewId,
  waitForSelector,
}) {
  const viewSelector = `[data-owner-view-id=${JSON.stringify(viewId)}]`;
  const openMenuSelector = `${viewSelector} [data-canvas-toolbar-action="open-add-node-popover"]`;
  await click(openMenuSelector);
  await waitForSelector('[data-canvas-add-action-popover="true"]');
  const catalog = await evaluate(`(() => ({
    actionIds: [...document.querySelectorAll(
      '[data-canvas-add-action-popover="true"] [data-canvas-add-action]',
    )].map((element) => element.getAttribute('data-canvas-add-action')),
    labels: [...document.querySelectorAll(
      '[data-canvas-add-action-popover="true"] .canvas-add-action-popover__label',
    )].map((element) => element.childNodes[0]?.textContent?.trim() ?? ''),
  }))()`);
  const expectedActionIds = ['text', 'image', 'video', 'audio'];
  if (catalog.actionIds.join('|') !== expectedActionIds.join('|')) {
    throw new Error(`Canvas add catalog order is invalid: ${JSON.stringify(catalog)}`);
  }
  const screenshots = [await screenshot('canvas-generation-add-menu-large')];
  const kinds = [];
  const actions = [
    {
      actionId: 'text',
      kind: 'prompt',
      contentKind: 'text',
      label: ['Text', '文本'],
      modelLabel: 'Canvas Text',
      emptyIconClass: 'codicon-file-text',
      expectedSize: { width: 120, height: 80 },
    },
    {
      actionId: 'image',
      kind: 'image',
      contentKind: 'image',
      label: ['Image', '图片'],
      modelLabel: 'Canvas Image',
      emptyIconClass: 'codicon-file-media',
      expectedSize: { width: 120, height: 90 },
    },
    {
      actionId: 'video',
      kind: 'video',
      contentKind: 'video',
      label: ['Video', '视频'],
      modelLabel: 'Canvas Video',
      emptyIconClass: 'codicon-play',
      expectedSize: { width: 120, height: 90 },
    },
    {
      actionId: 'audio',
      kind: 'audio',
      contentKind: 'audio',
      label: ['Audio', '音频'],
      modelLabel: 'Canvas Audio',
      emptyIconClass: 'codicon-music',
      expectedSize: { width: 120, height: 60 },
    },
  ];
  let maximumNodeCount = 0;

  for (const [index, action] of actions.entries()) {
    if (index > 0) {
      await click(openMenuSelector);
      await waitForSelector('[data-canvas-add-action-popover="true"]');
    }
    await click(`[data-canvas-add-action=${JSON.stringify(action.actionId)}]`);
    maximumNodeCount = Math.max(
      maximumNodeCount,
      await waitForCanvasNodeCount(evaluate, viewId, 4),
    );
    const nodeSelector = `${viewSelector} [data-node-presentation]:has([data-canvas-generation-node=${JSON.stringify(action.kind)}])`;
    await waitForInteractiveSelector(evaluate, nodeSelector);
    await click(nodeSelector);
    const inputSelector = `${viewSelector} [data-canvas-generation-input="true"]`;
    await waitForSelector(inputSelector);
    let state = await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(nodeSelector)});
      if (!(node instanceof HTMLElement)) throw new Error('Generation Node is unavailable.');
      const nodeContent = node.querySelector(':scope > .node-card');
      if (!(nodeContent instanceof HTMLElement)) {
        throw new Error('Generation Node content is unavailable.');
      }
      const input = document.querySelector(${JSON.stringify(inputSelector)});
      if (!(input instanceof HTMLElement)) throw new Error('Generation input is unavailable.');
      const toolbar = document.querySelector(
        ${JSON.stringify(`${viewSelector} [data-selection-context-toolbar="true"]`)},
      );
      if (!(toolbar instanceof HTMLElement)) throw new Error('Selection toolbar is unavailable.');
      const nodeBounds = node.getBoundingClientRect();
      const inputBounds = input.getBoundingClientRect();
      const toolbarBounds = toolbar.getBoundingClientRect();
      const inputPlacement = input.getAttribute('data-placement');
      const inputStyle = getComputedStyle(input);
      const nodeStyle = getComputedStyle(node.querySelector('.canvas-generation-node'));
      const nodeSurfaceStyle = getComputedStyle(nodeContent);
      const toolbarStyle = getComputedStyle(toolbar);
      const footer = input.querySelector('.selection-generation-input-panel__footer');
      if (!(footer instanceof HTMLElement)) throw new Error('Generation input footer is unavailable.');
      const controls = [...input.querySelectorAll('textarea, input, select, button')];
      const overlaps = (left, right) => !(
        left.right <= right.left ||
        right.right <= left.left ||
        left.bottom <= right.top ||
        right.bottom <= left.top
      );
      return {
        kind: node.querySelector('[data-canvas-generation-node]')?.getAttribute(
          'data-canvas-generation-node',
        ),
        contentKind: node.querySelector('[data-canvas-content-kind]')?.getAttribute(
          'data-canvas-content-kind',
        ),
        nodeLabel: node.querySelector('.canvas-generation-node__label')?.textContent?.trim() ?? '',
        emptyIconClass:
          node.querySelector('.canvas-generation-node__empty .codicon')?.className ?? '',
        inputKind: input.getAttribute('data-canvas-generation-input-kind'),
        inputPlacement,
        inputSurface: input.getAttribute('data-surface'),
        inputBackgroundColor: inputStyle.backgroundColor,
        nodeBackgroundColor: nodeStyle.backgroundColor,
        nodeSurfaceBackgroundColor: nodeSurfaceStyle.backgroundColor,
        toolbarBackgroundColor: toolbarStyle.backgroundColor,
        footerBackgroundColor: getComputedStyle(footer).backgroundColor,
        restingControlBackgroundColors: [
          input.querySelector('[data-canvas-generation-reference-add="true"]'),
          input.querySelector('.selection-generation-input-panel__model-trigger'),
          input.querySelector(
            'button.selection-generation-input-panel__chip:not(.selection-generation-input-panel__model-trigger)',
          ),
          input.querySelector('.selection-generation-input-panel__run'),
        ].map((control) =>
          control instanceof HTMLElement ? getComputedStyle(control).backgroundColor : undefined,
        ),
        inputHeadingCount: input.querySelectorAll(
          '.selection-generation-input-panel__header',
        ).length,
        inputInsideNode: node.contains(input),
        nodeControlCount: node.querySelectorAll('textarea, input, select, button').length,
        toolbarLabel:
          toolbar.querySelector('[data-selection-kind-label="true"]')?.textContent?.trim() ?? '',
        labels: controls.map((control) =>
          control.getAttribute('aria-label') ?? control.getAttribute('title') ?? '',
        ),
        runButtonCount: [...input.querySelectorAll('button')].filter((button) =>
          ['Run', '生成'].includes(button.getAttribute('title') ?? ''),
        ).length,
        modelTriggerCount: input.querySelectorAll(
          '.selection-generation-input-panel__model-trigger',
        ).length,
        selectedModelLabel:
          input.querySelector('.selection-generation-input-panel__model-copy strong')?.textContent?.trim() ?? '',
        parameterTriggerCount: input.querySelectorAll(
          'button.selection-generation-input-panel__chip:not(.selection-generation-input-panel__model-trigger)',
        ).length,
        countTriggerCount: input.querySelectorAll(
          '.selection-generation-input-panel__count-trigger',
        ).length,
        audioModeTabCount: input.querySelectorAll(
          '.selection-generation-input-panel__mode-tabs [role="tab"]',
        ).length,
        alertCount: input.querySelectorAll('[role="alert"]').length,
        referenceSummaryCount: input.querySelectorAll(
          '.selection-generation-input-panel__references',
        ).length,
        referenceAddCount: input.querySelectorAll(
          '[data-canvas-generation-reference-add="true"]',
        ).length,
        bounds: {
          node: {
            top: nodeBounds.top,
            bottom: nodeBounds.bottom,
            centerX: nodeBounds.left + nodeBounds.width / 2,
            width: nodeBounds.width,
            height: nodeBounds.height,
          },
          input: {
            top: inputBounds.top,
            bottom: inputBounds.bottom,
            centerX: inputBounds.left + inputBounds.width / 2,
            width: inputBounds.width,
            height: inputBounds.height,
          },
          toolbar: {
            top: toolbarBounds.top,
            bottom: toolbarBounds.bottom,
            centerX: toolbarBounds.left + toolbarBounds.width / 2,
            width: toolbarBounds.width,
            height: toolbarBounds.height,
          },
        },
        overlap: {
          nodeInput: overlaps(nodeBounds, inputBounds),
          nodeToolbar: overlaps(nodeBounds, toolbarBounds),
          inputToolbar: overlaps(inputBounds, toolbarBounds),
        },
        anchor: {
          inputGap: inputBounds.top - nodeBounds.bottom,
          toolbarGap: nodeBounds.top - toolbarBounds.bottom,
          centerDelta: Math.abs(
            nodeBounds.left + nodeBounds.width / 2 - (inputBounds.left + inputBounds.width / 2),
          ),
          toolbarCenterDelta: Math.abs(
            nodeBounds.left + nodeBounds.width / 2 -
              (toolbarBounds.left + toolbarBounds.width / 2),
          ),
        },
        overflow: {
          nodeHorizontal: nodeContent.scrollWidth > nodeContent.clientWidth,
          inputHorizontal: input.scrollWidth > input.clientWidth,
          inputVertical: input.scrollHeight > input.clientHeight,
          toolbarHorizontal: toolbar.scrollWidth > toolbar.clientWidth,
        },
      };
    })()`);
    if (
      state.kind !== action.kind ||
      state.contentKind !== action.contentKind ||
      !action.label.includes(state.nodeLabel) ||
      !state.emptyIconClass.includes(action.emptyIconClass) ||
      state.inputKind !== action.kind ||
      state.inputPlacement !== 'node-below' ||
      state.inputSurface !== 'editor' ||
      state.inputBackgroundColor === 'rgba(0, 0, 0, 0)' ||
      state.nodeBackgroundColor !== 'rgba(0, 0, 0, 0)' ||
      state.nodeSurfaceBackgroundColor === 'rgba(0, 0, 0, 0)' ||
      state.toolbarBackgroundColor === 'rgba(0, 0, 0, 0)' ||
      state.footerBackgroundColor !== 'rgba(0, 0, 0, 0)' ||
      state.restingControlBackgroundColors.some(
        (backgroundColor) => backgroundColor !== 'rgba(0, 0, 0, 0)',
      ) ||
      state.inputHeadingCount !== 0 ||
      state.inputInsideNode ||
      state.nodeControlCount !== 0 ||
      !action.label.includes(state.toolbarLabel) ||
      state.runButtonCount !== 1 ||
      state.modelTriggerCount !== 1 ||
      state.selectedModelLabel !== action.modelLabel ||
      state.parameterTriggerCount !== (action.kind === 'image' ? 2 : 1) ||
      state.countTriggerCount !== (action.kind === 'image' ? 1 : 0) ||
      state.audioModeTabCount !== (action.kind === 'audio' ? 2 : 0) ||
      state.alertCount !== 0 ||
      state.referenceSummaryCount !== 1 ||
      state.referenceAddCount !== 1 ||
      Math.abs(state.bounds.node.width - action.expectedSize.width) > 1 ||
      Math.abs(state.bounds.node.height - action.expectedSize.height) > 1 ||
      state.bounds.input.width <= 0 ||
      state.bounds.input.height <= 0 ||
      state.bounds.toolbar.width <= 0 ||
      state.bounds.toolbar.height <= 0 ||
      state.bounds.input.width > 680 ||
      state.anchor.inputGap < 0 ||
      state.anchor.inputGap > 24 ||
      state.anchor.toolbarGap < 0 ||
      state.anchor.toolbarGap > 16 ||
      state.anchor.centerDelta > 2 ||
      state.anchor.toolbarCenterDelta > 2 ||
      state.overlap.nodeInput ||
      state.overlap.nodeToolbar ||
      state.overlap.inputToolbar ||
      state.overflow.nodeHorizontal ||
      state.overflow.inputHorizontal ||
      state.overflow.inputVertical ||
      state.overflow.toolbarHorizontal
    ) {
      throw new Error(`Canvas Generation presentation is invalid: ${JSON.stringify(state)}`);
    }

    if (action.kind === 'image') {
      await click(`${inputSelector} [data-canvas-generation-reference-add="true"]`);
      await waitForSelector('[data-canvas-generation-reference-source="workspace"]');
      const sourceChooser = await evaluate(`(() => {
        const menu = document.querySelector('.selection-generation-input-panel__reference-menu');
        if (!(menu instanceof HTMLElement)) throw new Error('Reference source menu is unavailable.');
        const bounds = menu.getBoundingClientRect();
        return {
          sources: [...menu.querySelectorAll('[data-canvas-generation-reference-source]')]
            .map((element) => element.getAttribute('data-canvas-generation-reference-source')),
          width: bounds.width,
          left: bounds.left,
          right: bounds.right,
          viewportWidth: window.innerWidth,
        };
      })()`);
      if (
        sourceChooser.sources.join('|') !== 'workspace|import' ||
        sourceChooser.width > 320 ||
        sourceChooser.left < 0 ||
        sourceChooser.right > sourceChooser.viewportWidth
      ) {
        throw new Error(
          `Canvas Generation reference source menu is invalid: ${JSON.stringify(sourceChooser)}`,
        );
      }
      state = { ...state, sourceChooser };
      screenshots.push(await screenshot('canvas-generation-reference-source-menu'));
      await click(`${inputSelector} [data-canvas-generation-reference-add="true"]`);
    }

    if (action.kind === 'image' || action.kind === 'audio') {
      await click(`${inputSelector} .selection-generation-input-panel__model-trigger`);
      await waitForCondition(
        evaluate,
        `document.querySelector('.selection-generation-input-panel__model-menu .selection-generation-input-panel__model-option') instanceof HTMLElement`,
        'Generation model menu did not stabilize.',
      );
      const modelMenu = await evaluate(`(() => {
      const menu = document.querySelector('.selection-generation-input-panel__model-menu');
      if (!(menu instanceof HTMLElement)) throw new Error('Generation model menu is unavailable.');
      const bounds = menu.getBoundingClientRect();
      return {
        options: [...menu.querySelectorAll('.selection-generation-input-panel__model-option strong')]
          .map((element) => element.textContent?.trim() ?? ''),
        providerRowsInline: [...menu.querySelectorAll('.selection-generation-input-panel__model-option')]
          .every((option) => {
            const model = option.querySelector('strong');
            const provider = option.querySelector('small');
            if (!(model instanceof HTMLElement) || !(provider instanceof HTMLElement)) return false;
            return Math.abs(model.getBoundingClientRect().top - provider.getBoundingClientRect().top) <= 2;
          }),
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    })()`);
      if (
        modelMenu.options.join('|') !== action.modelLabel ||
        !modelMenu.providerRowsInline ||
        modelMenu.left < 0 ||
        modelMenu.right > modelMenu.viewportWidth ||
        modelMenu.top < 0 ||
        modelMenu.bottom > modelMenu.viewportHeight
      ) {
        throw new Error(`Canvas Generation model menu is invalid: ${JSON.stringify(modelMenu)}`);
      }
      screenshots.push(await screenshot(`canvas-generation-${action.kind}-model-menu`));
      await click('.selection-generation-input-panel__model-option');
    }

    if (action.kind !== 'prompt') {
      await click(
        `${inputSelector} button.selection-generation-input-panel__chip:not(.selection-generation-input-panel__model-trigger)`,
      );
      await waitForCondition(
        evaluate,
        `document.querySelector('.selection-generation-input-panel__parameter-menu .selection-generation-input-panel__option-group') instanceof HTMLElement`,
        'Generation parameter menu did not stabilize.',
      );
      const parameters = await evaluate(`(() => {
      const menu = document.querySelector('.selection-generation-input-panel__parameter-menu');
      if (!(menu instanceof HTMLElement)) throw new Error('Generation parameter menu is unavailable.');
      const bounds = menu.getBoundingClientRect();
      const canvas = document.querySelector(${JSON.stringify(`${viewSelector} [data-canvas-viewport-root="true"]`)});
      if (!(canvas instanceof HTMLElement)) throw new Error('Canvas viewport is unavailable.');
      const canvasBounds = canvas.getBoundingClientRect();
      const columnCounts = [...menu.querySelectorAll('.selection-generation-input-panel__option-grid')]
        .map((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
      return {
        groups: [...menu.querySelectorAll('.selection-generation-input-panel__option-group legend')]
          .map((element) => element.textContent?.trim() ?? ''),
        optionCount: menu.querySelectorAll('.selection-generation-input-panel__option-grid button').length,
        clientHeight: menu.clientHeight,
        scrollHeight: menu.scrollHeight,
        top: bounds.top,
        bottom: bounds.bottom,
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
        canvasLeft: canvasBounds.left,
        canvasRight: canvasBounds.right,
        columnCounts,
        viewportHeight: window.innerHeight,
        horizontalOverflow: menu.scrollWidth > menu.clientWidth,
        verticalOverflow: menu.scrollHeight > menu.clientHeight,
      };
    })()`);
      if (
        parameters.groups.length < 2 ||
        parameters.optionCount < 4 ||
        parameters.horizontalOverflow ||
        parameters.top < 0 ||
        parameters.bottom > parameters.viewportHeight ||
        parameters.left < parameters.canvasLeft ||
        parameters.right > parameters.canvasRight ||
        parameters.width < 240 ||
        parameters.width > 500 ||
        parameters.columnCounts.some((count) => count < 2)
      ) {
        throw new Error(
          `Canvas Generation parameter menu is invalid: ${JSON.stringify(parameters)}`,
        );
      }
      screenshots.push(await screenshot(`canvas-generation-${action.kind}-parameters`));
      await click(
        `${inputSelector} button.selection-generation-input-panel__chip:not(.selection-generation-input-panel__model-trigger)`,
      );

      if (action.kind === 'image') {
        await click(`${inputSelector} .selection-generation-input-panel__count-trigger`);
        await waitForCondition(
          evaluate,
          `document.querySelector('.selection-generation-input-panel__count-menu [role="menuitemradio"]') instanceof HTMLElement`,
          'Generation count menu did not stabilize.',
        );
        const countMenu = await evaluate(`(() => {
          const menu = document.querySelector('.selection-generation-input-panel__count-menu');
          if (!(menu instanceof HTMLElement)) throw new Error('Generation count menu is unavailable.');
          const bounds = menu.getBoundingClientRect();
          return {
            options: [...menu.querySelectorAll('[role="menuitemradio"]')]
              .map((element) => element.textContent?.trim() ?? ''),
            width: bounds.width,
            top: bounds.top,
            bottom: bounds.bottom,
            viewportHeight: window.innerHeight,
          };
        })()`);
        if (
          countMenu.options.join('|') !== '× 1|× 2|× 3|× 4' ||
          countMenu.width > 140 ||
          countMenu.top < 0 ||
          countMenu.bottom > countMenu.viewportHeight
        ) {
          throw new Error(`Canvas Generation count menu is invalid: ${JSON.stringify(countMenu)}`);
        }
        state = { ...state, countMenu };
        screenshots.push(await screenshot('canvas-generation-image-count-menu'));
        await click(`${inputSelector} .selection-generation-input-panel__count-trigger`);
      }
    }

    if (action.kind === 'audio') {
      await click(`${inputSelector} .selection-generation-input-panel__mode-tabs button`, 1);
      await click(`${inputSelector} .selection-generation-input-panel__model-trigger`);
      await waitForCondition(
        evaluate,
        `document.querySelector('.selection-generation-input-panel__model-menu .selection-generation-input-panel__model-option') instanceof HTMLElement`,
        'Music model menu did not stabilize.',
      );
      const musicModels = await evaluate(`[
        ...document.querySelectorAll(
          '.selection-generation-input-panel__model-menu .selection-generation-input-panel__model-option strong',
        ),
      ].map((element) => element.textContent?.trim() ?? '')`);
      if (musicModels.join('|') !== 'Canvas Music') {
        throw new Error(`Canvas music model filtering is invalid: ${JSON.stringify(musicModels)}`);
      }
      screenshots.push(await screenshot('canvas-generation-audio-music-mode'));
      await click('.selection-generation-input-panel__model-option');
      const workspaceReference = await qualifyWorkspaceReferenceDrop({
        click,
        drag,
        evaluate,
        inputSelector,
        screenshot,
        waitForSelector,
      });
      state = { ...state, workspaceReference };
    }
    kinds.push(state);
    screenshots.push(await screenshot(`canvas-generation-${action.kind}-selected-large`));

    if (action.kind === 'prompt') {
      const beforeMovePosition = await evaluate(`(() => {
        const node = document.querySelector(${JSON.stringify(nodeSelector)});
        if (!(node instanceof HTMLElement)) throw new Error('Prompt Generation Node is unavailable.');
        return { left: Number.parseFloat(node.style.left), top: Number.parseFloat(node.style.top) };
      })()`);
      await drag(nodeSelector, `${viewSelector} [data-canvas-viewport-root="true"]`, {
        sourcePosition: { xRatio: 0.5, yRatio: 0.25 },
        targetPosition: { xRatio: 0.58, yRatio: 0.38 },
      });
      await waitForCondition(
        evaluate,
        `(() => {
          const node = document.querySelector(${JSON.stringify(nodeSelector)});
          const input = document.querySelector(${JSON.stringify(inputSelector)});
          if (!(node instanceof HTMLElement) || !(input instanceof HTMLElement)) return false;
          const nodeBounds = node.getBoundingClientRect();
          const inputBounds = input.getBoundingClientRect();
          const moved =
            Math.abs(Number.parseFloat(node.style.left) - ${String(beforeMovePosition.left)}) > 20 ||
            Math.abs(Number.parseFloat(node.style.top) - ${String(beforeMovePosition.top)}) > 20;
          const gap = inputBounds.top - nodeBounds.bottom;
          return moved && gap >= 0 && gap <= 24;
        })()`,
        'Generation input did not follow the moved Prompt node.',
      );
      const moved = await evaluate(`(() => {
        const node = document.querySelector(${JSON.stringify(nodeSelector)});
        const input = document.querySelector(${JSON.stringify(inputSelector)});
        if (!(node instanceof HTMLElement) || !(input instanceof HTMLElement)) {
          throw new Error('Moved Prompt Generation presentation is unavailable.');
        }
        const nodeBounds = node.getBoundingClientRect();
        const inputBounds = input.getBoundingClientRect();
        return {
          nodeCenterX: nodeBounds.left + nodeBounds.width / 2,
          inputCenterX: inputBounds.left + inputBounds.width / 2,
          nodePosition: {
            left: Number.parseFloat(node.style.left),
            top: Number.parseFloat(node.style.top),
          },
          placement: input.getAttribute('data-placement'),
          gap: inputBounds.top - nodeBounds.bottom,
        };
      })()`);
      screenshots.push(await screenshot('canvas-generation-prompt-node-follow'));
      await resizeWindow(evaluate, 1040, 700);
      try {
        await waitForCondition(
          evaluate,
          `(() => {
            const node = document.querySelector(${JSON.stringify(nodeSelector)});
            const input = document.querySelector(${JSON.stringify(inputSelector)});
            if (!(node instanceof HTMLElement) || !(input instanceof HTMLElement)) return false;
            const nodeBounds = node.getBoundingClientRect();
            const inputBounds = input.getBoundingClientRect();
            return input.getAttribute('data-placement') === 'node-below' &&
              nodeBounds.bottom <= inputBounds.top;
          })()`,
          'Compact Generation input did not remain adjacent to its node.',
        );
      } catch (error) {
        const geometry = await evaluate(`(() => {
          const node = document.querySelector(${JSON.stringify(nodeSelector)});
          const input = document.querySelector(${JSON.stringify(inputSelector)});
          const root = document.querySelector(${JSON.stringify(`${viewSelector} [data-canvas-viewport-root="true"]`)});
          const layer = document.querySelector(${JSON.stringify(`${viewSelector} [data-canvas-viewport-layer]`)});
          const bounds = (element) => {
            if (!(element instanceof HTMLElement)) return undefined;
            const rect = element.getBoundingClientRect();
            return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
          };
          return {
            node: bounds(node),
            input: bounds(input),
            root: bounds(root),
            layerTransform: layer instanceof HTMLElement ? layer.style.transform : undefined,
            window: { width: window.innerWidth, height: window.innerHeight },
          };
        })()`);
        throw new Error(
          `${error instanceof Error ? error.message : String(error)} ${JSON.stringify(geometry)}`,
        );
      }
      const compact = await evaluate(`(() => {
        const node = document.querySelector(${JSON.stringify(nodeSelector)});
        if (!(node instanceof HTMLElement)) throw new Error('Compact Generation Node is unavailable.');
        const input = document.querySelector(${JSON.stringify(inputSelector)});
        if (!(input instanceof HTMLElement)) throw new Error('Compact Generation input is unavailable.');
        const nodeBounds = node.getBoundingClientRect();
        const inputBounds = input.getBoundingClientRect();
        return {
          width: window.innerWidth,
          height: window.innerHeight,
          nodeWidth: nodeBounds.width,
          nodeHeight: nodeBounds.height,
          inputWidth: inputBounds.width,
          inputHeight: inputBounds.height,
          inputLeft: inputBounds.left,
          inputRight: inputBounds.right,
          inputBottom: inputBounds.bottom,
          nodeTop: nodeBounds.top,
          nodeBottom: nodeBounds.bottom,
          inputTop: inputBounds.top,
          inputPlacement: input.getAttribute('data-placement'),
          nodeInputOverlap: !(
            nodeBounds.right <= inputBounds.left ||
            inputBounds.right <= nodeBounds.left ||
            nodeBounds.bottom <= inputBounds.top ||
            inputBounds.bottom <= nodeBounds.top
          ),
          bodyScrollWidth: document.body.scrollWidth,
          bodyClientWidth: document.body.clientWidth,
        };
      })()`);
      if (
        compact.inputWidth <= 0 ||
        compact.inputHeight <= 0 ||
        compact.inputLeft < 0 ||
        compact.inputRight > compact.width ||
        Math.abs(compact.nodeWidth - action.expectedSize.width) > 1 ||
        Math.abs(compact.nodeHeight - action.expectedSize.height) > 1 ||
        compact.nodeInputOverlap ||
        compact.bodyScrollWidth > compact.bodyClientWidth
      ) {
        throw new Error(`Compact Generation presentation is invalid: ${JSON.stringify(compact)}`);
      }
      kinds[kinds.length - 1] = { ...state, moved, compact };
      screenshots.push(await screenshot('canvas-generation-prompt-selected-compact'));
      await resizeWindow(evaluate, 1200, 800);
    }

    if (index < actions.length - 1) {
      await click(`${viewSelector} [data-selection-overflow="true"]`);
      await waitForSelector(
        '[data-selection-action="delete-selection"][data-selection-action-location="overflow"]',
      );
      await click(
        '[data-selection-action="delete-selection"][data-selection-action-location="overflow"]',
      );
      await waitForCanvasNodeCount(evaluate, viewId, 3);
    }
  }

  return { catalog, kinds, maximumNodeCount, screenshots };
}

async function qualifyWorkspaceReferenceDrop({
  click,
  drag,
  evaluate,
  inputSelector,
  screenshot,
  waitForSelector,
}) {
  const mediaExpanded = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.neko-resource-browser__item-row')];
    const mediaRow = rows.find((row) =>
      row.querySelector('strong')?.textContent?.trim() === 'media',
    );
    const mediaItem = mediaRow?.querySelector('.neko-resource-browser__item');
    const disclosure = mediaRow?.querySelector('.neko-resource-browser__disclosure');
    if (!(mediaItem instanceof HTMLButtonElement) || !(disclosure instanceof HTMLElement)) {
      throw new Error('Workspace media directory is unavailable for Generation references.');
    }
    disclosure.dataset.canvasGenerationMediaDisclosure = 'true';
    return mediaItem.getAttribute('aria-expanded') === 'true';
  })()`);
  if (!mediaExpanded) await click('[data-canvas-generation-media-disclosure="true"]');
  await waitForCondition(
    evaluate,
    `(() => {
      const source = [...document.querySelectorAll('.neko-resource-browser__item')].find((item) =>
        item.querySelector('strong')?.textContent?.trim() === 'tone.wav',
      );
      if (!(source instanceof HTMLButtonElement) || !source.draggable) return false;
      source.dataset.canvasGenerationReferenceSource = 'true';
      return true;
    })()`,
    'Workspace audio resource did not become draggable.',
  );
  await drag(
    '[data-canvas-generation-reference-source="true"]',
    `${inputSelector} [data-canvas-generation-reference-zone="true"]`,
    { targetPosition: { xRatio: 0.7, yRatio: 0.5 } },
  );
  await waitForSelector(`${inputSelector} .selection-generation-input-panel__reference`, 30_000);
  const evidence = await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(inputSelector)});
    if (!(input instanceof HTMLElement)) throw new Error('Generation input is unavailable.');
    const references = [...input.querySelectorAll('.selection-generation-input-panel__reference')]
      .map((element) => element.textContent?.trim() ?? '');
    return {
      references,
      dragActive: input
        .querySelector('[data-canvas-generation-reference-zone="true"]')
        ?.getAttribute('data-drag-active'),
    };
  })()`);
  if (evidence.references.length !== 1 || !evidence.references[0]?.includes('tone.wav')) {
    throw new Error(`Workspace reference drop is invalid: ${JSON.stringify(evidence)}`);
  }
  return { ...evidence, screenshot: await screenshot('canvas-generation-workspace-reference') };
}

async function resizeWindow(evaluate, width, height) {
  await evaluate(`window.resizeTo(${String(width)}, ${String(height)})`);
  await waitForCondition(
    evaluate,
    `window.innerWidth <= ${String(width)} && window.innerHeight <= ${String(height)}`,
    `Desktop window did not resize to ${String(width)}x${String(height)}.`,
  );
  await delay(250);
}

function readInteractionWidth(evaluate) {
  return evaluate(`(() => {
    const interaction = document.querySelector('.neko-controlled-workbench-interaction');
    if (!(interaction instanceof HTMLElement)) {
      throw new Error('Desktop Agent Interaction is missing.');
    }
    return interaction.getBoundingClientRect().width;
  })()`);
}

async function waitForCondition(evaluate, expression, message, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(message);
}

async function waitForInteractiveSelector(evaluate, selector) {
  const deadline = Date.now() + 10_000;
  let last;
  while (Date.now() < deadline) {
    const sample = await evaluate(`(() => {
      const target = document.querySelector(${JSON.stringify(selector)});
      if (!(target instanceof HTMLElement)) return { available: false };
      const bounds = target.getBoundingClientRect();
      const point = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      const hit = document.elementFromPoint(point.x, point.y);
      const workbench = target.closest('.desktop-scene-workbench');
      const ancestor = (selector) => {
        const element = target.closest(selector);
        if (!(element instanceof HTMLElement)) return undefined;
        const rect = element.getBoundingClientRect();
        return {
          selector,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          overflow: getComputedStyle(element).overflow,
          position: getComputedStyle(element).position,
        };
      };
      return {
        available: true,
        activeWorkbench: workbench?.getAttribute('data-active'),
        hiddenWorkbench: workbench?.hasAttribute('hidden'),
        bounds: {
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
        },
        hit: hit instanceof Element ? hit.tagName + '.' + hit.className : undefined,
        ancestors: [
          ancestor('.canvas-webview-root'),
          ancestor('.project-main-view-stack__item'),
          ancestor('.project-main-group__content'),
          ancestor('.desktop-workbench-slot-target'),
          ancestor('.neko-controlled-workbench-main'),
        ],
        interactive: bounds.width > 0 && bounds.height > 0 &&
          (hit === target || (hit instanceof Node && target.contains(hit))),
      };
    })()`);
    last = sample;
    if (sample.interactive) return;
    await delay(100);
  }
  throw new Error(`Desktop Canvas control is not interactive: ${JSON.stringify(last)}`);
}

async function waitForResizeLifecycleCompletion(evaluate, widthBefore) {
  const deadline = Date.now() + 5_000;
  let last;
  while (Date.now() < deadline) {
    const sample = await evaluate(`(() => {
      const interaction = document.querySelector('.neko-controlled-workbench-interaction');
      if (!(interaction instanceof HTMLElement)) {
        throw new Error('Desktop Agent Interaction is missing.');
      }
      return {
        widthBefore: ${String(widthBefore)},
        widthAfter: interaction.getBoundingClientRect().width,
        resizingOwnerCount: document.querySelectorAll('[data-resizing="true"]').length,
      };
    })()`);
    last = sample;
    if (sample.widthAfter !== widthBefore && sample.resizingOwnerCount === 0) return sample;
    await delay(100);
  }
  throw new Error(`Desktop resize lifecycle did not complete: ${JSON.stringify(last)}`);
}

async function waitForCanvasNodeCount(evaluate, viewId, expectedCount) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const nodeCount = await evaluate(`(() => {
      const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
      return root?.querySelectorAll('[data-node-presentation]').length ?? 0;
    })()`);
    if (nodeCount === expectedCount) return nodeCount;
    await delay(100);
  }
  throw new Error(
    `Canvas View '${viewId}' did not reach ${String(expectedCount)} authored nodes before timeout.`,
  );
}

async function waitForCanvasStorylinePlayback(evaluate, viewId, expectedPaused) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    const sample = await evaluate(`(() => {
      const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
      const media = root?.querySelector('.canvas-playback-overlay-preview video');
      return {
        url: media instanceof HTMLMediaElement ? media.src : undefined,
        currentTime: media instanceof HTMLMediaElement ? media.currentTime : undefined,
        paused: media instanceof HTMLMediaElement ? media.paused : undefined,
        expanded: root
          ?.querySelector('[data-testid="canvas-playback-overlay"]')
          ?.getAttribute('data-expanded'),
        unitId: root
          ?.querySelector('[data-testid="canvas-playback-stage"]')
          ?.getAttribute('data-unit-id'),
        transportTitles: Array.from(
          root?.querySelectorAll('[data-testid="canvas-playback-controller"] button') ?? [],
          (button) => button.getAttribute('title'),
        ),
      };
    })()`);
    last = sample;
    if (
      sample?.url?.startsWith('openneko://resource/') &&
      sample.paused === expectedPaused &&
      (expectedPaused || sample.currentTime > 0.15)
    ) {
      return sample;
    }
    await delay(100);
  }
  throw new Error(
    `Canvas Storyline playback did not reach paused=${String(expectedPaused)}: ${JSON.stringify(last)}.`,
  );
}

async function waitForCanvasPlaybackOverlayRemoved(evaluate, viewId) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const visible = await evaluate(`Boolean(
      document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}] [data-testid="canvas-playback-overlay"]'),
    )`);
    if (!visible) return;
    await delay(100);
  }
  throw new Error('Canvas Storyline overlay remained visible after close.');
}

async function waitForCanvasRoots(evaluate) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const ready = await evaluate(`(() => {
      const roots = [...document.querySelectorAll('[data-owner-root="canvas"]')];
      return roots.length === 2 &&
        document.querySelector('[data-owner-view-id="canvas:functional:video"] video[controls]') !== null &&
        document.querySelector('[data-owner-view-id="canvas:functional:audio"] audio:not([controls])') !== null &&
        document.querySelector('[data-owner-view-id="canvas:functional:audio"] [data-testid="preview-lightweight-audio-waveform"]') !== null;
    })()`);
    if (ready) return;
    await delay(100);
  }
  throw new Error('Canvas two-View package-owned media actions were not ready before timeout.');
}

async function waitForCanvasMediaPlayback(evaluate, viewId, mediaType, minimumTime = 0) {
  const deadline = Date.now() + 30_000;
  let last;
  while (Date.now() < deadline) {
    const sample = await evaluate(`(() => {
      const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
      const media = root?.querySelector(${JSON.stringify(mediaType)});
      return {
        url: media instanceof HTMLMediaElement ? media.src : undefined,
        currentTime: media instanceof HTMLMediaElement ? media.currentTime : undefined,
        paused: media instanceof HTMLMediaElement ? media.paused : undefined,
        readyState: media instanceof HTMLMediaElement ? media.readyState : undefined,
        errorCode: media instanceof HTMLMediaElement ? media.error?.code : undefined,
      };
    })()`);
    last = sample;
    if (
      sample?.url?.startsWith('openneko://resource/') &&
      sample.currentTime > Math.max(0.15, minimumTime + 0.15)
    ) {
      return sample;
    }
    await delay(100);
  }
  throw new Error(
    `Canvas ${mediaType} playback did not advance before timeout: ${JSON.stringify(last)}`,
  );
}

async function waitForCanvasMediaPaused(
  evaluate,
  viewId,
  mediaType,
  expectedPaused,
  expectedControls = true,
) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const sample = await evaluate(`(() => {
      const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
      const media = root?.querySelector(${JSON.stringify(mediaType)});
      return {
        paused: media instanceof HTMLMediaElement ? media.paused : undefined,
        controls: media instanceof HTMLMediaElement ? media.controls : undefined,
      };
    })()`);
    if (sample?.paused === expectedPaused && sample.controls === expectedControls) return;
    await delay(100);
  }
  throw new Error(
    `Canvas ${mediaType} paused state did not reach ${String(expectedPaused)} before timeout.`,
  );
}

async function setCanvasMediaPaused(evaluate, viewId, mediaType, paused) {
  await evaluate(`(() => {
    const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
    const media = root?.querySelector(${JSON.stringify(mediaType)});
    if (!(media instanceof HTMLMediaElement) || !media.controls) {
      throw new Error('Canvas native ${mediaType} controls are unavailable.');
    }
    if (${JSON.stringify(paused)}) media.pause();
    else void media.play();
  })()`);
}

async function waitForCanvasRootsRemoved(evaluate) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const count = await evaluate(`document.querySelectorAll('[data-owner-root="canvas"]').length`);
    if (count === 0) return;
    await delay(100);
  }
  throw new Error('Canvas Roots remained mounted after Workbench teardown.');
}

async function waitForReleasedUrl(evaluate, url, mediaType) {
  const deadline = Date.now() + 10_000;
  let lastStatus;
  while (Date.now() < deadline) {
    const status = await readFetchStatus(evaluate, url);
    lastStatus = status;
    if (status === 0) return status;
    await delay(100);
  }
  throw new Error(
    `Canvas ${mediaType} View resource remained reachable after teardown with status ${String(lastStatus)}.`,
  );
}

function canvasDocument(name, nodeId, path, mediaType, extraNodes = [], connections = []) {
  return {
    name,
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [
      {
        id: nodeId,
        type: 'media',
        position: { x: 80, y: 80 },
        size: { width: 320, height: 220 },
        zIndex: 1,
        data: {
          title: `${name} locator-backed node`,
          assetPath: path,
          contentLocator: { file: { authority: 'workspace', path } },
          mediaType,
        },
      },
      ...extraNodes,
    ],
    connections,
  };
}

function denseConnectionFixture() {
  return [
    fixtureConnection('edge-video-cut', 'video-node', 'cut-document-node'),
    fixtureConnection('edge-video-epub', 'video-node', 'epub-image-node'),
    fixtureConnection('edge-cut-video', 'cut-document-node', 'video-node'),
    fixtureConnection('edge-cut-epub', 'cut-document-node', 'epub-image-node'),
    fixtureConnection('edge-epub-video', 'epub-image-node', 'video-node'),
    fixtureConnection('edge-epub-cut', 'epub-image-node', 'cut-document-node'),
  ];
}

function fixtureConnection(id, sourceId, targetId) {
  return {
    id,
    sourceId,
    targetId,
    sourceEndpoint: { nodeId: sourceId, scope: 'node' },
    targetEndpoint: { nodeId: targetId, scope: 'node' },
    type: 'derived-from',
  };
}

function cutDocumentNode(nodeId, path) {
  return {
    id: nodeId,
    type: 'file',
    position: { x: 360, y: 360 },
    size: { width: 260, height: 180 },
    zIndex: 2,
    data: {
      title: path,
      path,
      mediaKind: 'document',
      contentLocator: { file: { authority: 'workspace', path } },
    },
  };
}

function epubImageNode(nodeId) {
  return {
    id: nodeId,
    type: 'media',
    position: { x: 80, y: 360 },
    size: { width: 240, height: 180 },
    zIndex: 2,
    data: {
      title: 'EPUB page 1',
      assetPath: 'OEBPS/images/page-1.png',
      contentLocator: {
        file: { authority: 'workspace', path: 'synthetic-document.epub' },
        selector: { kind: 'entry', path: 'OEBPS/images/page-1.png' },
      },
      mediaType: 'image',
    },
  };
}

function markdownNode(nodeId) {
  return {
    id: nodeId,
    type: 'markdown',
    position: { x: 440, y: 80 },
    size: { width: 260, height: 180 },
    zIndex: 2,
    data: {
      title: 'Image Description',
      content: [
        '# 第一章：画布分析',
        '',
        '这是一个紧凑的画布分析节点，默认显示所见所得内容。',
        '',
        '- 选中保持阅读模式',
        '- 双击进入画布内全屏编辑',
        '- 节点内容独立滚动',
        '- 画布空白区域继续平移',
        '- 修饰键滚轮继续缩放画布',
        '- 滚动边界不会把手势交还画布',
        '- 文件预览采用相同滚动契约',
        '- 生成文本输出采用相同滚动契约',
      ].join('\n'),
    },
  };
}

function textFileNode(nodeId, path) {
  return {
    id: nodeId,
    type: 'file',
    position: { x: 440, y: 360 },
    size: { width: 280, height: 180 },
    zIndex: 2,
    data: {
      title: 'copied-reference.md',
      path,
      mediaType: 'text/markdown',
      contentLocator: { file: { authority: 'workspace', path } },
    },
  };
}

async function waitForCopiedFilePreview(evaluate) {
  return evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const inspect = () => {
      const view = document.querySelector('[data-owner-view-id="canvas:functional:audio"]');
      const copiedNode = [...(view?.querySelectorAll('[data-node-selected="true"]') ?? [])].find(
        (node) =>
          node.getAttribute('data-node-id') !== 'text-file-node' &&
          node.querySelector('[data-canvas-content-kind="file"]')
      );
      const preview = copiedNode?.querySelector('[data-canvas-content-kind="file"]');
      const status = preview?.getAttribute('data-text-preview-status');
      if (copiedNode && preview && status === 'ready') {
        resolve({
          nodeId: copiedNode.getAttribute('data-node-id'),
          status,
          kind: preview.getAttribute('data-text-preview-kind'),
          text: preview.textContent ?? '',
        });
        return;
      }
      if (status === 'unavailable' || status === 'local-error') {
        reject(new Error('Copied Canvas file preview failed: ' + (preview?.textContent ?? status)));
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('Copied Canvas file preview did not become ready.'));
        return;
      }
      window.setTimeout(inspect, 25);
    };
    inspect();
  })`);
}

async function waitForCopiedImagePreview(evaluate) {
  return evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000;
    const inspect = () => {
      const view = document.querySelector('[data-owner-view-id="canvas:functional:video"]');
      const copiedNode = [...(view?.querySelectorAll('[data-node-selected="true"]') ?? [])].find(
        (node) =>
          node.getAttribute('data-node-id') !== 'epub-image-node' &&
          node.querySelector('[data-testid="canvas-media-node"][data-media-type="image"]')
      );
      const image = copiedNode?.querySelector('img');
      if (image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0) {
        resolve({
          nodeId: copiedNode.getAttribute('data-node-id'),
          src: image.currentSrc || image.src,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        });
        return;
      }
      const diagnostic = copiedNode?.querySelector('[role="status"]');
      if (diagnostic && !image) {
        reject(new Error('Copied Canvas image preview failed: ' + (diagnostic.textContent ?? '')));
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('Copied Canvas image preview did not decode.'));
        return;
      }
      window.setTimeout(inspect, 25);
    };
    inspect();
  })`);
}

function emptyOtioDocument() {
  return {
    OTIO_SCHEMA: 'Timeline.1',
    name: 'Story',
    global_start_time: null,
    metadata: {
      openneko: {
        cut: {
          profile: '1080p30',
          editRateNumerator: 30,
          editRateDenominator: 1,
          width: 1920,
          height: 1080,
        },
      },
    },
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'Tracks',
      metadata: {},
      effects: [],
      markers: [],
      children: [
        {
          OTIO_SCHEMA: 'Track.1',
          name: 'Video 1',
          kind: 'Video',
          children: [],
          metadata: { openneko: { cut: { trackId: 'video-1' } } },
          enabled: true,
          effects: [],
          markers: [],
        },
      ],
    },
  };
}

function inspectCanvasMarkdownNode(evaluate, selector) {
  return evaluate(`(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!(node instanceof HTMLElement)) throw new Error('Canvas Markdown node is unavailable.');
    const card = node.querySelector('.node-card');
    const heading = node.querySelector('h1');
    const scrollSurface = node.querySelector('.canvas-markdown-node__preview');
    const rect = card?.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    return {
      editing: false,
      textareaCount: node.querySelectorAll('textarea').length,
      proseMirrorCount: node.querySelectorAll('.ProseMirror').length,
      headingSize: heading ? Number.parseFloat(getComputedStyle(heading).fontSize) : 0,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      left: nodeRect.left,
      top: nodeRect.top,
      scrollTop: scrollSurface instanceof HTMLElement ? scrollSurface.scrollTop : 0,
      scrollHeight: scrollSurface instanceof HTMLElement ? scrollSurface.scrollHeight : 0,
      clientHeight: scrollSurface instanceof HTMLElement ? scrollSurface.clientHeight : 0,
      wheelOwner:
        scrollSurface instanceof HTMLElement
          ? scrollSurface.getAttribute('data-canvas-wheel-owner')
          : null,
      text: node.textContent ?? '',
    };
  })()`);
}

function inspectCanvasMarkdownEditor(evaluate, viewId) {
  return evaluate(`(() => {
    const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
    const viewport = root?.querySelector('[data-canvas-viewport-root="true"]');
    const overlay = root?.querySelector('[data-canvas-markdown-editor="true"]');
    const body = overlay?.querySelector('.canvas-markdown-editor-overlay__body');
    const editor = overlay?.querySelector('.ProseMirror');
    const overlayRect = overlay?.getBoundingClientRect();
    const viewportRect = viewport?.getBoundingClientRect();
    return {
      overlayCount: root?.querySelectorAll('[data-canvas-markdown-editor="true"]').length ?? 0,
      modal: overlay?.getAttribute('aria-modal'),
      editorState: overlay?.getAttribute('data-editor-state'),
      canvasInteractionSuspended: viewport?.getAttribute('data-canvas-interaction-suspended'),
      nodeProseMirrorCount:
        root?.querySelectorAll('[data-node-id="markdown-node"] .ProseMirror').length ?? 0,
      editorProseMirrorCount: overlay?.querySelectorAll('.ProseMirror').length ?? 0,
      contentEditable: editor?.getAttribute('contenteditable'),
      wheelOwner: body?.getAttribute('data-canvas-wheel-owner'),
      scrollTop: body instanceof HTMLElement ? body.scrollTop : 0,
      scrollHeight: body instanceof HTMLElement ? body.scrollHeight : 0,
      clientHeight: body instanceof HTMLElement ? body.clientHeight : 0,
      overlayWidth: overlayRect?.width ?? 0,
      overlayHeight: overlayRect?.height ?? 0,
      viewportWidth: viewportRect?.width ?? 0,
      viewportHeight: viewportRect?.height ?? 0,
      viewportTransform:
        root?.querySelector('[data-canvas-viewport-layer]')?.getAttribute('style') ?? '',
      text: overlay?.textContent ?? '',
    };
  })()`);
}

function inspectCanvasConnectionVisuals(evaluate, viewId) {
  return evaluate(`(() => {
    const view = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
    if (!(view instanceof HTMLElement)) throw new Error('Canvas View is unavailable.');
    const groups = [...view.querySelectorAll('.connection-group')];
    const lines = groups
      .map((group) => group.querySelector('.connection-line'))
      .filter((line) => line instanceof SVGPathElement);
    const selected = groups.find((group) => group.getAttribute('data-selected') === 'true');
    const selectedLine = selected?.querySelector('.connection-line');
    return {
      connectionCount: groups.length,
      selectedCount: groups.filter((group) => group.getAttribute('data-selected') === 'true').length,
      maximumLineOpacity: Math.max(
        0,
        ...lines.map((line) => Number(line.getAttribute('stroke-opacity') ?? 0)),
      ),
      selectedLineOpacity:
        selectedLine instanceof SVGPathElement
          ? Number(selectedLine.getAttribute('stroke-opacity') ?? 0)
          : 0,
      flowDotCount: view.querySelectorAll('.connection-flow-dot').length,
    };
  })()`);
}

function inspectCanvasSelectionActions(evaluate, viewId) {
  return evaluate(`(() => {
    const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
    const actions = [...(root?.querySelectorAll('[data-selection-action]') ?? [])];
    const overflow = root?.querySelector('[data-selection-overflow="true"]');
    return {
      actionIds: actions.map((action) => action.getAttribute('data-selection-action')),
      disabledActionIds: actions
        .filter((action) => action instanceof HTMLButtonElement && action.disabled)
        .map((action) => action.getAttribute('data-selection-action')),
      visible: actions
        .filter((action) => action.getAttribute('data-selection-action-location') === 'primary')
        .map((action) =>
          action.getAttribute('aria-label') ??
          action.getAttribute('title') ??
          action.textContent?.trim() ??
          ''
        ),
      overflowActionIds: (overflow?.getAttribute('data-selection-overflow-actions') ?? '')
        .split(' ')
        .filter(Boolean),
      hasError: root?.querySelector('[data-material-actions-status="error"]') !== null,
    };
  })()`);
}

function inspectCanvasSelectionAndViewport(evaluate, viewId) {
  return evaluate(`(() => {
    const root = document.querySelector('[data-owner-view-id=${JSON.stringify(viewId)}]');
    return {
      selectedNodeIds: [...(root?.querySelectorAll('[data-node-selected="true"]') ?? [])]
        .map((node) => node.getAttribute('data-node-id')),
      viewportTransform:
        root?.querySelector('[data-canvas-viewport-layer]')?.getAttribute('style') ?? '',
    };
  })()`);
}

function inspectCanvasCutHandoff(evaluate) {
  return evaluate(`(() => {
    const panel = document.querySelector('[data-workbench-cut-panel="true"]');
    const active = panel?.querySelector(
      '.neko-workbench-editor-tab[aria-selected="true"] .neko-workbench-editor-tab__label'
    );
    return {
      activeLabel: active?.textContent?.trim(),
      clipCount: panel?.querySelectorAll('.cut-basic-clip').length ?? 0,
      cutRootCount: panel?.querySelectorAll('[data-owner-root="cut"]').length ?? 0,
    };
  })()`);
}

function hideFunctionalCutPanel(evaluate) {
  return replaceWorkbench(
    evaluate,
    `(projection, current) => ({
      ...current,
      cutPanel: current.cutPanel
        ? { ...current.cutPanel, presentation: 'hidden' }
        : current.cutPanel,
    })`,
  );
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
