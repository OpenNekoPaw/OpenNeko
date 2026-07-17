import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerDefaultRenderers } from '@/components/ChatView/RichContent';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { MarkdownResourceRenderingProjection } from '@/presenters/markdown-resource-rendering-presenter';
import type { ConversationProjectionPatch } from '@neko-agent/types';
import {
  createAgentMarkdownSessionKey,
  getAgentMarkdownSessionRegistry,
} from '@/markdown/agent-markdown-session-registry';

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars?.['count'] !== undefined ? `${String(vars['count'])} ${key}` : key,
  }),
}));

vi.mock('@/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    ({
      'chat.structuredArtifact.generating': 'Generating structured content...',
      'chat.markdown.resourceStatus.image': '图像',
      'chat.markdown.resourceStatus.images': `${String(params?.['count'] ?? '')} 张图像`,
      'chat.markdown.resourceStatus.candidates': `${String(params?.['count'] ?? '')} 个候选`,
      'chat.markdown.resourceStatus.ambiguous': '有歧义',
      'chat.markdown.resourceStatus.missing': '缺失',
      'chat.markdown.resourceStatus.unsupported': '不支持',
      'chat.markdown.resourceStatus.unbound': '未绑定',
      'chat.markdown.diagnostic.missingResourceToken': `Markdown 资源标记 "${String(params?.['token'] ?? '')}" 未匹配到已知资源。`,
      'chat.markdown.diagnostic.missingResourceContext': `Markdown 资源标记 "${String(params?.['token'] ?? '')}" 无法解析，因为这条消息没有图像资源上下文。`,
      'chat.markdown.diagnostic.ambiguousResourceToken': `Markdown 资源标记 "${String(params?.['token'] ?? '')}" 匹配到多个资源。`,
      'chat.markdown.diagnostic.unsupportedResourceReference':
        '这条消息需要宿主提供资源投影后才能渲染 Neko 资源引用嵌入和链接。',
      'chat.markdown.image.unprojected': `图像引用 "${String(params?.['src'] ?? '')}" 尚未由宿主投影。`,
      'chat.markdown.image.missingSource': '图像引用缺少来源。',
    })[key] ?? key,
  getLocale: () => 'zh-cn',
}));

afterEach(() => {
  cleanup();
  getAgentMarkdownSessionRegistry().disposeAll();
});

