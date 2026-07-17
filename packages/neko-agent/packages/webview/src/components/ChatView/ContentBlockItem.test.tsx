import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentBlock } from '@neko-agent/types';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { registerDefaultRenderers } from '@/components/ChatView/RichContent';
import { ContentBlockItem } from './ContentBlockItem';

const { mockPostMessage } = vi.hoisted(() => ({
  mockPostMessage: vi.fn(),
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
        'chat.canvasLifecycle.status.needs-review': '待审阅',
        'chat.canvasLifecycle.badge.displayFallback': '仅显示兜底',
        'chat.canvasLifecycle.badge.genericTable': '通用表格',
        'chat.canvasLifecycle.badge.creativeTable': '创作表格',
        'chat.canvasLifecycle.blocked': '已阻止',
        'chat.canvasLifecycle.diagnosticSeverity.warning': '警告',
        'chat.canvasLifecycle.diagnostic.canvasCreativeProfileUnsupported': '不支持的创作配置。',
        'chat.canvasLifecycle.reviewArtifact': `审阅产物：${String(vars?.['artifact'] ?? '')}`,
        'chat.canvasLifecycle.changedRefs': `变更引用：${String(vars?.['refs'] ?? '')}`,
        'chat.canvasLifecycle.approvalRequired': '需确认',
        'chat.canvasLifecycle.action.createStoryboardNodes': '创建分镜节点',
        'chat.canvasLifecycle.disabled.conversationUnavailable': '对话不可用',
        'chat.canvasLifecycle.disabled.unsupportedActionPayload': '不支持的动作载荷',
      })[key] ?? (vars?.['count'] !== undefined ? `${String(vars['count'])} ${key}` : key),
  }),
}));

