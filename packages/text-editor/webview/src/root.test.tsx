// @vitest-environment jsdom

import { acceptCompletion, currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import type {
  ApplyTextDocumentEditsCommand,
  PrepareTextEditorMarkdownMediaRequest,
  ReleaseTextEditorMarkdownMediaRequest,
  TextDocumentChange,
  TextDocumentProjection,
  TextEditorMarkdownMediaProjection,
  TextEditorMarkdownReferenceSearchRequest,
  TextEditorMarkdownReferenceSearchResult,
} from '@neko/text-editor-domain';
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TextEditorHostRuntime } from './host-runtime';
import { createDefaultTextEditorPresentationSnapshot } from './presentation-snapshot';
import { TextEditorRoot } from './root';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeAll(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  });
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0),
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: (handle: number) => window.clearTimeout(handle),
  });
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => emptyRectList(),
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect(),
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect(),
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('TextEditorRoot', () => {
  it('keeps one CodeMirror instance while accepted edits, undo and redo use revisioned commands', async () => {
    const runtime = createRuntime(textProjection('markdown', '# Draft\n'));
    const rendered = await renderEditor(runtime);
    const initialView = editorView(rendered.container);

    await act(async () => {
      initialView.dispatch({ changes: { from: 2, to: 7, insert: 'Saved' } });
      await settle();
    });

    expect(runtime.applyEdits).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        expectedEditSequence: 0,
        changes: [{ from: 2, to: 7, insert: 'Saved' }],
      }),
    );
    expect(editorView(rendered.container)).toBe(initialView);
    expect(initialView.state.doc.toString()).toBe('# Saved\n');
    expect(rendered.container.querySelector('.cm-content')?.getAttribute('aria-label')).toBe(
      'Document editor',
    );
    expect(document.head.querySelector('style[nonce="text-editor-test-csp"]')).not.toBeNull();

    await pressShortcut(rendered.container, { code: 'KeyZ', key: 'z', metaKey: true });
    await waitFor(() => runtime.applyEdits.mock.calls.length === 2);
    expect(runtime.applyEdits.mock.calls[1]?.[0]).toMatchObject({ expectedEditSequence: 1 });
    expect(initialView.state.doc.toString()).toBe('# Draft\n');

    await pressShortcut(rendered.container, {
      code: 'KeyZ',
      key: 'z',
      metaKey: true,
      shiftKey: true,
    });
    await waitFor(() => runtime.applyEdits.mock.calls.length === 3);
    expect(runtime.applyEdits.mock.calls[2]?.[0]).toMatchObject({ expectedEditSequence: 2 });
    expect(initialView.state.doc.toString()).toBe('# Saved\n');
    await unmount(rendered.root);
  });

  it('buffers CJK composition into one full-document command', async () => {
    const runtime = createRuntime(textProjection('markdown', '初稿'));
    const rendered = await renderEditor(runtime, 'zh-cn');
    const view = editorView(rendered.container);

    await act(async () => {
      view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      view.dispatch({ changes: { from: 2, to: 2, insert: '完成' } });
      view.contentDOM.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      await settle();
    });

    expect(runtime.applyEdits).toHaveBeenCalledTimes(1);
    expect(runtime.applyEdits).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedEditSequence: 0,
        changes: [{ from: 0, to: 2, insert: '初稿完成' }],
      }),
    );
    expect(view.contentDOM.getAttribute('aria-label')).toBe('文档编辑器');
    await unmount(rendered.root);
  });

  it('accepts Markdown reference completion through the canonical revisioned edit path', async () => {
    const runtime = createRuntime(textProjection('markdown', '@小'));
    runtime.searchMarkdownReferences.mockImplementation(async (request) => ({
      status: 'ready',
      projection: {
        ...referenceProjection(request),
        candidates: [
          {
            kind: 'mention',
            source: 'entity',
            ref: { kind: 'character', id: 'character-1' },
            label: '小橘',
          },
        ],
      },
    }));
    const rendered = await renderEditor(runtime, 'zh-cn');
    const view = editorView(rendered.container);

    await act(async () => {
      view.dispatch({ selection: { anchor: 2 } });
      startCompletion(view);
      await delay(150);
    });
    await waitFor(() => currentCompletions(view.state).length === 1);
    expect(currentCompletions(view.state)[0]?.label).toBe('@小橘');

    await act(async () => {
      expect(acceptCompletion(view)).toBe(true);
      await settle();
    });
    await waitFor(() => runtime.applyEdits.mock.calls.length === 1);
    expect(runtime.applyEdits).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedEditSequence: 0,
        changes: [{ from: 0, to: 2, insert: '@小橘' }],
      }),
    );
    await unmount(rendered.root);
  });

  it('does not start semantic Markdown completion while CJK IME composition owns input', async () => {
    const runtime = createRuntime(textProjection('markdown', '@小'));
    const rendered = await renderEditor(runtime, 'zh-cn');
    const view = editorView(rendered.container);

    await act(async () => {
      view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      view.dispatch({ selection: { anchor: 2 } });
      startCompletion(view);
      await delay(150);
    });
    expect(runtime.searchMarkdownReferences).not.toHaveBeenCalled();
    expect(currentCompletions(view.state)).toEqual([]);
    await act(async () => {
      view.contentDOM.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      await settle();
    });
    await unmount(rendered.root);
  });

  it('submits Rich CJK composition, undo and redo through the same document sequence', async () => {
    const runtime = createRuntime(textProjection('markdown', '初稿'));
    const rendered = await renderEditor(runtime, 'zh-cn');
    await clickText(rendered.container, '所见即所得');
    await waitFor(
      () => rendered.container.querySelector('[data-rich-state="ready"]') !== null,
      200,
    );
    const rich = rendered.container.querySelector<HTMLElement>('.ProseMirror');
    const text = rich?.querySelector('p')?.firstChild;
    if (!rich || !text) throw new Error('Rich CJK fixture requires an editable paragraph.');

    await act(async () => {
      rich.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      text.nodeValue = '初稿完成';
      await delay(20);
      rich.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      await delay(20);
    });
    await waitFor(() => runtime.applyEdits.mock.calls.length === 1, 100);
    expect(runtime.applyEdits).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        expectedEditSequence: 0,
        changes: [{ from: 0, to: 2, insert: '初稿完成\n' }],
      }),
    );

    await pressShortcut(rendered.container, { code: 'KeyZ', key: 'z', metaKey: true });
    await waitFor(() => runtime.applyEdits.mock.calls.length === 2, 100);
    expect(runtime.applyEdits.mock.calls[1]?.[0]).toMatchObject({ expectedEditSequence: 1 });
    expect(rendered.container.querySelector('.ProseMirror')?.textContent).toBe('初稿');

    await pressShortcut(rendered.container, {
      code: 'KeyZ',
      key: 'z',
      metaKey: true,
      shiftKey: true,
    });
    await waitFor(() => runtime.applyEdits.mock.calls.length === 3, 100);
    expect(runtime.applyEdits.mock.calls[2]?.[0]).toMatchObject({ expectedEditSequence: 2 });
    expect(rendered.container.querySelector('.ProseMirror')?.textContent).toBe('初稿完成');
    await unmount(rendered.root);
  });

  it('keeps newer Rich input visible while an earlier edit is being accepted', async () => {
    const initial = textProjection('markdown', '初稿');
    const firstAccepted = {
      ...initial,
      source: '初稿一\n',
      editSequence: 1,
      dirty: true,
    };
    const secondAccepted = {
      ...firstAccepted,
      source: '初稿一二\n',
      editSequence: 2,
    };
    const first = createDeferred<TextDocumentProjection>();
    const second = createDeferred<TextDocumentProjection>();
    const runtime = createRuntime(initial);
    runtime.applyEdits
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const rendered = await renderEditor(runtime, 'zh-cn');

    await clickText(rendered.container, '所见即所得');
    await waitFor(() => rendered.container.querySelector('[data-rich-state="ready"]') !== null);
    const rich = rendered.container.querySelector<HTMLElement>('.ProseMirror');
    if (!rich) throw new Error('Rich input fixture requires ProseMirror.');

    await replaceRichParagraphText(rich, '初稿一');
    await waitFor(() => runtime.applyEdits.mock.calls.length === 1);
    await replaceRichParagraphText(rich, '初稿一二');
    expect(runtime.applyEdits).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(firstAccepted);
      await settle();
    });
    await waitFor(() => runtime.applyEdits.mock.calls.length === 2);
    expect(rendered.container.querySelector('.ProseMirror')?.textContent).toBe('初稿一二');
    expect(runtime.applyEdits).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        expectedEditSequence: 1,
        changes: [{ from: 0, to: firstAccepted.source.length, insert: secondAccepted.source }],
      }),
    );

    await act(async () => {
      second.resolve(secondAccepted);
      await settle();
    });
    await clickText(rendered.container, '源码');
    await waitFor(() => rendered.container.querySelector('.cm-editor') !== null);
    expect(editorView(rendered.container).state.doc.toString()).toBe(secondAccepted.source);
    await unmount(rendered.root);
  });

  it('keeps a single Rich paragraph break while the preceding edit is being accepted', async () => {
    const initial = textProjection('markdown', '初稿');
    const textAccepted = {
      ...initial,
      source: '初稿一\n',
      editSequence: 1,
      dirty: true,
    };
    const breakAccepted = {
      ...textAccepted,
      source: '初稿一\n\n',
      editSequence: 2,
    };
    const paragraphAccepted = {
      ...breakAccepted,
      source: '初稿一\n\n第二段\n',
      editSequence: 3,
    };
    const first = createDeferred<TextDocumentProjection>();
    const second = createDeferred<TextDocumentProjection>();
    const third = createDeferred<TextDocumentProjection>();
    const runtime = createRuntime(initial);
    runtime.applyEdits
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementationOnce(() => third.promise);
    const rendered = await renderEditor(runtime, 'zh-cn');

    await clickText(rendered.container, '所见即所得');
    await waitFor(() => rendered.container.querySelector('[data-rich-state="ready"]') !== null);
    const rich = rendered.container.querySelector<HTMLElement>('.ProseMirror');
    if (!rich) throw new Error('Rich paragraph-break fixture requires ProseMirror.');

    await replaceRichParagraphText(rich, '初稿一');
    await waitFor(() => runtime.applyEdits.mock.calls.length === 1);
    await pressRichEnter(rich);
    expect(rich.querySelectorAll('p')).toHaveLength(2);

    await act(async () => {
      first.resolve(textAccepted);
      await settle();
    });
    await waitFor(() => runtime.applyEdits.mock.calls.length === 2);
    expect(runtime.applyEdits).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        expectedEditSequence: 1,
        changes: [{ from: 0, to: textAccepted.source.length, insert: breakAccepted.source }],
      }),
    );
    await act(async () => {
      second.resolve(breakAccepted);
      await settle();
    });
    expect(rich.querySelectorAll('p')).toHaveLength(2);
    expect(rich.querySelector('p:last-child')?.textContent).toBe('');
    await replaceRichParagraphTextAt(rich, 1, '第二段');
    await waitFor(() => runtime.applyEdits.mock.calls.length === 3);
    expect(runtime.applyEdits).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        expectedEditSequence: 2,
        changes: [{ from: 0, to: breakAccepted.source.length, insert: paragraphAccepted.source }],
      }),
    );
    await act(async () => {
      third.resolve(paragraphAccepted);
      await settle();
    });
    await clickText(rendered.container, '源码');
    await waitFor(() => rendered.container.querySelector('.cm-editor') !== null);
    expect(editorView(rendered.container).state.doc.toString()).toBe(paragraphAccepted.source);
    await unmount(rendered.root);
  });

  it('reconciles rejected Rich input to the last accepted source', async () => {
    const runtime = createRuntime(textProjection('markdown', '稳定内容'));
    runtime.applyEdits.mockRejectedValueOnce(new Error('rich-write-rejected'));
    const rendered = await renderEditor(runtime, 'zh-cn');

    await clickText(rendered.container, '所见即所得');
    await waitFor(() => rendered.container.querySelector('[data-rich-state="ready"]') !== null);
    const rich = rendered.container.querySelector<HTMLElement>('.ProseMirror');
    if (!rich) throw new Error('Rich rejection fixture requires ProseMirror.');
    await replaceRichParagraphText(rich, '未确认内容');

    await waitFor(
      () =>
        rendered.container.querySelector('.neko-text-editor-operation-error')?.textContent ===
        'rich-write-rejected',
    );
    expect(rendered.container.querySelector('.ProseMirror')?.textContent).toBe('稳定内容');
    await unmount(rendered.root);
  });

  it('initializes the Rich controller after StrictMode replays its effects', async () => {
    const runtime = createRuntime(textProjection('markdown', '# Strict Rich\n'));
    const rendered = await renderEditor(runtime, 'en', true);

    await clickText(rendered.container, 'Rich');
    await waitFor(
      () => rendered.container.querySelector('[data-rich-state="ready"]') !== null,
      200,
    );
    expect(rendered.container.querySelector('.ProseMirror')?.textContent).toContain('Strict Rich');
    expect(rendered.container.querySelectorAll('.ProseMirror')).toHaveLength(1);
    await unmount(rendered.root);
  });

  it('navigates the canonical outline, completes characters and inserts Fountain block spacing', async () => {
    const source = '.内景 客厅 - 夜\n\n@小橘\n你好。';
    const runtime = createRuntime(fountainProjection(source));
    const rendered = await renderEditor(runtime, 'zh-cn');
    const view = editorView(rendered.container);
    expect(rendered.container.querySelector('.cm-fountain-scene-heading')).not.toBeNull();
    expect(rendered.container.querySelector('.cm-fountain-character')).not.toBeNull();

    const outline = requireButtonWithText(rendered.container, '内景 客厅 - 夜');
    await act(async () => outline.click());
    expect(view.state.selection.main.anchor).toBe(1);
    expect(document.activeElement).toBe(view.contentDOM);

    await act(async () => {
      view.dispatch({ selection: { anchor: source.indexOf('@') + 1 } });
      startCompletion(view);
      await delay(150);
    });
    await waitFor(() => currentCompletions(view.state).length > 0);
    expect(currentCompletions(view.state).map((completion) => completion.label)).toContain('@小橘');

    await act(async () => {
      view.dispatch({ selection: { anchor: source.indexOf('\n') } });
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }),
      );
      await settle();
    });
    await waitFor(() => runtime.applyEdits.mock.calls.length === 1);
    expect(runtime.applyEdits.mock.calls[0]?.[0]).toMatchObject({
      changes: [{ from: source.indexOf('\n'), to: source.indexOf('\n'), insert: '\n\n' }],
    });
    await unmount(rendered.root);
  });

  it('switches Markdown presentation and exposes localized save-conflict recovery', async () => {
    const runtime = createRuntime({ ...textProjection('markdown', '# 标题\n'), dirty: true });
    runtime.save.mockRejectedValue(new Error('text-document-save-conflict'));
    const rendered = await renderEditor(runtime, 'zh-cn');

    await clickText(rendered.container, '分栏');
    const split = rendered.container.querySelector('[data-presentation-mode="split"]');
    expect(split).not.toBeNull();
    await waitFor(
      () => rendered.container.querySelector('[data-rich-state="ready"]') !== null,
      200,
    );
    expect(rendered.container.querySelector('.ProseMirror')?.textContent).toContain('标题');
    expect(rendered.container.querySelector('.cm-editor')).not.toBeNull();
    expect([...(split?.children ?? [])].map((child) => child.classList.item(0))).toEqual([
      'neko-text-editor-outline',
      'neko-text-editor-codemirror',
      'neko-text-editor-rich',
    ]);
    expect(rendered.container.querySelector('.ProseMirror')?.getAttribute('aria-readonly')).toBe(
      'true',
    );

    await clickTitle(rendered.container, '保存');
    await waitFor(() => rendered.container.querySelector('[role="alert"]') !== null);
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain(
      '文件已在 OpenNeko 外部更改',
    );

    await clickText(rendered.container, '继续编辑');
    expect(rendered.container.querySelector('[role="alert"]')).toBeNull();
    await clickTitle(rendered.container, '保存');
    await waitFor(() => rendered.container.querySelector('[role="alert"]') !== null);
    await clickText(rendered.container, '从磁盘重新加载');
    await waitFor(() => runtime.reload.mock.calls.length === 1);
    expect(runtime.reload).toHaveBeenCalledWith({ sessionId: 'session-1', confirmDirty: true });
    await unmount(rendered.root);
  });

  it('keeps unsupported source-preserving extensions out of the Rich mutation path', async () => {
    const source = '请查看 [[cover.png]]。';
    const runtime = createRuntime(textProjection('markdown', source));
    const rendered = await renderEditor(runtime, 'zh-cn');

    await clickText(rendered.container, '所见即所得');
    await waitFor(
      () => rendered.container.querySelector('[data-rich-state="unavailable"]') !== null,
    );
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain(
      '当前内容可以预览',
    );
    expect(rendered.container.querySelector('.ProseMirror')?.textContent).toContain(
      '请查看 [[cover.png]]。',
    );
    expect(rendered.container.querySelector('.ProseMirror')?.getAttribute('aria-readonly')).toBe(
      'true',
    );
    expect(runtime.applyEdits).not.toHaveBeenCalled();

    await clickText(rendered.container, '打开源码');
    expect(editorView(rendered.container).state.doc.toString()).toBe(source);
    await unmount(rendered.root);
  });

  it('renders authorized CommonMark and Workspace images without exposing source targets', async () => {
    const source = '# 媒体\n\n![分镜图](images/board.png)\n\n![[images/cover.png]]';
    const runtime = createRuntime(textProjection('markdown', source));
    runtime.prepareMarkdownMedia.mockImplementation(async (request) =>
      readyMediaProjection(request, 'image', `lease:${request.token.target}`),
    );
    const rendered = await renderEditor(runtime, 'zh-cn');

    await clickText(rendered.container, '所见即所得');
    await waitFor(
      () => rendered.container.querySelectorAll('.neko-markdown-media img').length === 2,
    );
    const images = [
      ...rendered.container.querySelectorAll<HTMLImageElement>('.neko-markdown-media img'),
    ];
    expect(images.map((image) => image.alt)).toEqual(['分镜图', 'images/cover.png']);
    expect(images.map((image) => image.src)).toEqual([
      'http://127.0.0.1:43125/resources/images%2Fboard.png',
      'http://127.0.0.1:43125/resources/images%2Fcover.png',
    ]);
    expect(rendered.container.querySelector('img[src="images/board.png"]')).toBeNull();
    expect(runtime.applyEdits).not.toHaveBeenCalled();
    expect(runtime.prepareMarkdownMedia.mock.calls.map(([request]) => request.token)).toEqual([
      {
        kind: 'commonmark-image',
        from: source.indexOf('!['),
        to: source.indexOf('![') + '![分镜图](images/board.png)'.length,
        target: 'images/board.png',
        altText: '分镜图',
      },
      {
        kind: 'resource-embed',
        from: source.indexOf('![[images'),
        to: source.length,
        target: 'images/cover.png',
        altText: 'images/cover.png',
      },
    ]);
    expect(rendered.container.querySelector('.ProseMirror')?.getAttribute('aria-readonly')).toBe(
      'true',
    );

    const reveal = rendered.container.querySelector<HTMLButtonElement>(
      '.neko-markdown-media__reveal',
    );
    if (!reveal) throw new Error('Markdown media fixture requires a Source reveal action.');
    await act(async () => {
      reveal.click();
      await settle();
    });
    expect(editorView(rendered.container).state.selection.main.anchor).toBe(source.indexOf('!['));

    await unmount(rendered.root);
    expect(runtime.releaseMarkdownMedia).toHaveBeenCalledTimes(2);
  });

  it('uses native non-autoplay audio and video controls and releases a removed token', async () => {
    const source = '![[media/theme.mp3]]\n\n![[media/scene.mp4]]';
    const runtime = createRuntime(textProjection('markdown', source));
    runtime.prepareMarkdownMedia.mockImplementation(async (request) => {
      const video = request.token.target.endsWith('.mp4');
      return readyMediaProjection(
        request,
        video ? 'video' : 'audio',
        video ? 'lease-video' : `lease-audio:${request.editSequence}`,
      );
    });
    const rendered = await renderEditor(runtime, 'zh-cn');

    await clickText(rendered.container, '所见即所得');
    await waitFor(
      () =>
        rendered.container.querySelector('.neko-markdown-media audio') !== null &&
        rendered.container.querySelector('.neko-markdown-media video') !== null,
    );
    const audio = rendered.container.querySelector<HTMLAudioElement>('audio');
    const video = rendered.container.querySelector<HTMLVideoElement>('video');
    expect(audio?.controls).toBe(true);
    expect(audio?.autoplay).toBe(false);
    expect(audio?.preload).toBe('metadata');
    expect(video?.controls).toBe(true);
    expect(video?.autoplay).toBe(false);
    expect(video?.preload).toBe('metadata');
    expect(video?.playsInline).toBe(true);

    runtime.emit({
      ...textProjection('markdown', '![[media/theme.mp3]]'),
      editSequence: 1,
    });
    await waitFor(() => rendered.container.querySelector('video') === null);
    await waitFor(() =>
      runtime.releaseMarkdownMedia.mock.calls.some(
        ([request]) => request.leaseId === 'lease-video',
      ),
    );
    expect(rendered.container.querySelector('audio')).not.toBeNull();
    await unmount(rendered.root);
  });

  it('contains missing, ambiguous and unauthorized media diagnostics beside a ready sibling', async () => {
    const source = [
      '![可用图片](images/ready.png)',
      '![[images/missing.png]]',
      '![[images/ambiguous.png]]',
      '![[/private/secret.png]]',
    ].join('\n\n');
    const runtime = createRuntime(textProjection('markdown', source));
    runtime.prepareMarkdownMedia.mockImplementation(async (request) => {
      if (request.token.target === 'images/ready.png') {
        return readyMediaProjection(request, 'image', 'lease-ready');
      }
      return {
        ...request,
        status: 'unavailable',
        diagnostic: {
          code:
            request.token.target === 'images/missing.png'
              ? 'text-editor-markdown-media-missing'
              : 'text-editor-markdown-media-ambiguous',
        },
      };
    });
    const rendered = await renderEditor(runtime, 'zh-cn');

    await clickText(rendered.container, '所见即所得');
    await waitFor(
      () => rendered.container.querySelectorAll('[data-media-state="unavailable"]').length === 3,
    );
    expect(rendered.container.querySelector('.neko-markdown-media img')).not.toBeNull();
    const diagnostics = [...rendered.container.querySelectorAll('[data-media-state="unavailable"]')]
      .map((node) => node.textContent)
      .join('\n');
    expect(diagnostics).toContain('找不到媒体文件');
    expect(diagnostics).toContain('媒体目标匹配到多个资源');
    expect(diagnostics).toContain('当前工作区无权访问该媒体目标');
    expect(
      runtime.prepareMarkdownMedia.mock.calls.some(([request]) =>
        request.token.target.startsWith('/'),
      ),
    ).toBe(false);
    await unmount(rendered.root);
  });

  it('revokes late media preparation and prepares only the replacement document surface', async () => {
    const sourceA = '![A](images/a.png)';
    const sourceB = '![B](images/b.png)';
    const projectionA = textProjection('markdown', sourceA);
    const projectionB = {
      ...textProjection('markdown', sourceB, 'replacement.md'),
      sessionId: 'session-2',
      editSequence: 3,
    };
    const late = createDeferred<TextEditorMarkdownMediaProjection>();
    const runtime = createRuntime(projectionA);
    runtime.prepareMarkdownMedia.mockImplementation(async (request) =>
      request.token.target === 'images/a.png'
        ? late.promise
        : readyMediaProjection(request, 'image', 'lease-b'),
    );
    const rendered = await renderEditor(runtime);

    await clickText(rendered.container, 'Rich');
    await waitFor(() => runtime.prepareMarkdownMedia.mock.calls.length === 1);
    const requestA = runtime.prepareMarkdownMedia.mock.calls[0]![0];
    await act(async () => {
      runtime.emit(projectionB);
      await settle();
    });
    await waitFor(() =>
      runtime.prepareMarkdownMedia.mock.calls.some(
        ([request]) => request.token.target === 'images/b.png',
      ),
    );
    await waitFor(
      () =>
        rendered.container.querySelector<HTMLImageElement>('.neko-markdown-media img')?.alt === 'B',
    );

    await act(async () => {
      late.resolve(readyMediaProjection(requestA, 'image', 'lease-a'));
      await settle();
    });
    await waitFor(() =>
      runtime.releaseMarkdownMedia.mock.calls.some(([request]) => request.leaseId === 'lease-a'),
    );
    expect(
      rendered.container.querySelector<HTMLImageElement>('.neko-markdown-media img')?.alt,
    ).toBe('B');
    await unmount(rendered.root);
  });

  it('keeps incomplete Markdown visible in the read-only Split preview', async () => {
    const source = '# 草稿\n\n完整段落。';
    const incomplete = '# 草稿\n\n未完成 **强调\n\n[[引用\n\n![[媒体\n\n![海报](';
    const runtime = createRuntime(textProjection('markdown', source));
    const rendered = await renderEditor(runtime, 'zh-cn');

    await clickText(rendered.container, '分栏');
    await waitFor(() => rendered.container.querySelector('[data-rich-state="ready"]') !== null);
    const view = editorView(rendered.container);
    await act(async () => {
      view.dispatch({ changes: { from: 0, to: source.length, insert: incomplete } });
      await settle();
    });

    await waitFor(
      () =>
        rendered.container.querySelector('.ProseMirror')?.textContent?.includes('未完成') === true,
    );
    expect(rendered.container.querySelector('[data-rich-state="ready"]')).not.toBeNull();
    expect(rendered.container.querySelector('.ProseMirror')?.textContent).toContain('![[媒体');
    expect(rendered.container.querySelector('.ProseMirror')?.textContent).toContain('![海报](');
    expect(rendered.container.querySelector('.ProseMirror')?.getAttribute('aria-readonly')).toBe(
      'true',
    );
    expect(runtime.applyEdits).toHaveBeenCalledTimes(1);
    expect(runtime.prepareMarkdownMedia).not.toHaveBeenCalled();
    await unmount(rendered.root);
  });

  it('renders hostile HTML as inert Rich text without inline style or script nodes', async () => {
    const runtime = createRuntime(
      textProjection(
        'markdown',
        '<script>alert(1)</script>\n\n| 名称 | 状态 |\n| :--- | ---: |\n| 文档 | 完成 |',
      ),
    );
    const rendered = await renderEditor(runtime);

    await clickText(rendered.container, 'Rich');
    await waitFor(() => rendered.container.querySelector('[data-rich-state="ready"]') !== null);
    const rich = rendered.container.querySelector('.neko-text-editor-rich');
    expect(rich?.textContent).toContain('<script>alert(1)</script>');
    expect(rich?.querySelector('script')).toBeNull();
    expect(rich?.querySelector('[style]')).toBeNull();
    expect(rich?.querySelector('[data-alignment="right"]')).not.toBeNull();
    await unmount(rendered.root);
  });

  it('navigates Markdown headings and references from the source-backed outline', async () => {
    const source = '# 文档\n\n## 第二节\n\n[说明][ref]\n\n[ref]: notes.md';
    const runtime = createRuntime(textProjection('markdown', source));
    const rendered = await renderEditor(runtime, 'zh-cn');
    expect(rendered.container.querySelector('.neko-text-editor-outline')?.textContent).toContain(
      '第二节',
    );
    expect(rendered.container.querySelector('.neko-text-editor-outline')?.textContent).toContain(
      '说明',
    );

    await clickText(rendered.container, '第二节');
    expect(editorView(rendered.container).state.selection.main.anchor).toBe(source.indexOf('##'));

    await clickText(rendered.container, '所见即所得');
    await waitFor(
      () => rendered.container.querySelector('[data-rich-state="ready"]') !== null,
      200,
    );
    await clickText(rendered.container, '第二节');
    expect(document.activeElement).toBe(rendered.container.querySelector('.ProseMirror'));

    const reference = rendered.container.querySelector<HTMLButtonElement>(
      'button[title="notes.md"]',
    );
    if (!reference) throw new Error('Markdown outline fixture requires the resolved reference.');
    await act(async () => {
      reference.click();
      await settle();
    });
    await waitFor(() => rendered.container.querySelector('.cm-editor') !== null, 100);
    expect(editorView(rendered.container).state.selection.main.anchor).toBe(
      source.indexOf('[说明]'),
    );
    await unmount(rendered.root);
  });

  it('opens a long CJK document in the lazy Rich surface within the package budget', async () => {
    const source = Array.from(
      { length: 500 },
      (_, index) => `## 场景 ${index + 1}\n\n这是第 ${index + 1} 个场景。`,
    ).join('\n\n');
    const runtime = createRuntime(textProjection('markdown', source));
    const rendered = await renderEditor(runtime, 'zh-cn');
    const startedAt = performance.now();

    await clickText(rendered.container, '所见即所得');
    await waitFor(
      () => rendered.container.querySelector('[data-rich-state="ready"]') !== null,
      200,
    );
    expect(performance.now() - startedAt).toBeLessThan(5_000);
    expect(rendered.container.querySelectorAll('.ProseMirror h2')).toHaveLength(500);
    await unmount(rendered.root);
  });

  it('shows watcher conflicts without replacing the dirty editor source', async () => {
    const runtime = createRuntime({
      ...textProjection('markdown', '# Draft\n'),
      dirty: true,
    });
    const rendered = await renderEditor(runtime, 'zh-cn');

    await act(async () => {
      runtime.emit({
        ...textProjection('markdown', '# Draft\n'),
        editSequence: 1,
        dirty: true,
        conflict: true,
      });
      await settle();
    });
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain(
      '文件已在 OpenNeko 外部更改',
    );
    expect(editorView(rendered.container).state.doc.toString()).toBe('# Draft\n');

    await clickText(rendered.container, '继续编辑');
    expect(rendered.container.querySelector('[role="alert"]')).toBeNull();
    await unmount(rendered.root);
  });

  it('formats JSON through the host and hides preview modes for non-preview documents', async () => {
    const runtime = createRuntime(textProjection('json', '{"ok":true}'));
    const rendered = await renderEditor(runtime);

    expect(findButtonWithText(rendered.container, 'Preview')).toBeUndefined();
    await clickTitle(rendered.container, 'Format document');
    await waitFor(() => runtime.formatJson.mock.calls.length === 1);
    expect(runtime.formatJson).toHaveBeenCalledWith({
      sessionId: 'session-1',
      requestId: 'editor-request:1',
      expectedEditSequence: 0,
    });
    await unmount(rendered.root);
  });

  it('opens fresh Markdown as Rich with outline and contributes scoped tab-row controls', async () => {
    const runtime = createRuntime(textProjection('markdown', '# 第一章\n\n正文'));
    const rendered = await renderEditor(runtime, 'zh-cn', false, null);

    await waitFor(() => rendered.container.querySelector('[data-rich-state="ready"]') !== null);
    expect(rendered.container.querySelector('.neko-text-editor-toolbar')).toBeNull();
    expect(rendered.container.querySelector('.ProseMirror')?.textContent).toContain('第一章');
    expect(rendered.container.querySelector('.neko-text-editor-outline')?.textContent).toContain(
      '第一章',
    );
    const modeButtons = [
      ...rendered.contextActionsTarget.querySelectorAll<HTMLButtonElement>(
        '.neko-text-editor-segmented button',
      ),
    ];
    expect(modeButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '源码',
      '所见即所得',
      '分栏',
    ]);
    expect(modeButtons.map((button) => button.querySelector('.codicon')?.className)).toEqual([
      expect.stringContaining('codicon-code'),
      expect.stringContaining('codicon-edit'),
      expect.stringContaining('codicon-split-horizontal'),
    ]);
    expect(modeButtons.every((button) => button.textContent?.trim() === '')).toBe(true);

    await pressShortcut(rendered.container, {
      code: 'Digit1',
      key: '1',
      metaKey: true,
      shiftKey: true,
    });
    await waitFor(() => rendered.container.querySelector('.cm-editor') !== null);
    expect(rendered.container.querySelector('[data-presentation-mode="source"]')).not.toBeNull();

    await pressShortcut(rendered.container, {
      code: 'KeyO',
      key: 'o',
      metaKey: true,
      shiftKey: true,
    });
    expect(rendered.container.querySelector('.neko-text-editor-outline')).toBeNull();
    await unmount(rendered.root);
    expect(rendered.contextActionsTarget.childElementCount).toBe(0);
  });

  it('applies declared HTML highlighting without claiming an alternate document mode', async () => {
    const runtime = createRuntime(
      textProjection('plain-text', '<main class="story"><h1>标题</h1></main>', 'index.html'),
    );
    const rendered = await renderEditor(runtime);
    const line = rendered.container.querySelector('.cm-line');

    expect(line?.textContent).toBe('<main class="story"><h1>标题</h1></main>');
    expect(line?.querySelectorAll('span').length).toBeGreaterThan(4);
    expect(rendered.container.querySelector('[data-document-mode="plain-text"]')).not.toBeNull();
    expect(
      rendered.contextActionsTarget.querySelector('[aria-label="Format document"]'),
    ).toBeNull();
    await unmount(rendered.root);
  });
});

