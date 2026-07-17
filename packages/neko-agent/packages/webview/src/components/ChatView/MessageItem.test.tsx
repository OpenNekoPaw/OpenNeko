import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@neko-agent/types';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import { MessageItem } from './MessageItem';
import type { MessageIdentityMap } from './message-identity';

vi.mock('@neko/shared/vscode', () => ({
  getVSCodeAPI: () => ({
    postMessage: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
  }),
  postMessage: vi.fn(),
}));

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const STORYBOARD_TEST_HEADERS = [
  'scene',
  'shot',
  'source',
  'sourcePanel',
  'decision',
  'duration',
  'visual',
  'motion',
  'audio',
  'characters',
  'dialogue',
  'prompt',
  'reviewStatus',
  'nextAction',
  'contentType',
] as const;

describe('MessageItem identity rendering', () => {
  it('renders the character name for character dialogue assistant messages', () => {
    renderMessageItem({
      message: createMessage({ role: 'assistant', content: '我会自己确认。' }),
      identities: {
        user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
        assistant: {
          displayName: '小橘',
          avatarLabel: '小橘',
          title: '小橘 (Character Dialogue)',
        },
      },
    });

    expect(screen.getAllByText('小橘')).toHaveLength(2);
    expect(screen.getByLabelText('小橘 (Character Dialogue)')).toBeTruthy();
  });

  it('renders the embodied user name for embody character user messages', () => {
    renderMessageItem({
      message: createMessage({ role: 'user', content: '我记得这里发生过什么？' }),
      identities: {
        user: {
          displayName: 'You as 小橘',
          avatarLabel: '小橘',
          title: 'You as 小橘',
        },
        assistant: {
          displayName: 'Character feedback',
          avatarLabel: 'CF',
          title: 'Character feedback',
        },
      },
    });

    expect(screen.getByText('You as 小橘')).toBeTruthy();
    expect(screen.getByLabelText('You as 小橘')).toBeTruthy();
  });
});

describe('MessageItem tool aggregation', () => {
  it('does not render Canvas handoff on plain assistant messages when Canvas is available', () => {
    renderMessageItem({
      message: createMessage({
        role: 'assistant',
        content: '',
        contentBlocks: [
          {
            id: 'text-1',
            type: 'text',
            timestamp: 1,
            content: '我会先读取资料，然后分析页面。',
          },
        ],
      }),
      identities: defaultIdentities(),
      pluginsAvailable: { canvas: true },
    });

    expect(screen.queryByRole('button', { name: /Canvas/ })).toBeNull();
  });

  it('does not show generic Canvas handoff on storyboard Markdown messages', () => {
    renderMessageItem({
      message: createMessage({
        role: 'assistant',
        content: '',
        contentBlocks: [
          {
            id: 'text-1',
            type: 'text',
            timestamp: 1,
            content: createStoryboardCreativeTable(),
          },
        ],
      }),
      identities: defaultIdentities(),
      pluginsAvailable: { canvas: true },
    });

    expect(screen.queryByRole('button', { name: /Canvas/ })).toBeNull();
  });

  it('does not render Canvas handoff for empty storyboard skeletons or metadata tables', () => {
    renderMessageItem({
      message: createMessage({
        role: 'assistant',
        content: '',
        contentBlocks: [
          {
            id: 'text-1',
            type: 'text',
            timestamp: 1,
            content: [
              '当前只拿到了图片资源 metadata，不能可靠生成分镜表。',
              '',
              '| page | assetId | 尺寸 |',
              '| --- | --- | --- |',
              '| P01 | read-image-p01-cover | 1511x2160 |',
              '',
              '| 场景 | 镜头 | 来源 | 图像提示词 | 视频提示词 | 时长 | 对白 |',
              '| --- | --- | --- | --- | --- | --- | --- |',
            ].join('\n'),
          },
        ],
      }),
      identities: defaultIdentities(),
      pluginsAvailable: { canvas: true },
    });

    expect(screen.queryByRole('button', { name: /Canvas/ })).toBeNull();
  });

  it('renders storyboard source thumbnails from same-message ReadImage tool context', () => {
    renderMessageItem({
      message: createMessage({
        role: 'assistant',
        content: '',
        contentBlocks: [
          readImageToolBlock({
            alias: 'P1',
            label: 'Page 1',
            renderUri: 'vscode-webview://page-1',
          }),
          {
            id: 'text-1',
            type: 'text',
            timestamp: 20,
            content: createStoryboardCreativeTable(),
          },
        ],
      }),
      identities: defaultIdentities(),
      pluginsAvailable: { canvas: true },
    });

    expect(screen.getAllByAltText('Page 1').map((image) => image.getAttribute('src'))).toEqual([
      'vscode-webview://page-1',
    ]);
    expect(screen.queryByText(/no image resource context/)).toBeNull();
  });

  it('renders consecutive repeated tool calls as a collapsed group', () => {
    renderMessageItem({
      message: createMessage({
        role: 'assistant',
        content: '',
        contentBlocks: [
          toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
          toolBlock('tool-2', 'ReadDocument', '/books/a.epub', 14),
          toolBlock('tool-3', 'ReadDocument', '/books/a.epub', 18),
        ],
      }),
      identities: {
        user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
        assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
      },
    });

    expect(screen.getByRole('button', { name: /ReadDocument x3/ })).toBeTruthy();
    expect(screen.getByText('/books/a.epub')).toBeTruthy();
    expect(screen.getByText('3 succeeded')).toBeTruthy();
    expect(screen.queryAllByText('ReadDocument')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /ReadDocument x3/ }));

    expect(screen.getAllByText('ReadDocument')).toHaveLength(3);
  });

  it('collapses process records before final assistant content when they happened first', () => {
    renderMessageItem({
      message: createMessage({
        role: 'assistant',
        content: '',
        contentBlocks: [
          {
            id: 'thinking-1',
            type: 'thinking',
            timestamp: 1,
            thinking: 'Analyze source pages.',
            isThinkingComplete: true,
          },
          toolBlock('tool-1', 'ReadDocument', '/books/a.epub', 10),
          {
            id: 'text-1',
            type: 'text',
            timestamp: 20,
            content: 'Final storyboard summary.',
          },
        ],
      }),
      identities: {
        user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
        assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
      },
    });

    const processRecordsButton = screen.getByRole('button', { name: /chat.processRecords.title/ });
    const finalContent = screen.getByText('Final storyboard summary.');
    expect(processRecordsButton.compareDocumentPosition(finalContent)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByText('ReadDocument')).toBeNull();

    fireEvent.click(processRecordsButton);

    expect(screen.getByText(/Analyze source pages/)).toBeTruthy();
    expect(screen.getByText('ReadDocument')).toBeTruthy();
  });
});

