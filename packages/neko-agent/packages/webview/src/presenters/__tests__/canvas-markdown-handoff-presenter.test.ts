import { describe, expect, it } from 'vitest';
import { projectCanvasMarkdownHandoffRequest } from '../canvas-markdown-handoff-presenter';
import {
  projectMarkdownResourceRendering,
  type MarkdownResourceRenderingProjection,
} from '../markdown-resource-rendering-presenter';

describe('canvas markdown handoff presenter', () => {
  it('projects storyboard creative tables to an Agent handoff request without choosing a Canvas capability', () => {
    const projection = projectCanvasMarkdownHandoffRequest({
      markdown: createStoryboardCreativeTable(),
      markdownResources: createResourceProjection(),
      target: { plugin: 'canvas', nodeId: 'board-1', mode: 'append' },
      provenance: {
        source: 'webview',
        label: 'assistant-markdown-block',
        metadata: { renderUri: 'vscode-webview://must-not-leak' },
      },
      title: 'Storyboard Review',
      declaredIntentHint: 'creative-table',
      declaredProfileHint: 'storyboard',
    });

    expect(projection).toEqual(
      expect.objectContaining({
        sourceFormat: 'gfm-table',
        title: 'Storyboard Review',
        target: { nodeId: 'board-1', mode: 'append' },
        provenance: { source: 'webview', label: 'assistant-markdown-block' },
        declaredIntentHint: 'creative-table',
        declaredProfileHint: 'storyboard',
        resources: [
          {
            token: 'P1',
            label: 'Panel 1',
            role: 'source',
            sourcePath: '${PROJECT}/assets/panel-1.png',
          },
        ],
      }),
    );
    expect(JSON.stringify(projection)).not.toContain('capabilityId');
    expect(JSON.stringify(projection)).not.toContain('vscode-webview://must-not-leak');
  });

  it('projects GFM tables without choosing a Canvas capability or profile', () => {
    const projection = projectCanvasMarkdownHandoffRequest({
      markdown: createStoryboardCreativeTable(),
      title: 'Review Table',
    });

    expect(projection).toEqual(
      expect.objectContaining({
        sourceFormat: 'gfm-table',
        title: 'Review Table',
      }),
    );
    expect(JSON.stringify(projection)).not.toContain('canvas.ingestMarkdown');
    expect(projection?.declaredIntentHint).toBeUndefined();
    expect(projection?.declaredProfileHint).toBeUndefined();
  });

  it('does not expose Canvas handoff for plain Markdown prose', () => {
    expect(
      projectCanvasMarkdownHandoffRequest({
        markdown: '# Plan\n\n- Review panels\n- Create draft',
      }),
    ).toBeNull();
  });

  it('does not expose Canvas handoff for header-only storyboard tables', () => {
    expect(
      projectCanvasMarkdownHandoffRequest({
        markdown: [
          '视觉分析未完成，当前不能可靠生成分镜表。',
          '',
          '| 场景 | 镜头 | 来源 | 图像提示词 | 视频提示词 | 时长 | 对白 |',
          '| --- | --- | --- | --- | --- | --- | --- |',
        ].join('\n'),
        declaredIntentHint: 'creative-table',
        declaredProfileHint: 'storyboard',
      }),
    ).toBeNull();
  });

  it('does not expose Canvas handoff for resource metadata inventory tables', () => {
    expect(
      projectCanvasMarkdownHandoffRequest({
        markdown: [
          '当前只拿到了图片资源 metadata，不能可靠生成分镜表。',
          '',
          '| page | assetId | 尺寸 |',
          '| --- | --- | --- |',
          '| P01 | read-image-p01-cover | 1511x2160 |',
          '| P02 | read-image-p02 | 1365x1920 |',
        ].join('\n'),
      }),
    ).toBeNull();
  });

  it('hands any GFM table to Agent without requiring storyboard canonical headers', () => {
    const projection = projectCanvasMarkdownHandoffRequest({
      markdown: ['| 场景 | 镜头 |', '| --- | --- |', '| 正文 | 1 |'].join('\n'),
      declaredIntentHint: 'creative-table',
      declaredProfileHint: 'storyboard',
    });

    expect(projection).toEqual(
      expect.objectContaining({
        sourceFormat: 'gfm-table',
        declaredIntentHint: 'creative-table',
        declaredProfileHint: 'storyboard',
      }),
    );
    expect(JSON.stringify(projection)).not.toContain('capabilityId');
  });

  it('hands simplified display tables to Agent instead of applying Webview storyboard gates', () => {
    const projection = projectCanvasMarkdownHandoffRequest({
      markdown: ['| 镜头 | 画面 |', '| --- | --- |', '| 1 | 角色进入森林 |'].join('\n'),
      declaredIntentHint: 'creative-table',
      declaredProfileHint: 'storyboard',
    });

    expect(projection).toEqual(
      expect.objectContaining({
        sourceFormat: 'gfm-table',
        declaredIntentHint: 'creative-table',
        declaredProfileHint: 'storyboard',
      }),
    );
  });

  it('does not expose Canvas handoff for tables inside fenced code blocks', () => {
    expect(
      projectCanvasMarkdownHandoffRequest({
        markdown: [
          '```markdown',
          '| scene | shot | source | visual |',
          '| --- | --- | --- | --- |',
          '| Opening | 1 | P1 | Wide shot |',
          '```',
        ].join('\n'),
      }),
    ).toBeNull();
  });

  it('allows extension columns after the required storyboard creative fields are present', () => {
    const projection = projectCanvasMarkdownHandoffRequest({
      markdown: createStoryboardCreativeTable({ extraHeaders: ['customAction'] }),
    });

    expect(projection).toEqual(
      expect.objectContaining({
        sourceFormat: 'gfm-table',
      }),
    );
    expect(projection?.declaredIntentHint).toBeUndefined();
    expect(projection?.declaredProfileHint).toBeUndefined();
  });

  it('preserves provider extension columns without splitting prompt field contracts', () => {
    const markdown = [
      '| scene | shot | imagePrompt | videoPrompt | model |',
      '| --- | --- | --- | --- | --- |',
      '| S1 | 1 | generate keyframe; edit shadows if source is provided | generate slow push in | seedance-2-5 |',
    ].join('\n');
    const projection = projectCanvasMarkdownHandoffRequest({
      markdown,
      declaredIntentHint: 'creative-table',
      declaredProfileHint: 'storyboard',
    });

    expect(projection).toEqual(
      expect.objectContaining({
        markdown,
        sourceFormat: 'gfm-table',
        declaredIntentHint: 'creative-table',
        declaredProfileHint: 'storyboard',
      }),
    );
    expect(projection?.markdown).toContain('model');
    expect(projection?.markdown).toContain('seedance-2-5');
  });

  it('does not hand runtime-only resource refs to Canvas', () => {
    const projection = projectCanvasMarkdownHandoffRequest({
      markdown: createStoryboardCreativeTable(),
      markdownResources: {
        status: 'ready',
        diagnostics: [],
        tokens: [
          {
            token: 'P1',
            status: 'bound',
            refs: [{ token: 'P1', label: 'Panel 1', role: 'source' }],
            resources: [
              {
                token: 'vscode-webview://panel/image.png',
                label: 'Runtime Webview Preview',
                role: 'source',
                sourcePath: 'vscode-webview://panel/image.png',
              },
              {
                token: 'blob:vscode/preview',
                label: 'Runtime Blob Preview',
                role: 'source',
                sourcePath: 'blob:vscode/preview',
              },
              {
                token: 'P1',
                label: 'Stable Panel',
                role: 'source',
                sourcePath: '${PROJECT}/assets/panel-1.png',
              },
            ],
            renderUris: ['vscode-webview://panel/image.png'],
            diagnostics: [],
          },
        ],
      },
    });

    expect(projection?.resources).toEqual([
      {
        token: 'P1',
        label: 'Stable Panel',
        role: 'source',
        sourcePath: '${PROJECT}/assets/panel-1.png',
      },
    ]);
    expect(JSON.stringify(projection)).not.toContain('vscode-webview://panel/image.png');
    expect(JSON.stringify(projection)).not.toContain('blob:vscode/preview');
  });

  it('projects Markdown stable refs, prompt spans, and diagnostics into handoff metadata', () => {
    const projection = projectCanvasMarkdownHandoffRequest({
      markdown: createStoryboardCreativeTable(),
      markdownResources: {
        status: 'diagnostic',
        tokens: [],
        mentions: [
          {
            raw: '@Rin',
            label: 'Rin',
            status: 'bound',
            ref: { kind: 'character', id: 'character-rin', namespace: 'entity' },
            candidates: [],
            range: { startOffset: 0, endOffset: 4 },
          },
        ],
        promptSpans: [
          {
            kind: 'character',
            range: { startOffset: 0, endOffset: 4 },
            fieldId: 'character.ref',
            label: 'Rin',
            ref: { kind: 'character', id: 'character-rin', namespace: 'entity' },
            tone: 'character',
            tooltip: 'Character reference',
          },
        ],
        diagnostics: [
          {
            severity: 'warning',
            code: 'prompt-span-needs-review',
            message: 'Prompt span needs review.',
            token: '@Rin',
            range: { startOffset: 0, endOffset: 4 },
          },
        ],
      },
    });

    expect(projection).toEqual(
      expect.objectContaining({
        stableRefs: [
          {
            kind: 'character',
            id: 'character-rin',
            namespace: 'entity',
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
            tone: 'character',
            tooltip: 'Character reference',
          },
        ],
        diagnostics: [
          {
            severity: 'warning',
            code: 'prompt-span-needs-review',
            message: 'Prompt span needs review.',
            token: '@Rin',
            range: { start: 0, end: 4 },
          },
        ],
      }),
    );
  });

  it('keeps @neko/markdown projection data as handoff metadata instead of Canvas mutation authority', () => {
    const markdown = [
      '| scene | shot | character | voice | imagePrompt | unknown review field |',
      '| --- | --- | --- | --- | --- | --- |',
      '| Opening | 1 | @Rin | whisper | quiet corridor | keep as note |',
    ].join('\n');
    const markdownResources = projectMarkdownResourceRendering({
      markdown,
      mentionItems: [{ id: 'character-rin', kind: 'character', label: 'Rin' }],
      promptSpans: [
        {
          kind: 'character',
          range: {
            startOffset: markdown.indexOf('@Rin'),
            endOffset: markdown.indexOf('@Rin') + 4,
          },
          fieldId: 'character.ref',
          label: 'Rin',
          ref: { kind: 'character', id: 'character-rin', namespace: 'entity' },
          tone: 'character',
        },
        {
          kind: 'voice',
          range: {
            startOffset: markdown.indexOf('whisper'),
            endOffset: markdown.indexOf('whisper') + 7,
          },
          fieldId: 'voice.cue',
          label: 'whisper',
          tone: 'voice',
        },
      ],
    });

    const handoff = projectCanvasMarkdownHandoffRequest({
      markdown,
      markdownResources,
      declaredIntentHint: 'creative-table',
      declaredProfileHint: 'storyboard',
    });

    expect(handoff).toEqual(
      expect.objectContaining({
        markdown,
        sourceFormat: 'gfm-table',
        stableRefs: [
          expect.objectContaining({
            kind: 'character',
            id: 'character-rin',
            token: '@Rin',
          }),
        ],
        promptSpans: [
          expect.objectContaining({
            kind: 'character',
            fieldId: 'character.ref',
            label: 'Rin',
          }),
          expect.objectContaining({
            kind: 'voice',
            fieldId: 'voice.cue',
            label: 'whisper',
          }),
        ],
        declaredIntentHint: 'creative-table',
        declaredProfileHint: 'storyboard',
      }),
    );
    expect(handoff).not.toHaveProperty('capabilityId');
    expect(handoff).not.toHaveProperty('input');
    expect(handoff).not.toHaveProperty('profileHint');
    expect(handoff).not.toHaveProperty('intentHint');
    expect(handoff).not.toHaveProperty('fields');
    expect(handoff).not.toHaveProperty('fieldValues');
    expect(JSON.stringify(handoff)).not.toContain('canvas.ingestMarkdown');
    expect(JSON.stringify(handoff)).not.toContain('canvas.createStoryboardFromMarkdown');
    expect(JSON.stringify(handoff)).not.toContain('canvas_create_node');
  });

  it('projects localized Chinese storyboard creative tables', () => {
    const projection = projectCanvasMarkdownHandoffRequest({
      markdown: [
        '| 场景 | 镜头 | 来源 | 来源分格 | 决策 | 时长 | 画面 | 运镜 | 音频 | 人物 | 对白 | 提示词 | 审阅状态 | 建议操作 | 内容类型 | 决策理由 | 需要拆分 | 重复来源 |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| 正文 | 1 | P1 | 整页 | keep | 3s | 主角出现 | 推近 | 低风声 | 主角 |  | 暗黑童话风格 | needs-review | use-as-reference | story | 有叙事价值 | false |  |',
      ].join('\n'),
    });

    expect(projection).toEqual(
      expect.objectContaining({
        sourceFormat: 'gfm-table',
      }),
    );
    expect(projection?.declaredIntentHint).toBeUndefined();
    expect(projection?.declaredProfileHint).toBeUndefined();
  });

  it('infers storyboard handoff from minimum profile fields and dynamic review columns', () => {
    const result = projectCanvasMarkdownHandoffRequest({
      markdown: [
        '| 场景 | 镜头 | 来源 | 画面 | 图像提示词 | 自定义审阅 |',
        '| --- | --- | --- | --- | --- | --- |',
        '| 开场 | 1 | P1 | 巨构空间 | 黑白关键帧 | OCR uncertain |',
      ].join('\n'),
    });

    expect(result).toMatchObject({
      sourceFormat: 'gfm-table',
    });
    expect(result?.declaredIntentHint).toBeUndefined();
    expect(result?.declaredProfileHint).toBeUndefined();
  });

  it('hands video prompt fields to Agent without inferring storyboard profile', () => {
    const result = projectCanvasMarkdownHandoffRequest({
      markdown: [
        '| scene | shot | visual | videoPrompt |',
        '| --- | --- | --- | --- |',
        '| Opening | 1 | Character crosses a huge corridor | 30s continuous lonely exploration |',
      ].join('\n'),
    });

    expect(result).toMatchObject({
      sourceFormat: 'gfm-table',
    });
    expect(result?.declaredProfileHint).toBeUndefined();
  });
});

function createStoryboardCreativeTable(options?: {
  readonly extraHeaders?: readonly string[];
}): string {
  const headers = ['scene', 'shot', 'source', 'visual', ...(options?.extraHeaders ?? [])];
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    `| ${headers.map((header) => storyboardCreativeTableValue(header)).join(' | ')} |`,
  ].join('\n');
}

function storyboardCreativeTableValue(header: string): string {
  const values: Record<string, string> = {
    scene: 'Opening',
    shot: '1',
    source: 'P1',
    visual: 'wide shot',
    customAction: 'prepare-keyframe',
  };
  return values[header] ?? '';
}

function createResourceProjection(): MarkdownResourceRenderingProjection {
  return {
    status: 'ready',
    diagnostics: [],
    tokens: [
      {
        token: 'P1',
        status: 'bound',
        refs: [{ token: 'P1', label: 'Panel 1', role: 'source' }],
        resources: [
          {
            token: 'P1',
            label: 'Panel 1',
            role: 'source',
            sourcePath: '${PROJECT}/assets/panel-1.png',
          },
        ],
        renderUris: ['vscode-webview://panel-1'],
        diagnostics: [],
      },
    ],
  };
}