function createRuntime(initial: TextDocumentProjection) {
  let current = initial;
  const listeners = new Set<(projection: TextDocumentProjection) => void>();
  const applyEdits = vi.fn(async (command: ApplyTextDocumentEditsCommand) => {
    current = {
      ...current,
      source: applyChanges(current.source, command.changes),
      editSequence: current.editSequence + 1,
      dirty: true,
    };
    return current;
  });
  const formatJson = vi.fn(async () => {
    current = {
      ...current,
      source: `${JSON.stringify(JSON.parse(current.source), null, 2)}\n`,
      editSequence: current.editSequence + 1,
      dirty: true,
    };
    return current;
  });
  const save = vi.fn(async () => {
    current = { ...current, dirty: false };
    return current;
  });
  const reload = vi.fn(async () => {
    current = { ...initial, editSequence: current.editSequence + 1 };
    return current;
  });
  const searchMarkdownReferences = vi.fn(
    async (
      request: TextEditorMarkdownReferenceSearchRequest,
    ): Promise<TextEditorMarkdownReferenceSearchResult> => ({
      status: 'ready' as const,
      projection: referenceProjection(request),
    }),
  );
  const prepareMarkdownMedia = vi.fn(
    async (
      request: PrepareTextEditorMarkdownMediaRequest,
    ): Promise<TextEditorMarkdownMediaProjection> => ({
      ...request,
      status: 'unavailable',
      diagnostic: { code: 'text-editor-markdown-media-missing' },
    }),
  );
  const releaseMarkdownMedia = vi.fn(async (_request: ReleaseTextEditorMarkdownMediaRequest) => {});
  return {
    project: vi.fn(async () => current),
    applyEdits,
    formatJson,
    save,
    reload,
    searchMarkdownReferences,
    prepareMarkdownMedia,
    releaseMarkdownMedia,
    subscribe: (listener: (projection: TextDocumentProjection) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(projection: TextDocumentProjection) {
      current = projection;
      for (const listener of listeners) listener(projection);
    },
  } satisfies TextEditorHostRuntime & {
    applyEdits: typeof applyEdits;
    formatJson: typeof formatJson;
    save: typeof save;
    reload: typeof reload;
    searchMarkdownReferences: typeof searchMarkdownReferences;
    prepareMarkdownMedia: typeof prepareMarkdownMedia;
    releaseMarkdownMedia: typeof releaseMarkdownMedia;
    emit(projection: TextDocumentProjection): void;
  };
}

function referenceProjection(request: TextEditorMarkdownReferenceSearchRequest) {
  return {
    requestId: request.requestId,
    identity: request.identity,
    sessionId: request.sessionId,
    editSequence: request.editSequence,
    kind: request.kind,
    query: request.query,
    candidates: [],
    diagnostics: [],
  };
}

function readyMediaProjection(
  request: PrepareTextEditorMarkdownMediaRequest,
  kind: 'image' | 'audio' | 'video',
  leaseId: string,
): TextEditorMarkdownMediaProjection {
  return {
    ...request,
    status: 'ready',
    descriptor: {
      leaseId,
      kind,
      renderUri: `http://127.0.0.1:43125/resources/${encodeURIComponent(request.token.target)}`,
      contentType: kind === 'image' ? 'image/png' : kind === 'audio' ? 'audio/mpeg' : 'video/mp4',
      displayName: request.token.target.split('/').at(-1) ?? request.token.target,
    },
  };
}

function textProjection(
  mode: TextDocumentProjection['mode'],
  source: string,
  explicitDocumentId?: string,
): TextDocumentProjection {
  const documentId =
    explicitDocumentId ??
    (mode === 'json' ? 'data.json' : mode === 'markdown' ? 'notes.md' : 'notes.txt');
  return {
    identity: {
      owner: { kind: 'window', windowId: 'window-1', projectId: 'project-1' },
      workspaceId: 'workspace-1',
      documentId,
      locator: { kind: 'workspace-file', path: documentId },
    },
    sessionId: 'session-1',
    editSequence: 0,
    mode,
    source,
    dirty: false,
    conflict: false,
    diagnostics: [],
  };
}

function fountainProjection(source: string): TextDocumentProjection {
  const range = (start: number, end: number) => ({
    start: { offset: start, line: 1, column: start + 1 },
    end: { offset: end, line: 1, column: end + 1 },
  });
  return {
    ...textProjection('fountain', source),
    identity: {
      ...textProjection('fountain', source).identity,
      documentId: 'story.fountain',
      locator: { kind: 'workspace-file', path: 'story.fountain' },
    },
    screenplay: {
      sourceId: 'story.fountain',
      source,
      elements: [
        {
          elementId: 'element:scene',
          kind: 'scene-heading',
          text: '内景 客厅 - 夜',
          range: range(1, 10),
        },
        { elementId: 'element:character', kind: 'character', text: '小橘', range: range(13, 16) },
        { elementId: 'element:dialogue', kind: 'dialogue', text: '你好。', range: range(17, 20) },
      ],
      scenes: [
        {
          sceneId: 'scene:0',
          heading: '内景 客厅 - 夜',
          intExt: '内景',
          location: '客厅',
          timeOfDay: '夜',
          range: range(1, source.length),
          elementIds: ['element:scene', 'element:character', 'element:dialogue'],
          characters: ['小橘'],
        },
      ],
      characters: [{ name: '小橘', ranges: [range(13, 16)], sceneIds: ['scene:0'] }],
      outline: [
        {
          outlineId: 'outline:scene:0',
          kind: 'scene',
          label: '内景 客厅 - 夜',
          range: range(1, 10),
          depth: 0,
        },
      ],
      diagnostics: [],
    },
  };
}

async function renderEditor(
  runtime: TextEditorHostRuntime,
  locale: 'en' | 'zh-cn' = 'en',
  strict = false,
  initialSnapshot: unknown | null = {
    ...createDefaultTextEditorPresentationSnapshot(),
    mode: 'source',
  },
) {
  const container = document.createElement('div');
  container.style.width = '1024px';
  container.style.height = '768px';
  const contextActionsTarget = document.createElement('div');
  const editorMount = document.createElement('div');
  editorMount.style.width = '100%';
  editorMount.style.height = '100%';
  container.append(contextActionsTarget, editorMount);
  document.body.append(container);
  const root = createRoot(editorMount);
  await act(async () => {
    const editor = (
      <TextEditorRoot
        runtime={runtime}
        locale={locale}
        cspNonce="text-editor-test-csp"
        renderContextActions={(actions) => createPortal(actions, contextActionsTarget)}
        {...(initialSnapshot === null ? {} : { initialSnapshot })}
      />
    );
    root.render(strict ? <StrictMode>{editor}</StrictMode> : editor);
    await settle();
  });
  await waitFor(() => container.querySelector('.neko-text-editor-root') !== null);
  return { container, contextActionsTarget, root };
}

function editorView(container: HTMLElement): EditorView {
  const editor = container.querySelector<HTMLElement>('.cm-editor');
  if (!editor) throw new Error('Text Editor fixture requires CodeMirror.');
  const view = EditorView.findFromDOM(editor);
  if (!view) throw new Error('Text Editor fixture could not resolve CodeMirror state.');
  return view;
}

async function clickTitle(container: HTMLElement, title: string): Promise<void> {
  const button =
    container.querySelector<HTMLButtonElement>(`button[aria-label="${title}"]`) ??
    [...container.querySelectorAll<HTMLButtonElement>('button[title]')].find((candidate) =>
      candidate.title.startsWith(`${title} (`),
    );
  if (!button) throw new Error(`Text Editor fixture requires '${title}'.`);
  await act(async () => {
    button.click();
    await settle();
  });
}

async function pressShortcut(
  container: HTMLElement,
  init: Pick<KeyboardEventInit, 'code' | 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
): Promise<void> {
  const target =
    container.querySelector<HTMLElement>('.cm-content') ??
    container.querySelector<HTMLElement>('.ProseMirror') ??
    container.querySelector<HTMLElement>('.neko-text-editor-root');
  if (!target) throw new Error('Text Editor fixture requires a ready Root for keyboard commands.');
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { ...init, bubbles: true }));
    await settle();
  });
}