describe('MarkdownRenderer structured artifacts', () => {
  it('renders Timeline-owned streaming with the canonical normalized session identity', () => {
    const content = '| A | B |\n| - | - |\n| 1 | 2 |';
    const key = createTimelineMarkdownSession(content);
    const timelineSnapshot = getAgentMarkdownSessionRegistry().getSnapshot(key);

    const { container } = render(
      <MarkdownRenderer sessionKey={key} content={content} isStreaming />,
    );

    const root = container.querySelector('[data-markdown-session-id]');
    expect(root?.getAttribute('data-markdown-session-id')).toBe(timelineSnapshot?.sessionId);
    expect(root?.getAttribute('data-markdown-revision')).toBe('1');
    expect(root?.getAttribute('data-markdown-final')).toBe('false');
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('immediately finalizes historical Markdown through the same normalized adapter', () => {
    const content = '| A | B |\n| - | - |\n| 1 | 2 |';
    const { container } = render(
      <MarkdownRenderer sessionKey="historical-final" content={content} />,
    );

    const root = container.querySelector('[data-markdown-session-id]');
    expect(root?.getAttribute('data-markdown-final')).toBe('true');
    expect(root?.getAttribute('data-markdown-revision')).toBe('1');
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('renders enriched semantic composites once through their normalized code-block source', () => {
    const content =
      '```neko-composite\n{"template":"report","title":"Source title","sections":[{"heading":"Source section","content":"Source content"}]}\n```';
    render(
      <MarkdownRenderer
        sessionKey="historical-derived-composite"
        content={content}
        contentBlockId="block-text"
        siblingBlocks={[
          {
            id: 'block-text-composite-1',
            type: 'composite',
            timestamp: 1,
            composite: {
              template: 'storyboard-table',
              title: 'Projected title',
              sections: [{ heading: 'Projected section', content: 'Projected content' }],
            },
            compositeSource: {
              kind: 'normalized-markdown-code-block',
              sourceBlockId: 'block-text',
              startOffset: 0,
              endOffset: content.length,
              language: 'neko-composite',
              candidateIndex: 0,
            },
          },
        ]}
      />,
    );

    expect(screen.getByText('storyboard-table')).toBeTruthy();
    expect(screen.queryByText('asset-gallery')).toBeNull();
  });

  it('renders uppercase neko composite artifacts as storyboard tables', () => {
    renderMarkdown(`Summary.

\`\`\`NEKO
{
  "schemaVersion": 1,
  "kind": "composite-artifact",
  "artifactId": "artifact-storyboard",
  "title": "Comic artifact",
  "blocks": [
    {
      "blockId": "storyboard-domain",
      "kind": "domain",
      "title": "Storyboard Payload",
      "domainKind": "StoryboardTable",
      "schemaVersion": 1,
      "payload": {
        "schemaVersion": 1,
        "kind": "storyboard-table",
        "title": "Opening",
        "scenes": [
          {
            "sceneId": "scene-1",
            "sceneTitle": "Page 1",
            "shots": [
              {
                "shotNumber": 1,
                "duration": 3,
                "visualDescription": "Panel action and composition.",
                "characterAction": "Rin enters the frame.",
                "imageStrategy": "use-as-reference"
              }
            ]
          }
        ]
      }
    }
  ]
}
\`\`\``);

    expect(screen.getByText('Summary.')).toBeTruthy();
    expect(screen.getByText('Storyboard Payload')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Panel action and composition.');
    expect(screen.queryByText('NEKO')).toBeNull();
    expect(screen.queryByText(/"kind": "composite-artifact"/)).toBeNull();
  });

  it('hides incomplete structured artifact source while streaming', () => {
    renderMarkdown(
      `\`\`\`neko
{
  "schemaVersion": 1,
  "kind": "composite-artifact",
  "blocks": [`,
      true,
    );

    expect(screen.getByText('Generating structured content...')).toBeTruthy();
    expect(screen.queryByText(/"schemaVersion": 1/)).toBeNull();
  });

  it('keeps ordinary json code blocks visible', () => {
    renderMarkdown(`\`\`\`json
{ "hello": "world" }
\`\`\``);

    expect(screen.getByText('json')).toBeTruthy();
    expect(screen.getByText(/hello/)).toBeTruthy();
  });

  it('renders non-storyboard composite artifacts with the generic artifact renderer', () => {
    renderMarkdown(`\`\`\`NEKO
{
  "schemaVersion": 1,
  "kind": "composite-artifact",
  "artifactId": "character-review",
  "title": "Character Review",
  "profile": "character-memory-review",
  "blocks": [
    {
      "blockId": "review-table",
      "kind": "table",
      "title": "Review Table",
      "table": {
        "schemaVersion": 1,
        "kind": "generic-table",
        "tableId": "characters",
        "title": "Characters",
        "columns": [
          { "columnId": "name", "label": "Name", "cellType": "string" },
          { "columnId": "status", "label": "Status", "cellType": "status" }
        ],
        "rows": [
          {
            "rowId": "hero",
            "cells": {
              "name": { "type": "string", "value": "少年英雄" },
              "status": { "type": "status", "value": "needs-review" }
            }
          }
        ]
      }
    }
  ]
}
\`\`\``);

    expect(screen.getByText('Character Review')).toBeTruthy();
    expect(screen.getByText('character-memory-review')).toBeTruthy();
    expect(screen.getByText('Characters')).toBeTruthy();
    expect(screen.getByText('少年英雄')).toBeTruthy();
    expect(screen.queryByText(/"artifactId": "character-review"/)).toBeNull();
  });

  it('renders resource token thumbnails from projection without persisting render URIs', () => {
    const projection: MarkdownResourceRenderingProjection = {
      status: 'ready',
      diagnostics: [],
      tokens: [
        {
          token: 'page_1',
          status: 'bound',
          refs: [{ label: 'Page 1', role: 'source' }],
          resources: [
            { token: 'page_1', label: 'Page 1', role: 'source', sourcePath: 'assets/page-1.png' },
          ],
          renderUris: ['vscode-webview://page-1'],
          diagnostics: [],
        },
      ],
    };

    renderMarkdown(
      [
        '| shot id | source | duration | visual |',
        '| --- | --- | --- | --- |',
        '| 001 | page_1 | 4s | Frame |',
      ].join('\n'),
      false,
      projection,
    );

    expect(screen.queryByText('page_1')).toBeNull();
    expect(screen.getByAltText('Page 1').getAttribute('src')).toBe('vscode-webview://page-1');
    expect(JSON.stringify(projection.tokens[0]?.refs)).not.toContain('vscode-webview://page-1');
  });

  it('renders table resource images as uncropped media previews', () => {
    renderMarkdown(
      [
        '| shot id | source | visual |',
        '| --- | --- | --- |',
        '| 001 | P1 | Establishing page |',
      ].join('\n'),
      false,
      {
        status: 'ready',
        diagnostics: [],
        tokens: [
          {
            token: 'P1',
            status: 'bound',
            refs: [{ label: 'Page 1', role: 'source' }],
            resources: [{ token: 'P1', label: 'Page 1', role: 'source', sourcePath: 'P1' }],
            renderUris: ['vscode-webview://page-1'],
            diagnostics: [],
          },
        ],
      },
    );

    const image = screen.getByAltText('Page 1');
    expect(image.getAttribute('src')).toBe('vscode-webview://page-1');
    expect(image.className).toContain('object-contain');
    expect(image.className).toContain('max-h-40');
    expect(image.className).not.toContain('h-12');
    expect(image.className).not.toContain('w-12');
    expect(image.className).not.toContain('object-cover');
    expect(screen.queryByText('P1')).toBeNull();
  });

  it('renders storyboard creative tables as Canvas scene review tables', () => {
    const { container } = render(
      <MarkdownRenderer
        sessionKey="test-storyboard-direct"
        content={[
          '| scene | shot | source | imagePrompt | videoPrompt | duration | dialogue | 自定义审阅 | nextAction |',
          '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
          '| Opening | 1 | P1 | keyframe | scene video | 4s | hello | note | generate video |',
        ].join('\n')}
      />,
    );

    expect(container.querySelector('[data-markdown-storyboard-scene-table="true"]')).toBeTruthy();
    expect(container.querySelector('[data-markdown-storyboard-compact-table="true"]')).toBeNull();
    expect(screen.getByRole('columnheader', { name: '镜头' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '参考素材' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '图片提示词' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '场景视频提示词' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '时长' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '台词' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '操作' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: '状态' })).toBeNull();
    expect(screen.getByText('4s')).toBeTruthy();
    expect(screen.getByText('keyframe')).toBeTruthy();
    expect(screen.getByText('scene video')).toBeTruthy();
    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.getByText('generate video')).toBeTruthy();
    expect(screen.queryByText('审阅元数据')).toBeNull();
    expect(screen.queryByText('自定义审阅')).toBeNull();
    expect(screen.queryByText('note')).toBeNull();
  });

  it('derives reference processing action when imagePrompt describes image editing', () => {
    const { container } = renderMarkdown(
      [
        '| scene | shot | source | imagePrompt | videoPrompt | duration | dialogue |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| 正文 | 1 | P1 | 图像编辑：裁切左侧分格，旋转页面，上色并重绘线稿 | 场景视频生成：以 P1 为参考，镜头 1 两人站在平台尽头，镜头缓慢推近，保持场景空间关系 | 4s | 无台词 |',
      ].join('\n'),
    );

    expect(container.querySelector('[data-markdown-storyboard-scene-action]')?.textContent).toBe(
      '处理参考素材',
    );
  });

  it('renders full storyboard prompts with lightweight semantic chunks instead of line-clamping', () => {
    const { container } = renderMarkdown(
      [
        '| scene | shot | source | imagePrompt | videoPrompt | duration | dialogue |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| 正文 | 1 | P5#panel_1 | 图像编辑：裁切右侧高耸垂直建筑分格，保留巨大墙面、竖井、裂纹和拟声字，清理对白气泡，保持黑白漫画线稿一致 | 场景视频生成：以 P5#panel_1 为参考，镜头 1 沿巨型垂直墙面缓慢下移，空间空旷压迫，远处角色保持静止，无对白，持续 3 秒，不新增来源分格外动作 | 3s | 无对白 |',
      ].join('\n'),
    );

    const imagePrompt = container.querySelector('[data-markdown-storyboard-prompt-cell="image"]');
    const videoPrompt = container.querySelector('[data-markdown-storyboard-prompt-cell="video"]');

    expect(imagePrompt?.className).not.toContain('line-clamp');
    expect(videoPrompt?.className).not.toContain('line-clamp');
    expect(imagePrompt?.getAttribute('data-markdown-storyboard-prompt-visual-style')).toBe(
      'subtle-inline',
    );
    expect(videoPrompt?.getAttribute('data-markdown-storyboard-prompt-visual-style')).toBe(
      'subtle-inline',
    );
    expect(imagePrompt?.textContent).toContain('裁切右侧高耸垂直建筑分格');
    expect(imagePrompt?.textContent).toContain('保持黑白漫画线稿一致');
    expect(videoPrompt?.textContent).toContain('空间空旷压迫');
    expect(videoPrompt?.textContent).toContain('不新增来源分格外动作');
    const promptParts = Array.from(
      container.querySelectorAll('[data-markdown-storyboard-prompt-part="true"]'),
    );
    expect(promptParts.length).toBeGreaterThan(0);
    for (const part of promptParts) {
      expect(part.className).toContain('text-[var(--vscode-foreground)]');
      expect(part.className).toContain('underline');
      expect(part.className).not.toContain(' block ');
      expect(part.className).not.toContain('text-emerald-950');
      expect(part.className).not.toContain('text-cyan-950');
      expect(part.className).not.toContain('text-amber-950');
    }
    expect(
      container.querySelector('[data-markdown-storyboard-prompt-part-kind="intent"]')?.textContent,
    ).toContain('图像编辑');
    expect(
      container.querySelector('[data-markdown-storyboard-prompt-part-kind="reference"]')
        ?.textContent,
    ).toContain('P5#panel_1');
    expect(
      Array.from(
        container.querySelectorAll('[data-markdown-storyboard-prompt-part-kind="constraint"]'),
      ).some((part) => part.textContent?.includes('保持') || part.textContent?.includes('保留')),
    ).toBe(true);
  });

  it('does not surface Canvas review status in Agent storyboard tables', () => {
    renderMarkdown(
      [
        '| scene | shot | source | imagePrompt | videoPrompt | duration | dialogue | reviewStatus | nextAction |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| 正文 | 1 | P1 | 雨夜走廊关键帧 | 缓慢推近门口黑影 | 3s | 你怎么会在这里？ | needs-visual-analysis | 生成视频 |',
      ].join('\n'),
    );

    expect(screen.queryByRole('columnheader', { name: '状态' })).toBeNull();
    expect(screen.queryByText('needs-visual-analysis')).toBeNull();
    expect(screen.getByText('生成视频')).toBeTruthy();
  });

  it('does not render generated resource index sections after storyboard tables', () => {
    const { container } = renderMarkdown(
      [
        '分析完成。',
        '',
        '| scene | shot | source | imagePrompt | videoPrompt | duration | dialogue |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| 正文 | 1 | P1 | keyframe | scene video | 3s | |',
        '',
        '## 资源索引',
        '',
        '| token | 感知卡 | 尺寸 | 类型 |',
        '| --- | --- | --- | --- |',
        '| P1 | ![cover](P1) | 1511x2160 | image/jpeg |',
      ].join('\n'),
      false,
      {
        status: 'ready',
        diagnostics: [],
        tokens: [
          {
            token: 'P1',
            status: 'bound',
            refs: [{ label: 'Page 1', role: 'source' }],
            resources: [{ token: 'P1', label: 'Page 1', role: 'source', sourcePath: 'P1' }],
            renderUris: ['vscode-webview://page-1'],
            diagnostics: [],
          },
        ],
      },
    );

    expect(screen.getByText('分析完成。')).toBeTruthy();
    expect(container.querySelector('[data-markdown-storyboard-scene-table="true"]')).toBeTruthy();
    expect(screen.queryByText('资源索引')).toBeNull();
    expect(screen.queryByText('感知卡')).toBeNull();
    expect(screen.queryByText('1511x2160')).toBeNull();
    expect(screen.queryByText('image/jpeg')).toBeNull();
    expect(screen.getAllByAltText('Page 1')).toHaveLength(1);
  });

  it('does not render visual-failure metadata tables or empty storyboard skeletons', () => {
    const { container } = renderMarkdown(
      [
        '视觉分析未完成，当前不能可靠生成分镜表。',
        '',
        '| page | assetId | 尺寸 |',
        '| --- | --- | --- |',
        '| P01 | read-image-p01-cover | 1511x2160 |',
        '',
        '| 场景 | 镜头 | 来源 | 图像提示词 | 视频提示词 | 时长 | 对白 |',
        '| --- | --- | --- | --- | --- | --- | --- |',
      ].join('\n'),
    );

    expect(screen.getByText('视觉分析未完成，当前不能可靠生成分镜表。')).toBeTruthy();
    expect(screen.queryByText('assetId')).toBeNull();
    expect(screen.queryByText('read-image-p01-cover')).toBeNull();
    expect(screen.queryByText('1511x2160')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: '场景' })).toBeNull();
    expect(container.querySelector('[data-markdown-storyboard-scene-table="true"]')).toBeNull();
  });

  it('keeps ambiguous storyboard references compact instead of showing candidate thumbnails', () => {
    renderMarkdown(
      [
        '| scene | shot | source | imagePrompt | videoPrompt | duration | dialogue |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| 正文 | 1 | P1 | keyframe | scene video | 3s | |',
      ].join('\n'),
      false,
      {
        status: 'diagnostic',
        diagnostics: [
          {
            code: 'ambiguous-resource-token',
            severity: 'error',
            token: 'P1',
            message: 'Markdown resource token "P1" matches multiple resources.',
            candidates: [{ label: 'Page 1' }, { label: 'Page 1 duplicate' }],
          },
        ],
        tokens: [
          {
            token: 'P1',
            status: 'ambiguous',
            refs: [{ label: 'Page 1' }, { label: 'Page 1 duplicate' }],
            resources: [],
            renderUris: ['vscode-webview://page-1', 'vscode-webview://page-1-duplicate'],
            diagnostics: [
              {
                code: 'ambiguous-resource-token',
                severity: 'error',
                token: 'P1',
                message: 'Markdown resource token "P1" matches multiple resources.',
                candidates: [{ label: 'Page 1' }, { label: 'Page 1 duplicate' }],
              },
            ],
          },
        ],
      },
    );

    expect(screen.getByText('P1')).toBeTruthy();
    expect(
      screen.getByText('2 个候选', { selector: '[data-markdown-resource-status="ambiguous"]' }),
    ).toBeTruthy();
    expect(screen.queryByAltText('Page 1')).toBeNull();
    expect(screen.queryByAltText('Page 1 duplicate')).toBeNull();
    expect(screen.queryByText('Markdown 资源标记 "P1" 匹配到多个资源。')).toBeNull();
  });

  it('localizes storyboard creative table field headers and known enum cell values', () => {
    renderMarkdown(
      [
        '| scene | shot | source | sourcePanel | nextAction |',
        '| --- | --- | --- | --- | --- |',
        '| 正文 | 1 | P1 | 整页 | use-as-reference |',
      ].join('\n'),
    );

    expect(screen.getByRole('columnheader', { name: '场景' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '镜头' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '来源' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '来源分格' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '建议操作' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'sourcePanel' })).toBeNull();
    expect(screen.getByText('use-as-reference')).toBeTruthy();
  });

  it('localizes storyboard creative table enum cells for display only', () => {
    renderMarkdown(
      [
        '| scene | shot | decision | reviewStatus | contentType | requiresSplit |',
        '| --- | --- | --- | --- | --- | --- |',
        '| 正文 | 1 | reference-only | needs-review | cover | false |',
      ].join('\n'),
    );

    expect(screen.getByText('仅作参考')).toBeTruthy();
    expect(screen.getByText('待审阅')).toBeTruthy();
    expect(screen.getByText('封面')).toBeTruthy();
    expect(screen.getByText('否')).toBeTruthy();
    expect(screen.queryByText('reference-only')).toBeNull();
    expect(screen.queryByText('needs-review')).toBeNull();
  });

  it('preserves Chinese storyboard header aliases emitted by the agent', () => {
    renderMarkdown(
      [
        '| 画面内容 | 生成提示词 | 建议操作 |',
        '| --- | --- | --- |',
        '| 主角出现 | 黑白工业巨构镜头 | split-panel |',
      ].join('\n'),
    );

    expect(screen.getByRole('columnheader', { name: '画面内容' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '生成提示词' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: '建议操作' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: '画面' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: '提示词' })).toBeNull();
  });

  it('renders inline-code resource labels from normalized token projection', () => {
    const projection: MarkdownResourceRenderingProjection = {
      status: 'ready',
      diagnostics: [],
      tokens: [
        {
          token: '`read-image-cover.jpg`',
          status: 'bound',
          refs: [{ label: 'read-image-cover.jpg', role: 'source' }],
          resources: [
            {
              token: '`read-image-cover.jpg`',
              label: 'read-image-cover.jpg',
              role: 'source',
              sourcePath: 'read-image-cover.jpg',
            },
          ],
          renderUris: ['vscode-webview://cover'],
          diagnostics: [],
        },
      ],
    };

    renderMarkdown(
      [
        '| shot id | source | duration | visual |',
        '| --- | --- | --- | --- |',
        '| 001 | `read-image-cover.jpg` | 4s | Frame |',
      ].join('\n'),
      false,
      projection,
    );

    expect(screen.queryByText('`read-image-cover.jpg`')).toBeNull();
    expect(screen.queryByText('image')).toBeNull();
    expect(screen.getByAltText('read-image-cover.jpg').getAttribute('src')).toBe(
      'vscode-webview://cover',
    );
    expect(JSON.stringify(projection.tokens[0]?.refs)).not.toContain('vscode-webview://cover');
  });

  it('renders missing resource tokens as text with diagnostics', () => {
    renderMarkdown(
      [
        '| shot id | source | duration | visual |',
        '| --- | --- | --- | --- |',
        '| 001 | missing | 4s | Frame |',
      ].join('\n'),
      false,
      {
        status: 'diagnostic',
        diagnostics: [
          {
            code: 'missing-resource-token',
            severity: 'error',
            token: 'missing',
            message: 'Markdown resource token "missing" does not match a known resource.',
          },
        ],
        tokens: [
          {
            token: 'missing',
            status: 'missing',
            refs: [],
            resources: [],
            renderUris: [],
            diagnostics: [
              {
                code: 'missing-resource-token',
                severity: 'error',
                token: 'missing',
                message: 'Markdown resource token "missing" does not match a known resource.',
              },
            ],
          },
        ],
      },
    );

    expect(screen.getAllByText('missing').length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText('缺失', { selector: '[data-markdown-resource-status="missing"]' }),
    ).toBeTruthy();
    expect(screen.getAllByText(/未匹配到已知资源/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('-')).toBeNull();
  });

  it('shows blocking resource diagnostics near the rendered markdown', () => {
    renderMarkdown(
      ['| shot id | duration | visual |', '| --- | --- | --- |', '| 001 | maybe | |'].join('\n'),
      false,
      {
        status: 'diagnostic',
        tokens: [],
        diagnostics: [
          {
            code: 'missing-resource-token',
            severity: 'error',
            token: 'page_1',
            message: 'Markdown resource token "page_1" does not match a known resource.',
          },
        ],
      },
    );

    expect(screen.getByRole('alert').textContent).toContain('page_1');
  });

  it('renders CommonMark image references through projected resources only', () => {
    renderMarkdown('![cover](assets/cover.png)', false, {
      status: 'ready',
      diagnostics: [],
      tokens: [
        {
          token: 'assets/cover.png',
          status: 'bound',
          refs: [{ label: 'cover.png', role: 'source' }],
          resources: [
            {
              token: 'assets/cover.png',
              label: 'cover.png',
              role: 'source',
              sourcePath: 'assets/cover.png',
            },
          ],
          renderUris: ['vscode-webview://cover'],
          diagnostics: [],
        },
      ],
    });

    expect(screen.getByAltText('cover.png').getAttribute('src')).toBe('vscode-webview://cover');
    expect(screen.queryByText('assets/cover.png')).toBeNull();
  });

  it('renders CommonMark image panel hints through the base resource token', () => {
    renderMarkdown('![panel](P1#panel_1)', false, {
      status: 'ready',
      diagnostics: [],
      tokens: [
        {
          token: 'P1',
          status: 'bound',
          refs: [{ label: 'Page 1', role: 'source' }],
          resources: [{ token: 'P1', label: 'Page 1', role: 'source', sourcePath: 'P1' }],
          renderUris: ['vscode-webview://page-1'],
          diagnostics: [],
        },
      ],
    });

    expect(screen.getByAltText('Page 1').getAttribute('src')).toBe('vscode-webview://page-1');
    expect(screen.queryByText('P1#panel_1')).toBeNull();
  });

  it('localizes ambiguous resource status labels and diagnostics', () => {
    renderMarkdown(
      [
        '| scene | shot | source | visual |',
        '| --- | --- | --- | --- |',
        '| Opening | 1 | P1 | Frame |',
      ].join('\n'),
      false,
      {
        status: 'diagnostic',
        diagnostics: [
          {
            code: 'ambiguous-resource-token',
            severity: 'error',
            token: 'P1',
            message: 'Markdown resource token "P1" matches multiple resources.',
            candidates: [{ label: 'Page 1' }, { label: 'Page 1 duplicate' }],
          },
        ],
        tokens: [
          {
            token: 'P1',
            status: 'ambiguous',
            refs: [{ label: 'Page 1' }, { label: 'Page 1 duplicate' }],
            resources: [],
            renderUris: [],
            diagnostics: [
              {
                code: 'ambiguous-resource-token',
                severity: 'error',
                token: 'P1',
                message: 'Markdown resource token "P1" matches multiple resources.',
                candidates: [{ label: 'Page 1' }, { label: 'Page 1 duplicate' }],
              },
            ],
          },
        ],
      },
    );

    expect(screen.getByText('2 个候选')).toBeTruthy();
    expect(
      screen.getAllByText('Markdown 资源标记 "P1" 匹配到多个资源。').length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/matches multiple resources/)).toBeNull();
  });

  it('renders missing resource context diagnostics distinctly', () => {
    renderMarkdown(
      [
        '| scene | shot | source | visual |',
        '| --- | --- | --- | --- |',
        '| Opening | 1 | P1 | Frame |',
      ].join('\n'),
      false,
      {
        status: 'diagnostic',
        diagnostics: [
          {
            code: 'missing-resource-context',
            severity: 'error',
            token: 'P1',
            message:
              'Markdown resource token "P1" cannot be resolved because this message has no image resource context.',
          },
        ],
        tokens: [
          {
            token: 'P1',
            status: 'missing',
            refs: [],
            resources: [],
            renderUris: [],
            diagnostics: [
              {
                code: 'missing-resource-context',
                severity: 'error',
                token: 'P1',
                message:
                  'Markdown resource token "P1" cannot be resolved because this message has no image resource context.',
              },
            ],
          },
        ],
      },
    );

    expect(screen.getByRole('alert').textContent).toContain('没有图像资源上下文');
  });

  it('shows unsupported-extension diagnostics for Neko resource-reference embeds', () => {
    renderMarkdown('![[cover.png]]', false, {
      status: 'ready',
      tokens: [],
      diagnostics: [
        {
          severity: 'warning',
          code: 'MD_RESOURCE_REFERENCE_UNSUPPORTED',
          token: 'cover.png',
          message:
            'Neko resource-reference embeds and links need host resource projection for this message.',
        },
      ],
    });

    expect(screen.getByRole('note').textContent).toContain('宿主提供资源投影');
  });

  it('renders read-only semantic prompt span chips with Canvas handoff metadata', () => {
    const { container } = renderMarkdown('Alley at night. Rin enters.', false, {
      status: 'ready',
      tokens: [],
      diagnostics: [],
      promptSpans: [
        {
          kind: 'scene',
          range: { startOffset: 0, endOffset: 14 },
          fieldId: 'scene.location',
          label: 'Alley',
          tone: 'scene',
          tooltip: 'Scene location span',
          ref: { kind: 'canvas-node', id: 'scene-1', namespace: 'canvas' },
        },
      ],
    });

    expect(screen.getByText('Alley at night. Rin enters.')).toBeTruthy();
    const chip = container.querySelector('[data-markdown-prompt-span="true"]');
    expect(chip?.textContent).toContain('Alley');
    expect(chip?.textContent).toContain('scene.location');
    expect(chip?.textContent).toContain('@scene-1');
    expect(chip?.className).toContain('border-b-2');
    expect(chip?.getAttribute('data-markdown-prompt-span-kind')).toBe('scene');
    expect(chip?.getAttribute('data-markdown-prompt-span-field-id')).toBe('scene.location');
    expect(chip?.getAttribute('data-markdown-prompt-span-range')).toBe('0:14');
    expect(chip?.getAttribute('data-canvas-handoff-ref-kind')).toBe('canvas-node');
    expect(chip?.getAttribute('data-canvas-handoff-ref-id')).toBe('scene-1');
    expect(chip?.getAttribute('title')).toContain('Scene location span');
    expect(chip?.getAttribute('title')).toContain('source: Alley at night');
  });

  it('renders semantic prompt span diagnostics without routing through resource fallback copy', () => {
    renderMarkdown('Use @Rin in the voice prompt.', false, {
      status: 'diagnostic',
      tokens: [],
      promptSpans: [],
      diagnostics: [
        {
          severity: 'warning',
          code: 'prompt-span-unresolved-ref',
          token: '@Rin',
          message: 'Prompt span @Rin does not resolve to a stable ref.',
        },
      ],
    });

    expect(screen.getByRole('note').textContent).toContain(
      'Prompt span @Rin does not resolve to a stable ref.',
    );
    expect(screen.queryByText(/Markdown 资源标记/)).toBeNull();
  });

  it('renders inline mentions as Markdown reference tokens', () => {
    const { container } = renderMarkdown('Use @Aki as the character reference.', false, {
      status: 'ready',
      tokens: [],
      diagnostics: [],
      mentions: [
        {
          raw: '@Aki',
          label: 'Aki',
          status: 'bound',
          ref: { kind: 'character', id: 'character-aki' },
          candidates: [],
          range: { startOffset: 4, endOffset: 8 },
        },
      ],
    });

    const mention = container.querySelector('[data-markdown-mention="true"]');
    expect(mention?.textContent).toBe('@Aki');
    expect(mention?.getAttribute('data-markdown-mention-status')).toBe('bound');
    expect(mention?.getAttribute('title')).toBe('character:character-aki');
  });

  it('renders Neko resource-reference embeds through projected Markdown resources', () => {
    renderMarkdown('Use ![[cover.png#panel_1]] as the first frame.', false, {
      status: 'ready',
      tokens: [
        {
          token: 'cover.png',
          status: 'bound',
          refs: [{ label: 'cover.png', role: 'source' }],
          resources: [
            {
              token: 'cover.png',
              label: 'cover.png',
              role: 'source',
              sourcePath: 'cover.png',
            },
          ],
          renderUris: ['vscode-webview://cover'],
          diagnostics: [],
        },
      ],
      resourceReferences: [
        {
          raw: '![[cover.png#panel_1]]',
          target: 'cover.png#panel_1',
          lookupToken: 'cover.png',
          embed: true,
          status: 'bound',
          ref: { kind: 'asset', id: 'asset-cover' },
          candidates: [],
          placementHint: 'panel_1',
          range: { startOffset: 4, endOffset: 26 },
        },
      ],
      diagnostics: [],
    });

    expect(screen.getByAltText('cover.png').getAttribute('src')).toBe('vscode-webview://cover');
    expect(screen.queryByText('![[cover.png#panel_1]]')).toBeNull();
  });

  it('renders Neko resource-reference links as inline reference tokens', () => {
    const { container } = renderMarkdown('Read [[script.md#Scene 2]] before editing.', false, {
      status: 'ready',
      tokens: [],
      resourceReferences: [
        {
          raw: '[[script.md#Scene 2]]',
          target: 'script.md#Scene 2',
          lookupToken: 'script.md',
          embed: false,
          status: 'bound',
          ref: { kind: 'file', id: 'script.md' },
          candidates: [],
          placementHint: 'Scene 2',
          range: { startOffset: 5, endOffset: 26 },
        },
      ],
      diagnostics: [],
    });

    const reference = container.querySelector('[data-markdown-resource-reference="true"]');
    expect(reference?.textContent).toBe('[[script.md#Scene 2]]');
    expect(reference?.getAttribute('data-markdown-resource-reference-status')).toBe('bound');
    expect(reference?.getAttribute('title')).toBe('file:script.md');
  });
});

let timelineFixtureSequence = 0;

function createTimelineMarkdownSession(content: string): string {
  timelineFixtureSequence += 1;
  const suffix = String(timelineFixtureSequence);
  const conversationId = `conv-render-${suffix}`;
  const messageId = `message-render-${suffix}`;
  const itemId = `text-render-${suffix}`;
  const sessionKey = createAgentMarkdownSessionKey({ conversationId, messageId, itemId });
  const patch: ConversationProjectionPatch = {
    type: 'conversationProjectionPatch',
    conversationId,
    turnId: `turn-render-${suffix}`,
    messageId,
    projectionVersion: 1,
    baseProjectionVersion: 0,
    operations: [
      {
        operation: 'append',
        item: {
          conversationId,
          turnId: `turn-render-${suffix}`,
          messageId,
          itemId,
          sequence: 1,
          itemRevision: 1,
          kind: 'assistant_text',
          status: 'streaming',
          payload: { content, format: 'markdown', sourceGeneration: 1 },
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ],
  };
  getAgentMarkdownSessionRegistry().commitProjectionPatch(patch).publish();
  return sessionKey;
}

function renderMarkdown(
  content: string,
  isStreaming = false,
  markdownResources?: MarkdownResourceRenderingProjection,
) {
  registerDefaultRenderers();
  const sessionKey = isStreaming
    ? createTimelineMarkdownSession(content)
    : `test-render:${content.length}:final`;
  return render(
    <MarkdownRenderer
      content={content}
      isStreaming={isStreaming}
      markdownResources={markdownResources}
      sessionKey={sessionKey}
    />,
  );
}