describe('MessageItem reference rendering', () => {
  it('renders non-preview user attachments with the shared reference token', () => {
    renderMessageItem({
      message: {
        ...createMessage({ role: 'user', content: 'Please inspect this.' }),
        attachments: [
          {
            id: 'attachment-1',
            name: 'brief.md',
            type: 'file',
            size: 1024,
          },
        ],
      },
      identities: {
        user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
        assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
      },
    });

    const token = document.querySelector('[data-agent-reference-token="true"]');
    expect(token?.className).toContain('agent-reference-token');
    expect(token?.getAttribute('data-reference-variant')).toBe('inline');
    expect(token?.getAttribute('data-reference-kind')).toBe('file');
    expect(screen.getByText('brief.md')).toBeTruthy();
    expect(screen.getByText('1.0 KB')).toBeTruthy();
  });

  it('keeps workspace attachment parent paths visible in user messages', () => {
    renderMessageItem({
      message: {
        ...createMessage({ role: 'user', content: 'Please inspect this.' }),
        attachments: [
          {
            id: 'attachment-video',
            name: '1080P.mp4',
            type: 'video',
            path: 'cases/1080P.mp4',
          },
        ],
      },
      identities: {
        user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
        assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
      },
    });

    const token = document.querySelector('[data-agent-reference-token="true"]');
    expect(token?.getAttribute('data-reference-kind')).toBe('video');
    expect(screen.getByText('1080P.mp4')).toBeTruthy();
    expect(screen.getByText('cases')).toBeTruthy();
  });

  it('renders stored context references with the shared reference token', () => {
    renderMessageItem({
      message: {
        ...createMessage({ role: 'user', content: 'Please inspect this node.' }),
        contextReferences: [
          {
            id: 'node-1',
            type: 'canvas-node',
            label: '#1 wide shot',
            navigationData: { nodeId: 'node-1' },
          },
        ],
      },
      identities: {
        user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
        assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
      },
    });

    const token = document.querySelector('[data-agent-reference-token="true"]');
    expect(token?.getAttribute('data-reference-kind')).toBe('canvas');
    expect(token?.getAttribute('data-reference-variant')).toBe('attached');
    expect(screen.getByText('#1 wide shot')).toBeTruthy();
  });

  it('renders selected file reference context with parent path metadata', () => {
    renderMessageItem({
      message: {
        ...createMessage({ role: 'user', content: '分析' }),
        contextReferences: [
          {
            id: 'file-ref:${A}/books/story.epub',
            type: 'file',
            label: 'story.epub',
            summary: '${A}/books/story.epub',
            mediaType: 'document',
            navigationData: {
              path: '${A}/books/story.epub',
              filePath: '${A}/books/story.epub',
            },
          },
        ],
      },
      identities: {
        user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
        assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
      },
    });

    const token = document.querySelector('[data-agent-reference-token="true"]');
    expect(token?.getAttribute('data-reference-kind')).toBe('file');
    expect(screen.getByText('story.epub')).toBeTruthy();
    expect(screen.getByText('${A}/books')).toBeTruthy();
  });
});

