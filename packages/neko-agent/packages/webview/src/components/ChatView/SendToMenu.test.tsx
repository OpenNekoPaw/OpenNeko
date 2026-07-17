import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SendToMenu } from './SendToMenu';

const { mockPostMessage } = vi.hoisted(() => ({
  mockPostMessage: vi.fn(),
}));

vi.mock('@neko/shared/vscode', () => ({
  getVSCodeAPI: () => ({
    postMessage: mockPostMessage,
    getState: vi.fn(),
    setState: vi.fn(),
  }),
  postMessage: (message: unknown) => mockPostMessage(message),
}));

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      ({
        'chat.transfer.sendTo': '发送到',
        'chat.transfer.sendToTarget': `发送到 ${String(vars?.['target'] ?? '')}`,
        'chat.transfer.importToCanvas': '导入',
        'chat.transfer.importToCanvasTitle': '导入素材到 Canvas',
      })[key] ?? key,
  }),
}));

describe('SendToMenu', () => {
  beforeEach(() => {
    mockPostMessage.mockClear();
  });

  it('requests Agent-led Canvas Markdown handoff for Markdown handoff buttons', () => {
    render(
      <SendToMenu
        canvasMarkdownHandoff={{
          markdown:
            '| scene | shot id | visual | image |\n| --- | --- | --- | --- |\n| S1 | 1 | open | P1 |',
          sourceFormat: 'gfm-table',
          declaredIntentHint: 'creative-table',
          declaredProfileHint: 'storyboard',
          resources: [{ token: 'P1', sourcePath: '${PROJECT}/assets/panel-1.png' }],
          stableRefs: [
            { kind: 'character', id: 'character-rin', namespace: 'entity', token: '@Rin' },
          ],
          diagnostics: [
            {
              severity: 'warning',
              code: 'prompt-span-needs-review',
              message: 'Prompt span needs review.',
              token: '@Rin',
            },
          ],
          promptSpans: [
            {
              kind: 'character',
              range: { start: 0, end: 4 },
              fieldId: 'character.ref',
              label: 'Rin',
              ref: { kind: 'character', id: 'character-rin', namespace: 'entity' },
            },
          ],
          provenance: {
            source: 'webview',
            label: 'assistant-markdown-block',
          },
        }}
        conversationId="conv-1"
        mediaType="image"
        plugins={{ canvas: true }}
        allowedTargets={['canvas']}
      />,
    );

    expect(screen.getByText('发送到')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Canvas/i }).getAttribute('title')).toBe(
      '发送到 Canvas',
    );

    fireEvent.click(screen.getByRole('button', { name: /Canvas/i }));

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'requestCanvasAuthoringHandoff',
        conversationId: 'conv-1',
        requestId: expect.stringMatching(/^canvas-authoring-handoff:/),
        sourceKind: 'markdown',
        content:
          '| scene | shot id | visual | image |\n| --- | --- | --- | --- |\n| S1 | 1 | open | P1 |',
        sourceFormat: 'gfm-table',
        targetHints: {
          sourceFormat: 'gfm-table',
          declaredIntentHint: 'creative-table',
          declaredProfileHint: 'storyboard',
        },
        resources: [{ token: 'P1', sourcePath: '${PROJECT}/assets/panel-1.png' }],
        stableRefs: [
          { kind: 'character', id: 'character-rin', namespace: 'entity', token: '@Rin' },
        ],
        diagnostics: [
          {
            severity: 'warning',
            code: 'prompt-span-needs-review',
            message: 'Prompt span needs review.',
            token: '@Rin',
          },
        ],
        promptSpans: [
          {
            kind: 'character',
            range: { start: 0, end: 4 },
            fieldId: 'character.ref',
            label: 'Rin',
            ref: { kind: 'character', id: 'character-rin', namespace: 'entity' },
          },
        ],
        provenance: expect.objectContaining({
          source: 'webview',
          label: 'assistant-markdown-block',
        }),
      }),
    );
    expect(mockPostMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'invokeAgentCapabilityLifecycle',
      }),
    );
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('capabilityId');
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('intentHint');
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('profileHint');
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('vscode-webview://');
    expect(JSON.stringify(mockPostMessage.mock.calls)).not.toContain('blob:');
    expect(mockPostMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sendToPlugin' }),
    );
    expectAuthoringShortcutDidNotMutateCanvas();
  });

  it('requests Agent-led Canvas authoring handoff for resource-backed Canvas sends', () => {
    render(
      <SendToMenu
        payload={{
          kind: 'singleAsset',
          asset: {
            mediaType: 'image',
            name: 'panel-1.png',
            documentResourceRef: {
              kind: 'document-entry',
              source: { filePath: '/books/a.epub', format: 'epub' },
              entryPath: 'image/panel-1.png',
              versionPolicy: 'versioned-export',
            },
          },
          target: { plugin: 'canvas', mode: 'insert' },
          provenance: { source: 'webview', label: 'document-image:P1' },
        }}
        conversationId="conv-1"
        mediaType="image"
        plugins={{ canvas: true }}
        allowedTargets={['canvas']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Canvas/i }));

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'requestCanvasAuthoringHandoff',
        conversationId: 'conv-1',
        requestId: expect.stringMatching(/^canvas-authoring-handoff:/),
        sourceKind: 'resource-backed-content',
        title: 'panel-1.png',
        content: 'Resource-backed content: panel-1.png',
        resources: [
          {
            token: 'panel-1.png',
            label: 'panel-1.png',
            role: 'source',
            documentResourceRef: {
              kind: 'document-entry',
              source: { filePath: '/books/a.epub', format: 'epub' },
              entryPath: 'image/panel-1.png',
              versionPolicy: 'versioned-export',
            },
          },
        ],
        target: { mode: 'insert' },
        provenance: { source: 'webview', label: 'document-image:P1' },
      }),
    );
    expect(mockPostMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sendToPlugin' }),
    );
    expectAuthoringShortcutDidNotMutateCanvas();
  });

  it('keeps direct Canvas asset import as an explicitly labeled import action', () => {
    render(
      <SendToMenu
        payload={{
          kind: 'singleAsset',
          asset: {
            mediaType: 'image',
            name: 'panel-1.png',
            documentResourceRef: {
              kind: 'document-entry',
              source: { filePath: '/books/a.epub', format: 'epub' },
              entryPath: 'image/panel-1.png',
              versionPolicy: 'versioned-export',
            },
          },
        }}
        conversationId="conv-1"
        mediaType="image"
        plugins={{ canvas: true }}
        allowedTargets={['canvas']}
        showDirectCanvasImport
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '导入' }));

    expect(screen.getByRole('button', { name: '导入' }).getAttribute('title')).toBe(
      '导入素材到 Canvas',
    );
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: expect.objectContaining({
          kind: 'singleAsset',
          asset: expect.objectContaining({
            name: 'panel-1.png',
          }),
        }),
      }),
    );
    expect(mockPostMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'requestCanvasAuthoringHandoff' }),
    );
  });

  it('requests Agent-led Canvas authoring handoff for generated text content', () => {
    render(
      <SendToMenu
        canvasAuthoringHandoff={{
          sourceKind: 'generated-text',
          sourceFormat: 'plain-text',
          content: 'Create a quiet scene note from this paragraph.',
          title: 'Scene Note',
          userIntent: 'Create a Canvas note if useful.',
        }}
        conversationId="conv-1"
        mediaType="image"
        plugins={{ canvas: true }}
        allowedTargets={['canvas']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Canvas/i }));

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'requestCanvasAuthoringHandoff',
        conversationId: 'conv-1',
        sourceKind: 'generated-text',
        sourceFormat: 'plain-text',
        title: 'Scene Note',
        content: 'Create a quiet scene note from this paragraph.',
        userIntent: 'Create a Canvas note if useful.',
      }),
    );
    expect(mockPostMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sendToPlugin' }),
    );
    expectAuthoringShortcutDidNotMutateCanvas();
  });
});

function expectAuthoringShortcutDidNotMutateCanvas(): void {
  const postedMessages = JSON.stringify(mockPostMessage.mock.calls);
  expect(postedMessages).not.toContain('neko.canvas.importAsset');
  expect(postedMessages).not.toContain('canvas.ingestMarkdown');
  expect(postedMessages).not.toContain('canvas.createStoryboardFromMarkdown');
  expect(postedMessages).not.toContain('canvas_create_node');
  expect(postedMessages).not.toContain('canvas_create_composite');
}