describe('ContentBlockItem Canvas transfer actions', () => {
  beforeEach(() => {
    mockPostMessage.mockClear();
  });

  it('renders assistant identity on the first content block avatar', () => {
    renderContentBlock(
      {
        id: 'plain',
        type: 'text',
        timestamp: 1,
        content: 'Hi! How can I help?',
      },
      {
        avatarLabel: '小橘',
        title: '小橘 (Character Dialogue)',
      },
    );

    expect(screen.getByLabelText('小橘 (Character Dialogue)')).toBeTruthy();
  });

  it('does not render Canvas Markdown handoff for plain assistant prose', () => {
    renderContentBlock({
      id: 'plain',
      type: 'text',
      timestamp: 1,
      content: 'Hi! How can I help?',
    });

    expect(screen.queryByRole('button', { name: /Canvas/ })).toBeNull();
  });

  it('does not retain generic Send to Canvas for current assistant Markdown', () => {
    renderContentBlock({
      id: 'storyboard',
      type: 'text',
      timestamp: 1,
      content: createStoryboardCreativeTable(),
    });

    expect(screen.queryByRole('button', { name: /Canvas/ })).toBeNull();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('routes embedded canonical Storyboard actions without Markdown reconstruction or asset flattening', () => {
    const canonicalStoryboard = createCanonicalStoryboardFixture();
    renderContentBlock({
      id: 'canonical-storyboard',
      type: 'text',
      timestamp: 1,
      content: `\`\`\`neko-composite\n${JSON.stringify({
        ...canonicalStoryboard,
        template: 'storyboard-table',
      })}\n\`\`\``,
    });

    const canvasActions = screen.getAllByRole('button', { name: /Canvas/ });
    expect(canvasActions.length).toBeGreaterThan(0);
    for (const action of canvasActions) fireEvent.click(action);

    const handoffMessages = mockPostMessage.mock.calls.map((call) => call[0]);
    expect(handoffMessages.length).toBe(canvasActions.length);
    for (const message of handoffMessages) {
      expect(message).toEqual(
        expect.objectContaining({
          type: 'requestCanvasAuthoringHandoff',
          conversationId: 'conv-1',
          sourceKind: 'structured-content',
          sourceFormat: 'composite-artifact',
          canonicalStoryboard: expect.objectContaining({
            revision: expect.objectContaining({ revisionId: 'storyboard-rev-1' }),
            scenes: [
              expect.objectContaining({
                sceneId: 'scene-1',
                shots: [
                  expect.objectContaining({
                    shotId: 'shot-1',
                    imagePrompt: 'cat keyframe',
                    videoPrompt: 'cat scene motion',
                    sourceMediaRefs: [
                      expect.objectContaining({
                        refId: 'source-image-1',
                        resourceRef: expect.objectContaining({ id: 'source-image-resource' }),
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        }),
      );
      expect(JSON.stringify(message)).not.toContain('assetBatch');
    }
  });

  it('does not show generic Canvas transfer for storyboard-ready Markdown', () => {
    renderContentBlock({
      id: 'storyboard',
      type: 'text',
      timestamp: 1,
      content: createStoryboardCreativeTable(),
    });

    expect(screen.queryByRole('button', { name: /Canvas/ })).toBeNull();
  });

  it('keeps simplified storyboard display tables as auto-delivered Markdown', () => {
    renderContentBlock({
      id: 'weak-storyboard',
      type: 'text',
      timestamp: 1,
      content: ['| 镜头 | 画面 |', '| --- | --- |', '| 1 | 角色进入森林 |'].join('\n'),
    });

    expect(screen.queryByRole('button', { name: /Canvas/ })).toBeNull();
  });

  it('renders composite artifact transfers as review-only artifact cards', () => {
    renderContentBlock({
      id: 'tool-artifact',
      type: 'tool_call',
      timestamp: 1,
      toolCall: {
        id: 'tool-1',
        name: 'GeneratePlan',
        arguments: {},
        result: {
          success: true,
          data: { status: 'completed' },
          artifacts: [
            {
              type: 'artifactSnapshot',
              complete: true,
              artifact: {
                schemaVersion: 1,
                kind: 'composite-artifact',
                artifactId: 'artifact-1',
                profile: 'media-production.shot-image-prep',
                title: 'Comic shot plan',
                blocks: [{ blockId: 'summary', kind: 'text', text: 'Review shots.' }],
                suggestedActions: [
                  {
                    actionId: 'canvas.ingestMarkdown',
                    kind: 'review',
                    disabled: true,
                    disabledReason: 'Provider unavailable',
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(screen.getByText('Comic shot plan')).toBeTruthy();
    expect(screen.getByText('Review shots.')).toBeTruthy();
    expect(screen.getByText('text')).toBeTruthy();
    expect(screen.getByText('media-production.shot-image-prep')).toBeTruthy();
    expect(screen.getByText('canvas.ingestMarkdown')).toBeTruthy();
    expect(screen.getByText(/disabled: Provider unavailable/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /import/i })).toBeNull();
  });

  it('renders generic artifact table blocks without exposing execute controls', () => {
    renderContentBlock({
      id: 'tool-table-artifact',
      type: 'tool_call',
      timestamp: 1,
      toolCall: {
        id: 'tool-1',
        name: 'GeneratePlan',
        arguments: {},
        result: {
          success: true,
          data: { status: 'completed' },
          artifacts: [
            {
              type: 'artifactSnapshot',
              complete: true,
              artifact: {
                schemaVersion: 1,
                kind: 'composite-artifact',
                artifactId: 'artifact-1',
                profile: 'media-production.animation-plan',
                title: 'Comic shot plan',
                blocks: [
                  {
                    blockId: 'table',
                    kind: 'table',
                    table: {
                      schemaVersion: 1,
                      kind: 'generic-table',
                      tableId: 'shots',
                      title: 'Shots',
                      columns: [{ columnId: 'shotId', cellType: 'string' }],
                      rows: [
                        {
                          rowId: 'shot-1',
                          cells: { shotId: { type: 'string', value: 'shot-1' } },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(screen.getAllByText('table').length).toBeGreaterThan(0);
    expect(screen.getByText('Shots')).toBeTruthy();
    expect(screen.getByText('shotId')).toBeTruthy();
    expect(screen.getByText('shot-1')).toBeTruthy();
    expect(screen.getByText('1 rows / 1 columns')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /execute|import/i })).toBeNull();
  });

  it('renders Canvas lifecycle follow-up actions as approval-gated controls', () => {
    renderContentBlock({
      id: 'canvas-result',
      type: 'canvas_lifecycle',
      timestamp: 1,
      canvasLifecycle: {
        requestId: 'req-1',
        success: true,
        result: {
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          status: 'needs-review',
          diagnostics: [],
          reviewArtifact: {
            kind: 'node',
            id: 'table-1',
            packageId: 'neko-canvas',
            profile: 'storyboard',
          },
          actions: [
            {
              actionId: 'create-storyboard-nodes',
              label: 'Create storyboard nodes',
              capabilityId: 'canvas.createStoryboardFromMarkdown',
              phase: 'apply',
              requiresApproval: true,
              sourceRef: { kind: 'node', id: 'table-1', packageId: 'neko-canvas' },
              payload: {
                capabilityId: 'canvas.createStoryboardFromMarkdown',
                markdown: '| Scene | Shot | Visual |\\n| --- | --- | --- |\\n| S1 | 1 | open |',
                sourceFormat: 'gfm-table',
                mode: 'create-nodes',
              },
            },
          ],
        },
      },
    });

    expect(screen.getByText('Canvas 待审阅')).toBeTruthy();
    expect(screen.queryByText('Create storyboard nodes')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /创建分镜节点/ }));

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'invokeAgentCapabilityLifecycle',
        conversationId: 'conv-1',
        invocation: expect.objectContaining({
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          phase: 'apply',
          approval: expect.objectContaining({ source: 'user-confirmation' }),
          payload: expect.objectContaining({
            capabilityId: 'canvas.createStoryboardFromMarkdown',
            mode: 'create-nodes',
          }),
        }),
      }),
    );
  });

  it('marks generic fallback lifecycle results as display-only', () => {
    renderContentBlock({
      id: 'canvas-result',
      type: 'canvas_lifecycle',
      timestamp: 1,
      canvasLifecycle: {
        requestId: 'req-1',
        success: true,
        result: {
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          status: 'needs-review',
          diagnostics: [
            {
              severity: 'warning',
              code: 'canvas-creative-profile-unsupported',
              message: 'Unsupported creative profile "interactive-video".',
            },
          ],
          data: {
            capabilityId: 'canvas.ingestMarkdown',
            status: 'created',
            resolvedKind: 'generic-table',
            displayFallback: true,
            diagnostics: [],
          },
        },
      },
    });

    expect(screen.getByText('仅显示兜底')).toBeTruthy();
    expect(screen.getByText('警告')).toBeTruthy();
    expect(screen.getByText('不支持的创作配置。')).toBeTruthy();
    expect(screen.queryByText(/Unsupported creative profile/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Create storyboard nodes/ })).toBeNull();
  });

  it('renders unsupported Canvas lifecycle actions disabled', () => {
    renderContentBlock({
      id: 'canvas-result',
      type: 'canvas_lifecycle',
      timestamp: 1,
      canvasLifecycle: {
        requestId: 'req-1',
        success: true,
        result: {
          capabilityId: 'canvas.ingestMarkdown',
          phase: 'review',
          status: 'needs-review',
          diagnostics: [],
          actions: [
            {
              actionId: 'run-external',
              label: 'Run external action',
              capabilityId: 'canvas.createStoryboardFromMarkdown',
              phase: 'apply',
              requiresApproval: true,
              payload: { capabilityId: 'unknown.tool', markdown: 'nope' },
            },
          ],
        },
      },
    });

    const action = screen.getByRole('button', { name: /run-external/ });
    expect(screen.queryByText('Run external action')).toBeNull();
    expect(action.hasAttribute('disabled')).toBe(true);
    expect(action.getAttribute('title')).toBe('不支持的动作载荷');
  });
});

function renderContentBlock(
  block: ContentBlock,
  assistantIdentity?: { avatarLabel: string; title: string },
) {
  registerDefaultRenderers();
  render(
    <MessageActionsProvider pluginsAvailable={{ canvas: true }}>
      <ContentBlockItem
        block={block}
        isFirst
        isLast
        isStreaming={false}
        conversationId="conv-1"
        assistantIdentity={
          assistantIdentity
            ? {
                displayName: assistantIdentity.avatarLabel,
                avatarLabel: assistantIdentity.avatarLabel,
                title: assistantIdentity.title,
              }
            : undefined
        }
      />
    </MessageActionsProvider>,
  );
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

function createCanonicalStoryboardFixture() {
  return {
    schemaVersion: 1 as const,
    kind: 'storyboard-table' as const,
    contractVersion: 1 as const,
    sourceProfile: 'from-script' as const,
    revision: {
      revisionId: 'storyboard-rev-1',
      sequence: 1,
      contentDigest: 'storyboard-rev-1',
      createdAt: '2026-07-12T00:00:00.000Z',
    },
    sourceTrace: [
      {
        traceId: 'trace-1',
        sourceProfile: 'from-script' as const,
        sourceRef: {
          id: 'story-source-resource',
          scope: 'project' as const,
          provider: 'workspace',
          kind: 'document' as const,
          source: { kind: 'file' as const, projectRelativePath: 'scripts/story.md' },
          locator: { kind: 'file' as const, path: '${WORKSPACE}/scripts/story.md' },
          fingerprint: { strategy: 'hash' as const, value: 'story-source' },
        },
      },
    ],
    title: 'Cats',
    scenes: [
      {
        sceneId: 'scene-1',
        sceneTitle: 'Hallway',
        shots: [
          {
            shotId: 'shot-1',
            shotNumber: 1,
            duration: 3,
            visualDescription: 'A cat enters.',
            characterAction: 'The cat walks.',
            imageStrategy: 'use-as-reference' as const,
            imagePrompt: 'cat keyframe',
            videoPrompt: 'cat scene motion',
            sourceMediaRefs: [
              {
                refId: 'source-image-1',
                role: 'source' as const,
                locator: {
                  type: 'workspace-path' as const,
                  path: '${WORKSPACE}/assets/cat.png',
                },
                resourceRef: {
                  id: 'source-image-resource',
                  scope: 'project' as const,
                  provider: 'workspace',
                  kind: 'media' as const,
                  source: { kind: 'file' as const, projectRelativePath: 'assets/cat.png' },
                  locator: { kind: 'file' as const, path: '${WORKSPACE}/assets/cat.png' },
                  fingerprint: { strategy: 'hash' as const, value: 'cat-image' },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}