function renderMessageItem(input: {
  message: Message;
  identities: MessageIdentityMap;
  pluginsAvailable?: PluginsAvailable;
}) {
  render(
    <MessageActionsProvider pluginsAvailable={input.pluginsAvailable}>
      <MessageItem message={input.message} conversationId="conv-1" identities={input.identities} />
    </MessageActionsProvider>,
  );
}

function defaultIdentities(): MessageIdentityMap {
  return {
    user: { displayName: 'You', avatarLabel: 'You', title: 'You' },
    assistant: { displayName: 'Assistant', avatarLabel: 'AI', title: 'Assistant' },
  };
}

function createStoryboardCreativeTable(): string {
  return [
    `| ${STORYBOARD_TEST_HEADERS.join(' | ')} |`,
    `| ${STORYBOARD_TEST_HEADERS.map(() => '---').join(' | ')} |`,
    `| ${STORYBOARD_TEST_HEADERS.map((header) => storyboardCreativeTableValue(header)).join(' | ')} |`,
  ].join('\n');
}

function storyboardCreativeTableValue(header: string): string {
  const values: Record<string, string> = {
    scene: '森林',
    shot: '1',
    source: 'P1',
    sourcePanel: 'P1',
    decision: 'keep',
    duration: '3s',
    visual: '角色进入森林',
    motion: 'slow push in',
    audio: 'low ambience',
    characters: 'lead',
    dialogue: '',
    prompt: 'cinematic forest storyboard frame',
    reviewStatus: 'needs-review',
    nextAction: 'split-panels',
    contentType: 'story',
    decisionReason: 'useful narrative beat',
    requiresSplit: 'true',
    duplicateOf: '',
  };
  return values[header] ?? '';
}

function createMessage(
  overrides: Pick<Message, 'role' | 'content'> & Partial<Pick<Message, 'contentBlocks'>>,
): Message {
  return {
    id: `${overrides.role}-message-1`,
    role: overrides.role,
    content: overrides.content,
    timestamp: 1_717_200_000_000,
    ...(overrides.contentBlocks ? { contentBlocks: overrides.contentBlocks } : {}),
  };
}

function toolBlock(id: string, name: string, filePath: string, duration: number) {
  return {
    id: `block-${id}`,
    type: 'tool_call' as const,
    timestamp: duration,
    toolCall: {
      id,
      name,
      arguments: { file_path: filePath },
      result: {
        success: true,
        data: { file_path: filePath },
        duration,
      },
    },
  };
}

function readImageToolBlock(input: { alias: string; label: string; renderUri: string }) {
  return {
    id: 'block-read-image',
    type: 'tool_call' as const,
    timestamp: 10,
    toolCall: {
      id: 'read-image',
      name: 'ReadImage',
      arguments: {},
      result: {
        success: true,
        data: {
          imageInfo: [
            {
              alias: input.alias,
              label: input.label,
              renderUri: input.renderUri,
              resourceRef: {
                id: 'page-1',
                scope: 'project',
                provider: 'read-image',
                kind: 'media',
                source: { kind: 'file', projectRelativePath: 'images/page-1.jpg' },
                locator: { kind: 'file', path: 'images/page-1.jpg' },
                fingerprint: {
                  strategy: 'provider',
                  providerId: 'read-image',
                  value: 'page-1',
                },
              },
            },
          ],
        },
      },
    },
  };
}
