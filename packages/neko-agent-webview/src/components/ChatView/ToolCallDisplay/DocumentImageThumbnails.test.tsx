import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { DocumentImageThumbnails } from './DocumentImageThumbnails';

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
        'chat.transfer.sendTo': 'Send to',
        'chat.transfer.sendToTarget': `Send to ${String(vars?.['target'] ?? '')}`,
        'chat.transfer.importToCanvas': 'Import',
        'chat.transfer.importToCanvasTitle': 'Import asset to Canvas',
      })[key] ?? key,
  }),
}));

describe('DocumentImageThumbnails', () => {
  it('copies document entry locations when a thumbnail has no page locator', async () => {
    const writeText = vi.fn();
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(
      <MessageActionsProvider pluginsAvailable={{ canvas: true }} activeConversationId="conv-1">
        <DocumentImageThumbnails
          thumbnails={[
            {
              id: 'image/moe-018893.jpg:0',
              index: 0,
              filePath: '/books/a.epub',
              path: 'image/moe-018893.jpg',
              width: 1494,
              height: 2133,
              byteSize: 84992,
              mimeType: 'image/jpeg',
              label: '#1',
              resourceRef: {
                kind: 'document-entry',
                source: { filePath: '/books/a.epub', format: 'epub' },
                entryPath: 'image/moe-018893.jpg',
                versionPolicy: 'versioned-export',
              },
              referenceJson: '{}',
            },
          ]}
        />
      </MessageActionsProvider>,
    );

    fireEvent.click(screen.getByTitle('Copy thumbnail summary'));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Entry: image/moe-018893.jpg'));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('Reference: /books/a.epub#entry:image/moe-018893.jpg'),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('Location: entry:image/moe-018893.jpg'),
    );
    expect(writeText).not.toHaveBeenCalledWith(expect.stringContaining('/books/a.epub##1'));
  });

  it('renders a Send to Canvas action for document image thumbnails', () => {
    render(
      <MessageActionsProvider pluginsAvailable={{ canvas: true }} activeConversationId="conv-1">
        <DocumentImageThumbnails
          thumbnails={[
            {
              id: '/tmp/page-1.jpg:0',
              index: 0,
              filePath: '/books/a.epub',
              path: '/tmp/page-1.jpg',
              src: 'vscode-webview://page-1.jpg',
              width: 1494,
              height: 2133,
              byteSize: 1024,
              mimeType: 'image/jpeg',
              label: 'C2',
              resourceRef: {
                kind: 'document-entry',
                source: { filePath: '/books/a.epub', format: 'epub' },
                entryPath: 'image/Page_1.jpg',
                versionPolicy: 'versioned-export',
              },
              referenceJson: '{}',
            },
          ]}
        />
      </MessageActionsProvider>,
    );

    const sendButton = screen.getByRole('button', { name: /Canvas/i });
    expect(sendButton).toBeTruthy();

    fireEvent.click(sendButton);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'requestCanvasAuthoringHandoff',
        conversationId: 'conv-1',
        sourceKind: 'resource-backed-content',
        title: 'page-1.jpg',
        resources: [
          {
            token: 'page-1.jpg',
            label: 'page-1.jpg',
            role: 'source',
            documentResourceRef: {
              kind: 'document-entry',
              source: { filePath: '/books/a.epub', format: 'epub' },
              entryPath: 'image/Page_1.jpg',
              versionPolicy: 'versioned-export',
            },
          },
        ],
        target: { mode: 'insert' },
        provenance: expect.objectContaining({
          source: 'webview',
          label: 'document-image:C2',
        }),
      }),
    );
    expect(mockPostMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sendToPlugin' }),
    );

    mockPostMessage.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    expect(screen.getByRole('button', { name: 'Import' }).getAttribute('title')).toBe(
      'Import asset to Canvas',
    );
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: expect.objectContaining({
          kind: 'singleAsset',
        }),
      }),
    );
  });
});