async function clickText(container: HTMLElement, text: string): Promise<void> {
  const button = requireButtonWithText(container, text);
  await act(async () => {
    button.click();
    await settle();
  });
}

function requireButtonWithText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = findButtonWithText(container, text);
  if (!button) throw new Error(`Text Editor fixture requires '${text}'.`);
  return button;
}

function findButtonWithText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) =>
      candidate.textContent?.trim() === text || candidate.getAttribute('aria-label') === text,
  );
  return button;
}

function applyChanges(source: string, changes: readonly TextDocumentChange[]): string {
  let cursor = 0;
  let result = '';
  for (const change of changes) {
    result += source.slice(cursor, change.from) + change.insert;
    cursor = change.to;
  }
  return result + source.slice(cursor);
}

async function replaceRichParagraphText(rich: HTMLElement, value: string): Promise<void> {
  await replaceRichParagraphTextAt(rich, 0, value);
}

async function replaceRichParagraphTextAt(
  rich: HTMLElement,
  paragraphIndex: number,
  value: string,
): Promise<void> {
  const paragraph = rich.querySelectorAll('p').item(paragraphIndex);
  if (!paragraph) throw new Error('Rich input fixture requires the requested paragraph.');
  await act(async () => {
    paragraph.textContent = value;
    rich.dispatchEvent(
      new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }),
    );
    await delay(20);
  });
}

async function pressRichEnter(rich: HTMLElement): Promise<void> {
  const text = rich.querySelector('p:last-child')?.firstChild;
  if (!text) throw new Error('Rich paragraph-break fixture requires a paragraph text node.');
  rich.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(text, text.textContent?.length ?? 0);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  await act(async () => {
    document.dispatchEvent(new Event('selectionchange'));
    await settle();
    rich.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, code: 'Enter', key: 'Enter' }),
    );
    await settle();
  });
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function waitFor(assertion: () => boolean | undefined, attempts = 30): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    if (assertion()) return;
    await act(async () => settle());
  }
  const richState = document
    .querySelector('.neko-text-editor-rich')
    ?.getAttribute('data-rich-state');
  const richError = document.querySelector('.neko-text-editor-rich [role="alert"]')?.textContent;
  throw new Error(
    `Text Editor fixture did not reach the expected state (Rich: ${richState ?? 'absent'} ${richError ?? ''}).`,
  );
}

async function unmount(root: Root): Promise<void> {
  await act(async () => root.unmount());
}

async function settle(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function rect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    top: 0,
    right: 100,
    bottom: 20,
    left: 0,
    toJSON: () => ({}),
  };
}

function emptyRectList(): DOMRectList {
  return {
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* () {},
  } as DOMRectList;
}
