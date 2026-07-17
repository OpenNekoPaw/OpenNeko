import { describe, expect, it, vi } from 'vitest';

const testL10nMessages = vi.hoisted((): Record<string, string> => ({
  'neko.canvas.preview.title': '画布预览',
  'neko.canvas.preview.statusWaitingGraph': '等待画布图数据...',
  'neko.canvas.preview.ariaStage': '画布播放舞台',
  'neko.canvas.preview.ariaStageOverlay': '播放舞台叠层',
  'neko.canvas.preview.ariaPlaybackDetails': '播放详情',
  'neko.canvas.preview.ariaDetails': '播放详情',
  'neko.canvas.preview.ariaControls': '播放控制',
  'neko.canvas.preview.ariaTimeline': '播放时间线',
  'neko.canvas.preview.defaultUnitLabel': '单元',
  'neko.canvas.preview.planCanvasPlayback': '画布播放',
  'neko.canvas.preview.info': '信息',
  'neko.canvas.preview.route': '路线',
  'neko.canvas.preview.routeTitle': '{title} · {sourceKind} · {count} 单元',
  'neko.canvas.preview.missingRouteCandidates': '播放计划没有路线候选。',
  'neko.canvas.preview.missingRouteEntry': '播放计划没有可播放路线入口。',
  'neko.canvas.preview.invalidRoute': '播放路线候选无效。',
  'neko.canvas.preview.routeTruncated': '部分播放路线因超过预览上限而隐藏。',
  'neko.canvas.preview.branches': '分支',
  'neko.canvas.preview.diagnostics': '诊断',
  'neko.canvas.preview.staleSession': '源画布已关闭',
  'neko.canvas.preview.staleSessionDescription': '预览仍可见，但源画布编辑器已经关闭。',
  'neko.canvas.preview.noUnitSelected': '未选择播放单元',
  'neko.canvas.preview.close': '关闭',
  'neko.canvas.preview.stageZero': '阶段 0',
  'neko.canvas.preview.previous': '上一个',
  'neko.canvas.preview.previousShort': '上一个',
  'neko.canvas.preview.play': '播放',
  'neko.canvas.preview.pause': '暂停',
  'neko.canvas.preview.next': '下一个',
  'neko.canvas.preview.summaryWaitingPlan': '等待画布播放计划...',
  'neko.canvas.preview.statusLoadedZeroRuntime': '已加载修订 {revision}，包含 0 个叙事运行时节点。',
  'neko.canvas.preview.statusLoadedRuntime': '已加载修订 {revision}，包含 {count} 个运行时节点。',
  'neko.canvas.preview.statusLoadedPlaybackPlan':
    '已加载画布播放计划（{adapterId}, {behaviorMode}），包含 {count} 个单元{kindList}。',
  'neko.canvas.preview.statusDiagnostics': ' 诊断：{diagnostics}',
  'neko.canvas.preview.statusJumpRequest': '跳转请求：{nodeId}，修订 {revision}。',
  'neko.canvas.preview.stagePosition': '阶段 {index} / {total}',
  'neko.canvas.preview.noPlayableUnit': '没有可播放单元',
  'neko.canvas.preview.noPlayableUnitDescription': '当前画布预览面没有生成可播放单元。',
  'neko.canvas.preview.mediaUnavailable': '媒体不可用',
  'neko.canvas.preview.mediaUnavailableDescription':
    '存在稳定的媒体引用，但当前播放器壳层还没有可用的运行时预览 URL。',
  'neko.canvas.preview.mediaLoading': '正在加载媒体流...',
  'neko.canvas.preview.mediaPreparing': '正在准备媒体流...',
  'neko.canvas.preview.mediaProbeTimeout': '媒体探测超时，请检查源文件是否仍可访问。',
  'neko.canvas.preview.mediaStreamTimeout': '媒体流创建超时，请检查媒体引擎连接。',
  'neko.canvas.preview.storyboardShot': '分镜镜头',
  'neko.canvas.preview.storyboardShotUnavailableDescription':
    '该镜头还没有生成图片或安全的预览来源。',
  'neko.canvas.preview.storyboardScene': '分镜场景',
  'neko.canvas.preview.storyboardSceneDescription': '场景播放由有序镜头或场景元数据表示。',
  'neko.canvas.preview.canvasNode': '画布节点',
  'neko.canvas.preview.canvasNodeDescription': '该单元以画布摘要展示，并会在源编辑器中高亮。',
  'neko.canvas.preview.playbackPreviewAlt': '播放预览',
  'neko.canvas.preview.labelMode': '模式',
  'neko.canvas.preview.labelDuration': '时长',
  'neko.canvas.preview.labelAsset': '素材',
  'neko.canvas.preview.labelShot': '镜头',
  'neko.canvas.preview.labelScale': '景别',
  'neko.canvas.preview.labelAction': '动作',
  'neko.canvas.preview.labelDialogue': '对白',
  'neko.canvas.preview.labelScene': '场景',
  'neko.canvas.preview.labelLocation': '地点',
  'neko.canvas.preview.labelTime': '时间',
  'neko.canvas.preview.labelMedia': '媒体',
  'neko.canvas.preview.labelMime': 'MIME',
  'neko.canvas.preview.labelSourceNode': '源节点',
  'neko.canvas.preview.labelRenderMode': '渲染模式',
  'neko.canvas.preview.labelResource': '资源',
  'neko.canvas.preview.labelCamera': '镜头运动',
  'neko.canvas.preview.labelAngle': '机位角度',
  'neko.canvas.preview.labelVoice': '旁白',
  'neko.canvas.preview.labelSound': '声音',
  'neko.canvas.preview.labelStatus': '状态',
  'neko.canvas.preview.labelCharacters': '角色',
  'neko.canvas.preview.labelMediaRefs': '媒体引用',
  'neko.canvas.preview.labelPreviewSource': '预览来源',
  'neko.canvas.preview.previewSourceGeneratedImage': '生成图片',
  'neko.canvas.preview.previewSourceGeneratedMedia': '生成媒体',
  'neko.canvas.preview.previewSourceReferenceImage': '引用图片',
  'neko.canvas.preview.previewSourceSourceMedia': '来源媒体',
  'neko.canvas.preview.previewSourceMediaAsset': '媒体素材',
  'neko.canvas.preview.labelImageAsset': '图片素材',
  'neko.canvas.preview.labelVideoAsset': '视频素材',
  'neko.canvas.preview.labelScript': '剧本',
  'neko.canvas.preview.labelMediaType': '媒体类型',
  'neko.canvas.preview.labelAssetPath': '素材路径',
  'neko.canvas.preview.labelDocument': '文档',
  'neko.canvas.preview.labelProject': '项目',
  'neko.canvas.preview.labelScenes': '场景',
  'neko.canvas.preview.noBranches': '没有分支',
  'neko.canvas.preview.noDiagnostics': '没有诊断',
  'neko.canvas.preview.planStoryboardPreview': '分镜预览',
  'neko.canvas.preview.planMediaSequencePreview': '媒体序列预览',
  'neko.canvas.preview.planNarrativePlaybackPlan': '叙事播放计划',
  'neko.canvas.preview.shotTitle': '镜头 {shotNumber}',
  'neko.canvas.preview.defaultUnitTitle': '{kind} {index}',
  'neko.canvas.preview.defaultShotBody': '分镜镜头播放单元。',
  'neko.canvas.preview.defaultSceneBody': '分镜场景播放单元。',
  'neko.canvas.preview.bodyMediaSource': '媒体来源：{source}',
  'neko.canvas.preview.defaultMediaBody': '媒体播放单元。运行时来源会由宿主解析。',
  'neko.canvas.preview.defaultNarrativeBody': '叙事运行时单元。',
  'neko.canvas.preview.defaultContainerBody': '容器播放单元。',
  'neko.canvas.preview.defaultGenericBody': '通用画布节点播放单元。',
  'neko.canvas.preview.choiceContinueTo': '继续到 {title}',
  'neko.canvas.preview.choiceContinue': '继续',
  'neko.canvas.preview.choiceTransition': '{label} -> {targetUnitId}',
  'neko.canvas.preview.itemCountOne': '{count} 项',
  'neko.canvas.preview.itemCountMany': '{count} 项',
  'neko.canvas.preview.durationSeconds': '{seconds} 秒',
  'neko.canvas.preview.kindNode': '节点',
  'neko.canvas.preview.kindContainer': '容器',
  'neko.canvas.preview.kindMedia': '媒体',
  'neko.canvas.preview.kindShot': '镜头',
  'neko.canvas.preview.kindScene': '场景',
  'neko.canvas.preview.kindNarrative': '叙事',
  'neko.canvas.preview.kindUnit': '单元',
  'neko.canvas.preview.disabledByConfiguration': '画布预览已被配置禁用。',
  'neko.canvas.preview.noActiveGraph': '当前没有可用的画布叙事图。',
}));

vi.mock('vscode', () => ({
  ViewColumn: { Beside: 2 },
  Uri: {
    joinPath: vi.fn((base: { path?: string; toString?: () => string }, ...segments: string[]) => ({
      path: `${base.path ?? base.toString?.() ?? ''}/${segments.join('/')}`,
      toString: () => `${base.path ?? base.toString?.() ?? ''}/${segments.join('/')}`,
    })),
    parse: vi.fn((value: string) => ({
      scheme: value.split(':')[0],
      path: value,
      fsPath: value.replace(/^file:\/\//, ''),
      toString: () => value,
    })),
    file: vi.fn((value: string) => ({
      scheme: 'file',
      path: value,
      fsPath: value,
      toString: () => `file://${value}`,
    })),
  },
  env: {
    language: 'zh-cn',
  },
  l10n: {
    t: vi.fn((key: string) => testL10nMessages[key] ?? key),
  },
  window: {
    createWebviewPanel: vi.fn(),
  },
}));

import {
  createCanvasPlaybackPlanFromCanvasData,
  createNarrativeGraphSnapshotFromCanvasData,
  NarrativePreviewBridge,
  parsePreviewToCanvasMessage,
  type NarrativePreviewPanelFactory,
} from './narrativePreviewBridge';
import type {
  CanvasData,
  CanvasPlaybackPlan,
  NarrativeGraphSnapshot,
  PreviewToCanvasMessage,
} from '@neko/shared';

describe('createNarrativeGraphSnapshotFromCanvasData', () => {
  it('extracts runtime nodes, edges, metadata, variables, scene refs, and character bindings', async () => {
    const canvas = createCanvasData();
    const snapshot = createNarrativeGraphSnapshotFromCanvasData(canvas, {
      revision: 7,
      sourceCanvasUri: 'file:///story/branch.nkc',
    });

    expect(snapshot.revision).toBe(7);
    expect(snapshot.sourceCanvasUri).toBe('file:///story/branch.nkc');
    expect(snapshot.metadata).toEqual({
      entryNodeId: 'start',
      genre: 'visual-novel',
      defaultLocale: 'zh-cn',
      variables: [{ id: 'affection', name: 'Affection', value: 2 }],
    });
    expect(snapshot.nodes.map((node) => node.nodeId)).toEqual([
      'start',
      'scene-a',
      'choice-a',
      'ending-a',
    ]);
    expect(snapshot.nodes.some((node) => node.nodeId === 'note-a')).toBe(false);
    expect(snapshot.nodes.find((node) => node.nodeId === 'scene-a')?.scene).toMatchObject({
      sceneRef: 'scenes/cafe.fountain',
      backgroundRef: { kind: 'relative-path', path: 'assets/bg/cafe.png' },
      characters: ['characters/hero.yaml'],
      variableEffects: [{ variableId: 'affection', operation: 'add', value: 1 }],
      productionRefs: [
        {
          bindingId: 'bind-shot-1',
          role: 'source',
          target: {
            kind: 'storyboard-shot',
            sceneId: 'scene-1',
            shotId: 'scene-1-shot-1',
          },
        },
        {
          bindingId: 'bind-video-1',
          role: 'primary',
          target: {
            kind: 'generated-video',
            ref: {
              kind: 'generated-asset',
              assetId: 'generated-video-1',
              resourceRef: {
                id: 'generated-video-1',
                scope: 'project',
                provider: 'generated',
                kind: 'generated',
                source: {
                  kind: 'generated-asset',
                  generatedAssetId: 'generated-video-1',
                },
                fingerprint: { strategy: 'provider', value: 'generated-video-1' },
              },
            },
          },
        },
      ],
    });
    expect(snapshot.nodes.find((node) => node.nodeId === 'ending-a')?.ending).toEqual({
      endingType: 'good',
      endingLabel: 'Good Ending',
      statisticsSummary: true,
    });
    expect(snapshot.connections).toEqual([
      {
        connectionId: 'c-start-scene',
        sourceNodeId: 'start',
        targetNodeId: 'scene-a',
        type: 'default',
        choiceText: undefined,
        condition: undefined,
        priority: 0,
      },
      {
        connectionId: 'c-scene-choice',
        sourceNodeId: 'scene-a',
        targetNodeId: 'choice-a',
        type: 'choice',
        choiceText: 'Stay',
        condition: 'affection >= 1',
        priority: 2,
      },
      {
        connectionId: 'c-choice-ending',
        sourceNodeId: 'choice-a',
        targetNodeId: 'ending-a',
        type: 'choice',
        choiceText: 'Leave',
        condition: undefined,
        priority: 0,
      },
    ]);
  });
});

describe('NarrativePreviewBridge', () => {
  it('opens, reveals, closes, and reopens a Preview panel without retaining disposed panels', async () => {
    const host = createHost(createSnapshot(1));
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 1000,
    });

    expect(await bridge.open()).toBe(true);
    expect(panelFactory.createdPanels).toHaveLength(1);
    expect(panelFactory.createdPanels[0]?.title).toBe('画布预览');
    expect(panelFactory.createdPanels[0]?.webview.postMessage).not.toHaveBeenCalled();
    expect(panelFactory.createdPanels[0]?.webview.html).toContain(
      "vscode.postMessage({ type: 'preview:webviewReady'",
    );
    expect(readBootstrapMessages(panelFactory.createdPanels[0]?.webview.html ?? '')).toEqual([
      expect.objectContaining({
        type: 'preview:setFeatureToggles',
        requestId: 'canvas-narrative:toggles:1000:1',
        revision: 1,
        toggles: expect.objectContaining({ preview: true }),
      }),
      expect.objectContaining({
        type: 'preview:loadGraph',
        requestId: 'canvas-narrative:load:1000:2',
        revision: 1,
      }),
    ]);
    panelFactory.createdPanels[0]?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready-open',
    });

    expect(await bridge.open()).toBe(true);
    expect(panelFactory.createdPanels).toHaveLength(1);
    expect(panelFactory.createdPanels[0]?.reveal).toHaveBeenCalledTimes(1);
    expect(panelFactory.createdPanels[0]?.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:loadGraph',
        requestId: 'canvas-narrative:load:1000:4',
        revision: 1,
      }),
    );

    panelFactory.createdPanels[0]?.dispose();
    expect(await bridge.open()).toBe(true);
    expect(panelFactory.createdPanels).toHaveLength(2);

    bridge.dispose();
    expect(panelFactory.createdPanels[1]?.dispose).toHaveBeenCalledTimes(1);
  });

  it('posts Canvas playback plan messages alongside narrative graph messages', async () => {
    const plan = createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData());
    const host = createHost(createSnapshot(4), () => plan);
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 3000,
    });

    expect(await bridge.open()).toBe(true);
    const bootstrapMessages = readBootstrapMessages(
      panelFactory.createdPanels[0]?.webview.html ?? '',
    );
    expect(bootstrapMessages).toEqual([
      expect.objectContaining({ type: 'preview:setFeatureToggles', revision: 4 }),
      expect.objectContaining({
        type: 'preview:loadGraph',
        requestId: 'canvas-narrative:load:3000:2',
        revision: 4,
      }),
      expect.objectContaining({
        type: 'preview:loadPlaybackPlan',
        requestId: 'canvas-narrative:load-plan:3000:3',
        revision: 4,
        plan: expect.objectContaining({
          adapterId: 'storyboard',
          units: expect.arrayContaining([
            expect.objectContaining({
              id: 'shot-a1',
              kind: 'shot',
              durationMs: 2000,
              metadata: expect.objectContaining({ visualDescription: 'Opening' }),
            }),
          ]),
        }),
      }),
    ]);
    expect(panelFactory.createdPanels[0]?.webview.postMessage).not.toHaveBeenCalled();
    panelFactory.createdPanels[0]?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready-plan',
    });
    expect(panelFactory.createdPanels[0]?.webview.postMessage).not.toHaveBeenCalled();

    expect(bridge.refresh()).toBe(true);
    await waitForMicrotasks();
    expect(panelFactory.createdPanels[0]?.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:refreshPlaybackPlan',
        requestId: 'canvas-narrative:refresh-plan:3000:6',
        revision: 4,
      }),
    );
  });

  it('embeds initial preview messages into first-open HTML before Webview readiness', async () => {
    const plan = createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData());
    const host = createHost(createSnapshot(6), () => plan);
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 3200,
    });

    expect(await bridge.open()).toBe(true);
    const panel = panelFactory.createdPanels[0];
    expect(readBootstrapMessages(panel?.webview.html ?? '')).toEqual([
      expect.objectContaining({ type: 'preview:setFeatureToggles', revision: 6 }),
      expect.objectContaining({ type: 'preview:loadGraph', revision: 6 }),
      expect.objectContaining({ type: 'preview:loadPlaybackPlan', revision: 6 }),
    ]);

    expect(panel?.webview.postMessage).not.toHaveBeenCalled();
    panel?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready',
    });
    expect(panel?.webview.postMessage).not.toHaveBeenCalled();
  });

  it('falls back to posting the playback plan when the Preview ready message is missed', async () => {
    vi.useFakeTimers();
    try {
      const plan = createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData());
      const host = createHost(createSnapshot(7), () => plan);
      const panelFactory = createPanelFactory();
      const bridge = new NarrativePreviewBridge(host, {
        panelFactory,
        now: () => 3300,
      });

      expect(await bridge.open()).toBe(true);
      const panel = panelFactory.createdPanels[0];
      expect(readBootstrapMessages(panel?.webview.html ?? '')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'preview:loadPlaybackPlan', revision: 7 }),
        ]),
      );
      expect(panel?.webview.postMessage).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(250);

      expect(panel?.webview.postMessage).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves Preview-specific playback plans against the Preview webview', async () => {
    const basePlan = createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData());
    const previewPlan: CanvasPlaybackPlan = {
      ...basePlan,
      units: basePlan.units.map((unit) =>
        unit.id === 'shot-a1'
          ? {
              ...unit,
              metadata: {
                ...(unit.metadata ?? {}),
                previewUrl: 'vscode-webview://preview/shot-a1.png',
              },
            }
          : unit,
      ),
    };
    const host = createHost(
      createSnapshot(7),
      () => basePlan,
      vi.fn(async () => previewPlan),
    );
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 3300,
    });

    expect(await bridge.open()).toBe(true);
    const panel = panelFactory.createdPanels[0];
    expect(readBootstrapMessages(panel?.webview.html ?? '')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'preview:loadPlaybackPlan',
          requestId: 'canvas-narrative:load-preview-plan:3300:3',
          plan: expect.objectContaining({
            units: expect.arrayContaining([
              expect.objectContaining({
                id: 'shot-a1',
                metadata: expect.objectContaining({
                  previewUrl: 'vscode-webview://preview/shot-a1.png',
                }),
              }),
            ]),
          }),
        }),
      ]),
    );

    expect(host.extractCanvasPlaybackPlanForPreview).toHaveBeenCalledWith(
      panel?.webview,
      'file:///story/branch.nkc',
    );
    expect(panel?.webview.postMessage).not.toHaveBeenCalled();
  });

  it('generates Preview-specific plans and resource roots per session webview', async () => {
    const basePlan = createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData());
    let snapshot = createSnapshot(1, 'file:///story/a.nkc');
    const panelFactory = createPanelFactory();
    const previewPlan = vi.fn(async (webview: unknown, sourceCanvasUri?: string) => ({
      ...basePlan,
      metadata: {
        ...(basePlan.metadata ?? {}),
        sourceCanvasName: sourceCanvasUri ?? 'missing',
        webviewTag: webview === panelFactory.createdPanels[0]?.webview ? 'a' : 'b',
      },
    }));
    const host = createHost(
      () => snapshot,
      () => basePlan,
      previewPlan,
    );
    const getWebviewOptions = vi.fn((sourceCanvasUri?: string) => ({
      localResourceRoots: [{ toString: () => `root:${sourceCanvasUri ?? 'none'}` }],
    })) as unknown as (sourceCanvasUri?: string) => Record<string, unknown>;
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      getWebviewOptions,
      now: () => 3310,
    });

    expect(await bridge.open()).toBe(true);
    snapshot = createSnapshot(1, 'file:///story/b.nkc');
    expect(await bridge.open()).toBe(true);

    expect(panelFactory.createdPanels).toHaveLength(2);
    expect(getWebviewOptions).toHaveBeenNthCalledWith(1, 'file:///story/a.nkc');
    expect(getWebviewOptions).toHaveBeenNthCalledWith(2, 'file:///story/b.nkc');
    expect(previewPlan).toHaveBeenNthCalledWith(
      1,
      panelFactory.createdPanels[0]?.webview,
      'file:///story/a.nkc',
    );
    expect(previewPlan).toHaveBeenNthCalledWith(
      2,
      panelFactory.createdPanels[1]?.webview,
      'file:///story/b.nkc',
    );
    expect(
      readBootstrapMessages(panelFactory.createdPanels[0]?.webview.html ?? '').find(
        (message): message is { readonly plan: CanvasPlaybackPlan } =>
          typeof message === 'object' &&
          message !== null &&
          (message as { readonly type?: unknown }).type === 'preview:loadPlaybackPlan',
      )?.plan.metadata,
    ).toMatchObject({ sourceCanvasName: 'file:///story/a.nkc', webviewTag: 'a' });
    expect(
      readBootstrapMessages(panelFactory.createdPanels[1]?.webview.html ?? '').find(
        (message): message is { readonly plan: CanvasPlaybackPlan } =>
          typeof message === 'object' &&
          message !== null &&
          (message as { readonly type?: unknown }).type === 'preview:loadPlaybackPlan',
      )?.plan.metadata,
    ).toMatchObject({ sourceCanvasName: 'file:///story/b.nkc', webviewTag: 'b' });
  });

  it('renders the Canvas playback preview shell instead of a status-only placeholder', async () => {
    const host = createHost(createSnapshot(4), () =>
      createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      getMediaRuntimeScriptUri: () =>
        ({
          toString: () =>
            'file:///extension/dist/webview/assets/narrative-preview-media-runtime.js',
        }) as never,
      now: () => 3100,
    });

    expect(await bridge.open()).toBe(true);
    const html = panelFactory.createdPanels[0]?.webview.html ?? '';

    expect(html).toContain('id="playback-preview"');
    expect(html).toContain('lang="zh-cn" data-vscode-locale="zh-cn"');
    expect(html).toContain('<title>画布预览</title>');
    expect(html).toContain('const I18N = ');
    expect(html).toContain('等待画布图数据...');
    expect(html).toContain('aria-label="画布播放舞台"');
    expect(html).toContain('id="player-stage"');
    expect(html).toContain('id="stage-content"');
    expect(html).toContain('id="stage-visual"');
    expect(html).toContain('id="player-controls"');
    expect(html).toContain('narrative-preview-media-runtime.js');
    expect(html).toContain('id="segmented-timeline"');
    expect(html).toContain('id="route-hint"');
    expect(html).toContain('class="route-hint"');
    expect(html).toContain('class="branch-choices"');
    expect(html).toContain('id="playback-clock"');
    expect(html).toContain('id="playback-inspector"');
    expect(html).toContain('--preview-surface:');
    expect(html).toContain('.player-stage::before');
    expect(html).toContain('.stage-action-icon');
    expect(html).toContain('class="stage-action-icon" viewBox="0 0 24 24"');
    expect(html).toContain('id="inspector-close"');
    expect(html).toContain('M7 7 17 17M17 7 7 17');
    expect(html).toContain('class="stage-nav stage-nav-left"');
    expect(html).toContain('id="stage-previous"');
    expect(html).toContain('class="stage-nav stage-nav-right"');
    expect(html).toContain('id="stage-next"');
    expect(html).toContain('data-mode="next"');
    expect(html).toContain('id="stage-branch-menu"');
    expect(html).toContain('.stage-nav-button[data-mode="branches"]');
    expect(html).toContain('.stage-branch-menu[data-open="true"]');
    expect(html).toContain('.player-controls > .branch-choices:not(:empty)');
    expect(html).toContain('.player-controls > .timeline-wrap');
    expect(html).toContain('.player-controls > .transport-row');
    expect(html).toContain('width: min(1040px, 100%)');
    expect(html).toContain('class="transport-glyph" data-kind="previous"');
    expect(html).toContain('class="transport-glyph" data-kind="play"');
    expect(html).toContain('class="transport-glyph" data-kind="next"');
    expect(html).toContain('id="preview-play-label"');
    expect(html).toContain('data-playing="false"');
    expect(html).toContain(
      "const previewPlayLabel = document.getElementById('preview-play-label')",
    );
    expect(html).toContain("previewPlayLabel.textContent = isPlaying ? t('pause') : t('play')");
    expect(html).toContain("previewPlay.dataset.playing = isPlaying ? 'true' : 'false'");
    expect(html).toContain("stagePrevious.addEventListener('click', () => stepPrevious())");
    expect(html).toContain("stageNext.addEventListener('click'");
    expect(html).toContain('function stepPrevious()');
    expect(html).toContain('function stepNext()');
    expect(html).toContain('function renderStageNavigation(unit, index, diagnostics)');
    expect(html).toContain("stagePrevious.dataset.visible = index > 0 ? 'true' : 'false'");
    expect(html).toContain("stageNext.dataset.mode = hasBranches ? 'branches' : 'next'");
    expect(html).toContain('function groupRouteCandidates(candidates)');
    expect(html).toContain("document.createElement('optgroup')");
    expect(html).toContain(
      "routeHint.dataset.visible = !hasExplicitEntry && hasFallbackFragments ? 'true' : 'false'",
    );
    expect(html).toContain('routeAmbiguousEntryHint');
    expect(html).toContain('routeMainEntryGroup');
    expect(html).toContain('routeCurrentSelectionGroup');
    expect(html).toContain('routeSceneFragmentGroup');
    expect(html).toContain('routeIsolatedFragmentGroup');
    expect(html).toContain("inspectorBranches.dataset.visible = 'false'");
    expect(html).toContain(
      "inspectorDiagnostics.dataset.visible = diagnostics.length > 0 ? 'true' : 'false'",
    );
    expect(html).toContain('function createChoiceButton(choice)');
    expect(html).toContain('function commitChoice(choice)');
    expect(html).toContain('stageBranchMenu.appendChild(createChoiceButton(choice))');
    expect(html).toContain('function toggleStageBranchMenu()');
    expect(html).toContain('function closeStageBranchMenu()');
    expect(html).toContain("document.addEventListener('keydown'");
    expect(html).toContain("event.key !== 'Escape'");
    expect(html).toContain('closeStageBranchMenu();');
    expect(html).toContain('.stage-detail-label');
    expect(html).toContain('.stage-detail-value');
    expect(html).toContain('.meta-label');
    expect(html).toContain('.meta-value');
    expect(html).toContain('@media (prefers-reduced-motion: reduce)');
    expect(html).toContain('id="session-badge"');
    expect(html).toContain('源画布已关闭');
    expect(html).toContain("message.type === 'preview:sessionStale'");
    expect(html).toContain("sessionBadge.dataset.visible = 'true'");
    expect(html).toContain('id="unit-branch-meta"');
    expect(html).toContain('id="unit-meta"');
    expect(html).not.toContain('id="unit-timeline"');
    expect(html).not.toContain('id="stage-progress"');
    expect(html).not.toContain('class="unit-panel"');
    expect(html).not.toContain('class="playback-toolbar"');
    expect(html).toContain('formatUnitBody');
    expect(html).toContain('readStoryboardPromptText(metadata)');
    expect(html).toContain('readPromptDocumentText(blocks.videoPromptDocument)');
    expect(html).not.toContain('readString(metadata.generationPrompt)');
    expect(html).toContain('formatClockTime');
    expect(html).toContain('renderStageContent');
    expect(html.indexOf('renderedStageKey = stageKey;')).toBeLessThan(
      html.indexOf('renderStageContent(unit, index);'),
    );
    expect(html).toContain('renderSegmentedTimeline');
    expect(html).toContain('toggleInspector');
    expect(html).toContain('.neko-preview-media-controls { display: none; }');
    expect(html).toContain("window.addEventListener('neko-preview-media'");
    expect(html).toContain('handlePreviewMediaRuntimeEvent(event)');
    expect(html).toContain("detail.type === 'ended'");
    expect(html).toContain('advanceAfterCurrentUnit()');
    expect(html).toContain('mediaRuntimeDurationsMs.set(unit.id, durationSeconds * 1000)');
    expect(html).toContain('let mediaSurfaceGeneration = 0;');
    expect(html).toContain('const surfaceGeneration = mediaSurfaceGeneration;');
    expect(html).toContain('surfaceGeneration !== mediaSurfaceGeneration');
    expect(html).toContain('!slot.isConnected');
    expect(html).toContain('formatDiagnosticMessage');
    expect(html).toContain('playback-invalid-route');
    expect(html).toContain('playback-route-truncated');
    expect(html).toContain('requestStageImageVariant');
    expect(html).toContain('PREVIEW_VARIANT_TIMEOUT_MS');
    expect(html).toContain('window.setTimeout');
    expect(html).toContain('window.clearTimeout(pending.timeoutId)');
    expect(html).toContain('clearPreviewVariantState');
    expect(html).toContain("type: 'preview:resolveVariant'");
    expect(html).toContain("message.type === 'preview:variantResolved'");
    expect(html).toContain('const directDocumentResourceRef = readDocumentResourceLike(value)');
    expect(html).toContain('readSelectedGenerationPreviewSource');
    expect(html).toContain('metadata.previewPlayableAssetPath');
    expect(html).toContain('previewSourceAssetPath');
    expect(html).toContain('readString(metadata.previewSourceAssetPath)');
    expect(html).toContain('previewSourceResourceRef');
    expect(html).toContain('previewSourceDocumentResourceRef');
    expect(html).toContain('referenceImageResourceRef');
    expect(html).not.toContain('legacyCachePath');
    expect(html).toContain("value.includes('vscode-resource.vscode-cdn.net/')");
    expect(html).toContain('img-src vscode-webview: data: blob: https:');
    expect(html).toContain('media-src vscode-webview: data: blob: https:');
    expect(html).toContain('__nekoNarrativePreviewMediaRuntime');
    expect(html).not.toContain("document.createElement('video')");
    expect(html).not.toContain("document.createElement('audio')");
    expect(html).toContain('canvas:highlightNode');
    expect(html).toContain("vscode.postMessage({ type: 'preview:webviewReady'");
    expect(readPreviewI18n(html)).toMatchObject({
      title: '画布预览',
      planStoryboardPreview: '分镜预览',
      play: '播放',
      route: '路线',
      missingRouteEntry: '播放计划没有可播放路线入口。',
      invalidRoute: '播放路线候选无效。',
      routeTruncated: '部分播放路线因超过预览上限而隐藏。',
      diagnostics: '诊断',
      staleSession: '源画布已关闭',
    });
    expect(html).not.toContain('Storyboard Preview');
  });

  it('keeps Canvas playback decisions in the player shell without mutating persisted data', async () => {
    const host = createHost(createSnapshot(4), () =>
      createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 3150,
    });

    expect(await bridge.open()).toBe(true);
    const html = panelFactory.createdPanels[0]?.webview.html ?? '';

    expect(html).toContain("playbackPlan.advancePolicy !== 'media-ended'");
    expect(html).toContain("playbackPlan?.advancePolicy === 'media-ended'");
    expect(html).toContain("unit.kind === 'media' || unit.renderMode === 'media-playback'");
    expect(html).toContain("playbackPlan.behaviorMode === 'interactive' && transitions.length > 1");
    expect(html).toContain('segment.addEventListener');
    expect(html).toContain('setActiveUnit(unit.id, false, 0)');
    expect(html).toContain('unitChoices.appendChild(createChoiceButton(choice))');
    expect(html).toContain('stageBranchMenu.appendChild(createChoiceButton(choice))');
    expect(html).toContain('canvas:choiceMade');
    expect(html).toContain("playbackInspector.dataset.open = 'true'");
    expect(html).toContain("playbackInspector.dataset.open = 'false'");
    expect(html).toContain('closeStageBranchMenu();');
    expect(html).toContain('inspectorDiagnostics.disabled = activeDiagnostics.length === 0');
    expect(html).toContain('mediaUnavailableDescription');
    expect(html).toContain('存在稳定的媒体引用');
    expect(html).toContain('isSafePreviewSource');
    expect(html).not.toContain('node.data.currentTime');
    expect(html).not.toContain('node.data.route');
    expect(html).not.toContain('savePlaybackState');
  });

  it('renders route switching as Preview runtime state backed by shared effective routes', async () => {
    const plan = createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData());
    const host = createHost(createSnapshot(4), () => plan);
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 3160,
    });

    expect(await bridge.open()).toBe(true);
    const html = panelFactory.createdPanels[0]?.webview.html ?? '';
    const bootstrapPlan = readBootstrapMessages(html).find(
      (message): message is { readonly plan: CanvasPlaybackPlan } =>
        typeof message === 'object' &&
        message !== null &&
        (message as { readonly type?: unknown }).type === 'preview:loadPlaybackPlan',
    )?.plan;

    expect(bootstrapPlan?.routeCandidates?.length).toBeGreaterThan(0);
    expect(html).toContain('id="route-switcher"');
    expect(html).toContain('id="route-select"');
    expect(html).toContain('.player-controls > .route-switcher');
    expect(html).toContain('路线');
    const routeSwitcherIndex = html.indexOf('<div class="route-switcher" id="route-switcher"');
    const playerControlsIndex = html.indexOf(
      '<footer class="player-controls" id="player-controls"',
    );
    const timelineIndex = html.indexOf('<div class="timeline-wrap"', playerControlsIndex);
    const stageHeadingIndex = html.indexOf('<div class="stage-heading">');
    const stageActionsIndex = html.indexOf('<div class="stage-actions"', stageHeadingIndex);
    expect(playerControlsIndex).toBeGreaterThan(-1);
    expect(timelineIndex).toBeGreaterThan(playerControlsIndex);
    expect(stageHeadingIndex).toBeGreaterThan(-1);
    expect(stageActionsIndex).toBeGreaterThan(stageHeadingIndex);
    expect(routeSwitcherIndex).toBeGreaterThan(playerControlsIndex);
    expect(routeSwitcherIndex).toBeLessThan(timelineIndex);
    expect(html.slice(stageHeadingIndex, stageActionsIndex)).not.toContain('id="route-switcher"');
    expect(html.slice(stageHeadingIndex, stageActionsIndex)).not.toContain('id="route-select"');
    expect(html).toContain('let effectiveRoutes = []');
    expect(html).toContain('let activeRouteId = null');
    expect(html).toContain('let branchSelections = {}');
    expect(html).toContain("let routeSelectOptionsKey = ''");
    expect(html).toContain('let routeSelectInteractionActive = false');
    expect(html).toContain('let routeSelectNeedsSync = false');
    expect(html).toContain('let routeSelectStoppedPlayback = false');
    expect(html).toContain('routeSelect.addEventListener');
    expect(html).toContain("routeSelect.addEventListener('pointerdown'");
    expect(html).toContain("routeSelect.addEventListener('focus'");
    expect(html).toContain("routeSelect.addEventListener('blur'");
    expect(html).toContain('const hadDeferredRouteSync = routeSelectNeedsSync');
    expect(html).toContain('switchActiveRoute(routeId)');
    expect(html).toContain("routeSwitcher.dataset.visible = 'false'");
    expect(html).toContain("routeSwitcher.dataset.visible = 'true'");
    expect(html).toContain('function beginRouteSelectInteraction()');
    expect(html).toContain('function createRouteSelectOptionsKey()');
    expect(html).toContain('activeRouteId = resolveDefaultRouteId(effectiveRoutes)');
    expect(html).toContain('function resolveDefaultRouteId(candidates)');
    expect(html).toContain('function isMainEntryRoute(candidate)');
    expect(html).toContain("candidate.sourceKind === 'auto-entry'");
    expect(html.indexOf('const explicitEntry = candidates.find')).toBeLessThan(
      html.indexOf('const autoEntry = candidates.find'),
    );
    const routeSwitcherFunction = html.slice(
      html.indexOf('function renderRouteSwitcher()'),
      html.indexOf('function renderPlaybackTime', html.indexOf('function renderRouteSwitcher()')),
    );
    expect(routeSwitcherFunction).toContain('if (routeSelectInteractionActive)');
    expect(routeSwitcherFunction).toContain('const optionsKey = createRouteSelectOptionsKey()');
    expect(routeSwitcherFunction).toContain('if (routeSelectOptionsKey !== optionsKey)');
    expect(routeSwitcherFunction).toContain("document.createElement('optgroup')");
    expect(routeSwitcherFunction).toContain('groupRouteCandidates(effectiveRoutes)');
    expect(routeSwitcherFunction).not.toMatch(
      /function renderRouteSwitcher\(\) \{\s*routeSelect\.replaceChildren\(\);/,
    );
    expect(html).toContain('function switchActiveRoute(routeId)');
    expect(html).toContain('disposeActiveMediaSurface()');
    expect(html).toContain('branchSelections = {}');
    expect(html).toContain('route = buildRouteFromCandidate(playbackPlan, candidate)');
    expect(html).toContain('elapsedInUnitMs = 0');
    expect(html).toContain(
      'branchSelections = { ...branchSelections, [sourceUnit.id]: choice.id }',
    );
    expect(html).toContain(
      'appendTargetToRoute(route, getCurrentIndex(), activeUnitId, choice.targetUnitId)',
    );
    expect(html).not.toContain('function buildLegacyRouteCandidate');
    expect(html).not.toContain('function buildDefaultRoute');
    expect(html).not.toContain('node.data.activeRouteId');
    expect(html).not.toContain('node.data.branchSelections');
  });

  it('routes Preview media playback messages to the host instead of narrative message parsing', async () => {
    const host = createHost(createSnapshot(9), () =>
      createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const mediaHandler = vi.fn();
    const disposeMediaPanel = vi.fn();
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(
      {
        ...host,
        handleNarrativePreviewMediaMessage: mediaHandler,
        disposeNarrativePreviewMediaPanel: disposeMediaPanel,
      },
      {
        panelFactory,
        now: () => 9100,
      },
    );

    expect(await bridge.open()).toBe(true);
    const panel = panelFactory.createdPanels[0];
    panel?.webview.receiveMessage({
      type: 'media:probe',
      nodeId: 'preview-media:shot-a1',
      assetPath: 'media/clip.mov',
      mediaType: 'video',
    });
    await waitForMicrotasks();

    expect(mediaHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'media:probe',
        nodeId: 'preview-media:shot-a1',
      }),
      panel,
      'file:///story/branch.nkc',
    );
    expect(host.postNarrativePreviewCanvasMessage).not.toHaveBeenCalled();

    panel?.dispose();
    expect(disposeMediaPanel).toHaveBeenCalledWith(panel);
  });

  it('injects the active session envelope into Preview media runtime messages', () => {
    const host = createHost(createSnapshot(9), () =>
      createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 9130,
    });

    return bridge.open().then((opened) => {
      expect(opened).toBe(true);
      const html = panelFactory.createdPanels[0]?.webview.html ?? '';
      expect(html).toContain('window.__nekoNarrativePreviewPostMessage = (message) => {');
      expect(html).toContain('postPreviewMediaMessage(message);');
      expect(html).toContain('const pendingPreviewMediaMessages = [];');
      expect(html).toContain(
        "const payload = removeUndefinedFields(message && typeof message === 'object' ? message : {});",
      );
      expect(html).toContain('pendingPreviewMediaMessages.push(payload);');
      expect(html).toContain('function flushPendingPreviewMediaMessages()');
      expect(html).toContain('flushPendingPreviewMediaMessages();');
      expect(html).toContain('function removeUndefinedFields(value)');
      expect(html).toContain('function postPreviewHostMessage(message)');
      expect(html).toContain('postPreviewHostMessage(payload);');
      expect(html).not.toContain('function postMessage(message)');
      expect(html).toContain('sessionId: currentSessionId');
      expect(html).toContain('sourceCanvasUri: currentSourceCanvasUri');
      expect(html).toContain('revision: currentRevision');
    });
  });

  it('replies with a media error when the Preview host has no media handler', async () => {
    const host = createHost(createSnapshot(9), () =>
      createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 9140,
    });

    expect(await bridge.open()).toBe(true);
    const panel = panelFactory.createdPanels[0];
    panel?.webview.receiveMessage({
      type: 'media:probe',
      nodeId: 'preview-media:clip',
      assetPath: 'cases/1080P.mp4',
      mediaType: 'video',
    });

    expect(panel?.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'media:probeResult',
        nodeId: 'preview-media:clip',
        error: 'Preview media playback is unavailable for this Canvas host.',
        sessionId: expect.stringMatching(/^canvas-preview:/),
        sourceCanvasUri: 'file:///story/branch.nkc',
        revision: 9,
      }),
    );
  });

  it('replies with a media timeout when the host media handler never settles', async () => {
    vi.useFakeTimers();
    try {
      const host = createHost(createSnapshot(9), () =>
        createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
      );
      const panelFactory = createPanelFactory();
      const bridge = new NarrativePreviewBridge(
        {
          ...host,
          handleNarrativePreviewMediaMessage: vi.fn(() => new Promise<void>(() => undefined)),
        },
        {
          panelFactory,
          now: () => 9145,
        },
      );

      expect(await bridge.open()).toBe(true);
      const panel = panelFactory.createdPanels[0];
      panel?.webview.receiveMessage({
        type: 'media:play',
        nodeId: 'preview-media:clip',
        assetPath: 'cases/1080P.mp4',
        mediaType: 'video',
      });

      await vi.advanceTimersByTimeAsync(10_000);

      expect(panel?.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'media:streamReady',
          nodeId: 'preview-media:clip',
          error: 'Preview media request timed out after 10000ms.',
          sessionId: expect.stringMatching(/^canvas-preview:/),
          sourceCanvasUri: 'file:///story/branch.nkc',
          revision: 9,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('routes media messages from an older Preview revision to the current session host', async () => {
    let snapshot = createSnapshot(1, 'file:///story/a.nkc');
    const host = createHost(
      () => snapshot,
      () => createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const mediaHandler = vi.fn();
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(
      {
        ...host,
        handleNarrativePreviewMediaMessage: mediaHandler,
      },
      {
        panelFactory,
        now: () => 9148,
      },
    );

    expect(await bridge.open()).toBe(true);
    const panel = panelFactory.createdPanels[0];
    const sessionId = readBootstrapMessages(panel?.webview.html ?? '').find(
      isPreviewLoadGraphMessage,
    )?.sessionId;

    panel?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready-media-revision',
      sessionId,
      sourceCanvasUri: 'file:///story/a.nkc',
      revision: 1,
    });
    snapshot = createSnapshot(2, 'file:///story/a.nkc');
    expect(await bridge.open()).toBe(true);

    panel?.webview.receiveMessage({
      type: 'media:probe',
      requestId: 'media-old-revision',
      sessionId,
      sourceCanvasUri: 'file:///story/a.nkc',
      revision: 1,
      nodeId: 'preview-media:clip',
      assetPath: 'cases/1080P.mp4',
      mediaType: 'video',
    });
    await waitForMicrotasks();

    expect(mediaHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'media:probe',
        requestId: 'media-old-revision',
        revision: 1,
      }),
      panel,
      'file:///story/a.nkc',
    );
  });

  it('replies with a media error when a Preview media message targets a detached session', async () => {
    const host = createHost(createSnapshot(1, 'file:///story/a.nkc'), () =>
      createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const mediaHandler = vi.fn();
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(
      {
        ...host,
        handleNarrativePreviewMediaMessage: mediaHandler,
      },
      {
        panelFactory,
        now: () => 9149,
      },
    );

    expect(await bridge.open()).toBe(true);
    const panel = panelFactory.createdPanels[0];
    const sessionId = readBootstrapMessages(panel?.webview.html ?? '').find(
      isPreviewLoadGraphMessage,
    )?.sessionId;
    bridge.dispose();

    panel?.webview.receiveMessage({
      type: 'media:probe',
      requestId: 'media-detached',
      sessionId,
      sourceCanvasUri: 'file:///story/a.nkc',
      revision: 1,
      nodeId: 'preview-media:clip',
      assetPath: 'cases/1080P.mp4',
      mediaType: 'video',
    });

    expect(mediaHandler).not.toHaveBeenCalled();
    expect(panel?.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'media:probeResult',
        nodeId: 'preview-media:clip',
        sessionId,
        sourceCanvasUri: 'file:///story/a.nkc',
        revision: 1,
        error:
          'Preview media playback session is no longer attached to a Canvas. Reopen the Canvas Preview.',
      }),
    );
  });

  it('scopes media messages, variant requests, and cleanup to the owning Preview session', async () => {
    let snapshot = createSnapshot(1, 'file:///story/a.nkc');
    const host = createHost(
      () => snapshot,
      () => createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const mediaHandler = vi.fn();
    const variantHandler = vi.fn();
    const disposeMediaPanel = vi.fn();
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(
      {
        ...host,
        handleNarrativePreviewMediaMessage: mediaHandler,
        resolveNarrativePreviewVariant: variantHandler,
        disposeNarrativePreviewMediaPanel: disposeMediaPanel,
      },
      {
        panelFactory,
        now: () => 9150,
      },
    );

    expect(await bridge.open()).toBe(true);
    const firstPanel = panelFactory.createdPanels[0];
    const firstSessionId = readBootstrapMessages(firstPanel?.webview.html ?? '').find(
      isPreviewLoadGraphMessage,
    )?.sessionId;

    snapshot = createSnapshot(1, 'file:///story/b.nkc');
    expect(await bridge.open()).toBe(true);
    const secondPanel = panelFactory.createdPanels[1];
    const secondSessionId = readBootstrapMessages(secondPanel?.webview.html ?? '').find(
      isPreviewLoadGraphMessage,
    )?.sessionId;

    firstPanel?.webview.receiveMessage({
      type: 'media:probe',
      requestId: 'media-a',
      sessionId: firstSessionId,
      sourceCanvasUri: 'file:///story/a.nkc',
      revision: 1,
      nodeId: 'preview-media:shot-a1',
      assetPath: 'media/a.mov',
      mediaType: 'video',
    });
    secondPanel?.webview.receiveMessage({
      type: 'preview:resolveVariant',
      requestId: 'variant-b',
      sessionId: secondSessionId,
      sourceCanvasUri: 'file:///story/b.nkc',
      revision: 1,
      sourceId: 'shot-b1',
      role: 'thumbnail',
      mediaType: 'image',
    });
    secondPanel?.webview.receiveMessage({
      type: 'preview:resolveVariant',
      requestId: 'variant-wrong',
      sessionId: firstSessionId,
      sourceCanvasUri: 'file:///story/b.nkc',
      revision: 1,
      sourceId: 'shot-b2',
      role: 'thumbnail',
      mediaType: 'image',
    });
    await waitForMicrotasks();

    expect(mediaHandler).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'media-a' }),
      firstPanel,
      'file:///story/a.nkc',
    );
    expect(variantHandler).toHaveBeenCalledTimes(1);
    expect(variantHandler).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'variant-b' }),
      secondPanel,
      'file:///story/b.nkc',
    );

    firstPanel?.dispose();
    expect(disposeMediaPanel).toHaveBeenCalledTimes(1);
    expect(disposeMediaPanel).toHaveBeenCalledWith(firstPanel);
    expect(secondPanel?.dispose).not.toHaveBeenCalled();
  });

  it('routes Preview image variant requests to the host instead of narrative message parsing', async () => {
    const host = createHost(createSnapshot(10), () =>
      createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const variantHandler = vi.fn();
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(
      {
        ...host,
        resolveNarrativePreviewVariant: variantHandler,
      },
      {
        panelFactory,
        now: () => 9200,
      },
    );

    expect(await bridge.open()).toBe(true);
    const panel = panelFactory.createdPanels[0];
    panel?.webview.receiveMessage({
      type: 'preview:resolveVariant',
      requestId: 'variant-1',
      sourceId: 'shot-a1',
      role: 'thumbnail',
      mediaType: 'image',
      documentResourceRef: {
        kind: 'document-entry',
        documentId: 'doc-1',
        entryId: 'page-1',
        mediaType: 'image',
      },
    });
    await waitForMicrotasks();

    expect(variantHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:resolveVariant',
        requestId: 'variant-1',
        sourceId: 'shot-a1',
      }),
      panel,
      'file:///story/branch.nkc',
    );
    expect(host.postNarrativePreviewCanvasMessage).not.toHaveBeenCalled();
  });

  it('replies with a variant error when the host variant handler fails', async () => {
    const host = createHost(createSnapshot(10), () =>
      createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(
      {
        ...host,
        resolveNarrativePreviewVariant: vi.fn(() => {
          throw new Error('cache unavailable');
        }),
      },
      {
        panelFactory,
        now: () => 9300,
      },
    );

    expect(await bridge.open()).toBe(true);
    const panel = panelFactory.createdPanels[0];
    panel?.webview.receiveMessage({
      type: 'preview:resolveVariant',
      requestId: 'variant-error-1',
      sourceId: 'shot-a1',
      role: 'thumbnail',
      mediaType: 'image',
    });
    await waitForMicrotasks();

    expect(panel?.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:variantResolved',
        requestId: 'variant-error-1',
        error: 'cache unavailable',
        sessionId: expect.stringMatching(/^canvas-preview:/),
        sourceCanvasUri: 'file:///story/branch.nkc',
        revision: 10,
      }),
    );
  });

  it('replies with a variant error when the host handler reports no delivered response', async () => {
    const host = createHost(createSnapshot(10), () =>
      createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(
      {
        ...host,
        resolveNarrativePreviewVariant: vi.fn(async () => false),
      },
      {
        panelFactory,
        now: () => 9350,
      },
    );

    expect(await bridge.open()).toBe(true);
    const panel = panelFactory.createdPanels[0];
    panel?.webview.receiveMessage({
      type: 'preview:resolveVariant',
      requestId: 'variant-undelivered-1',
      sourceId: 'shot-a1',
      role: 'thumbnail',
      mediaType: 'image',
    });
    await waitForMicrotasks();
    await waitForMicrotasks();

    expect(panel?.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:variantResolved',
        requestId: 'variant-undelivered-1',
        error: 'Preview variant resolution completed without delivering a response.',
        sessionId: expect.stringMatching(/^canvas-preview:/),
        sourceCanvasUri: 'file:///story/branch.nkc',
        revision: 10,
      }),
    );
  });

  it('replies with a variant timeout when the host variant handler never settles', async () => {
    vi.useFakeTimers();
    try {
      const host = createHost(createSnapshot(10), () =>
        createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
      );
      const panelFactory = createPanelFactory();
      const bridge = new NarrativePreviewBridge(
        {
          ...host,
          resolveNarrativePreviewVariant: vi.fn(() => new Promise<void>(() => undefined)),
        },
        {
          panelFactory,
          now: () => 9400,
        },
      );

      expect(await bridge.open()).toBe(true);
      const panel = panelFactory.createdPanels[0];
      panel?.webview.receiveMessage({
        type: 'preview:resolveVariant',
        requestId: 'variant-timeout-1',
        sourceId: 'shot-a1',
        role: 'thumbnail',
        mediaType: 'image',
      });

      await vi.advanceTimersByTimeAsync(6500);

      expect(panel?.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'preview:variantResolved',
          requestId: 'variant-timeout-1',
          error: 'Preview variant request timed out after 6500ms.',
          sessionId: expect.stringMatching(/^canvas-preview:/),
          sourceCanvasUri: 'file:///story/branch.nkc',
          revision: 10,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps storyboard Canvas playback available when narrative snapshot has zero runtime nodes', async () => {
    const canvas = createStoryboardCanvasData();
    const snapshot = createNarrativeGraphSnapshotFromCanvasData(canvas, { revision: 5 });
    const plan = createCanvasPlaybackPlanFromCanvasData(canvas);

    expect(snapshot.nodes).toHaveLength(0);
    expect(plan).toMatchObject({
      adapterId: 'storyboard',
      behaviorMode: 'linear',
      units: [
        expect.objectContaining({ id: 'shot-a1', kind: 'shot' }),
        expect.objectContaining({ id: 'shot-a2', kind: 'shot' }),
      ],
    });
    expect(plan?.diagnostics.some((item) => item.code === 'playback-narrative-runtime-only')).toBe(
      false,
    );
  });

  it('creates Canvas playback plans when snapshots omit the connections array', async () => {
    const canvas = createStoryboardCanvasData();
    const { connections: _connections, ...withoutConnections } = canvas;

    const plan = createCanvasPlaybackPlanFromCanvasData(withoutConnections);

    expect(plan).toMatchObject({
      adapterId: 'storyboard',
      units: [
        expect.objectContaining({ id: 'shot-a1', kind: 'shot' }),
        expect.objectContaining({ id: 'shot-a2', kind: 'shot' }),
      ],
    });
  });

  it('drops stale Preview-to-Canvas messages after newer revisions are posted', async () => {
    let revision = 2;
    const host = createHost(() => createSnapshot(revision));
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 2000,
    });

    await bridge.open();
    panelFactory.createdPanels[0]?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready-stale-test',
    });
    revision = 3;
    expect(bridge.refresh()).toBe(true);
    expect(bridge.jumpTo('scene-a')).toBe(true);
    expect(bridge.setVariables({ affection: 4 })).toBe(true);
    expect(panelFactory.createdPanels[0]?.webview.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'preview:setVariables',
        requestId: 'canvas-narrative:variables:2000:8',
        revision: 3,
        variables: { affection: 4 },
      }),
    );

    expect(
      bridge.handlePreviewMessage({
        type: 'canvas:highlightNode',
        requestId: 'old',
        nodeId: 'scene-a',
        revision: 2,
      } as PreviewToCanvasMessage),
    ).toBe(false);
    expect(host.postNarrativePreviewCanvasMessage).not.toHaveBeenCalled();

    expect(
      bridge.handlePreviewMessage({
        type: 'canvas:highlightNode',
        requestId: 'current',
        nodeId: 'scene-a',
        revision: 3,
      } as PreviewToCanvasMessage),
    ).toBe(true);
    expect(host.postNarrativePreviewCanvasMessage).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'scene-a' }),
    );
  });

  it('reuses the same Preview session for one Canvas and creates distinct sessions for different Canvases', async () => {
    let snapshot = createSnapshot(1, 'file:///story/a.nkc');
    const host = createHost(() => snapshot);
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 5100,
    });

    expect(await bridge.open()).toBe(true);
    const firstSessionId = readBootstrapMessages(
      panelFactory.createdPanels[0]?.webview.html ?? '',
    ).find(isPreviewLoadGraphMessage)?.sessionId;
    panelFactory.createdPanels[0]?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready-a',
      sessionId: firstSessionId,
      sourceCanvasUri: 'file:///story/a.nkc',
      revision: 1,
    });

    snapshot = createSnapshot(1, 'file:///story/a.nkc');
    expect(await bridge.open()).toBe(true);
    expect(panelFactory.createdPanels).toHaveLength(1);
    expect(panelFactory.createdPanels[0]?.reveal).toHaveBeenCalledTimes(1);

    snapshot = createSnapshot(1, 'file:///story/b.nkc');
    expect(await bridge.open()).toBe(true);
    expect(panelFactory.createdPanels).toHaveLength(2);
    const secondSessionId = readBootstrapMessages(
      panelFactory.createdPanels[1]?.webview.html ?? '',
    ).find(isPreviewLoadGraphMessage)?.sessionId;

    expect(firstSessionId).toMatch(/^canvas-preview:/);
    expect(secondSessionId).toMatch(/^canvas-preview:/);
    expect(secondSessionId).not.toBe(firstSessionId);
  });

  it('isolates Preview-to-Canvas messages by session identity and revision', async () => {
    let snapshot = createSnapshot(1, 'file:///story/a.nkc');
    const host = createHost(() => snapshot);
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 5200,
    });

    expect(await bridge.open()).toBe(true);
    const firstSessionId = readBootstrapMessages(
      panelFactory.createdPanels[0]?.webview.html ?? '',
    ).find(isPreviewLoadGraphMessage)?.sessionId;
    panelFactory.createdPanels[0]?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready-a',
      sessionId: firstSessionId,
      sourceCanvasUri: 'file:///story/a.nkc',
      revision: 1,
    });

    snapshot = createSnapshot(2, 'file:///story/b.nkc');
    expect(await bridge.open()).toBe(true);
    const secondSessionId = readBootstrapMessages(
      panelFactory.createdPanels[1]?.webview.html ?? '',
    ).find(isPreviewLoadGraphMessage)?.sessionId;
    panelFactory.createdPanels[1]?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready-b',
      sessionId: secondSessionId,
      sourceCanvasUri: 'file:///story/b.nkc',
      revision: 2,
    });

    snapshot = createSnapshot(3, 'file:///story/b.nkc');
    expect(bridge.refresh()).toBe(true);

    expect(
      bridge.handlePreviewMessage({
        type: 'canvas:highlightNode',
        requestId: 'wrong-session',
        nodeId: 'scene-a',
        sessionId: firstSessionId,
        sourceCanvasUri: 'file:///story/b.nkc',
        revision: 3,
      } as PreviewToCanvasMessage),
    ).toBe(false);
    expect(host.postNarrativePreviewCanvasMessage).not.toHaveBeenCalled();

    expect(
      bridge.handlePreviewMessage({
        type: 'canvas:highlightNode',
        requestId: 'stale',
        nodeId: 'scene-a',
        sessionId: secondSessionId,
        sourceCanvasUri: 'file:///story/b.nkc',
        revision: 2,
      } as PreviewToCanvasMessage),
    ).toBe(false);
    expect(host.postNarrativePreviewCanvasMessage).not.toHaveBeenCalled();

    expect(
      bridge.handlePreviewMessage({
        type: 'canvas:highlightNode',
        requestId: 'current',
        nodeId: 'scene-a',
        sessionId: secondSessionId,
        sourceCanvasUri: 'file:///story/b.nkc',
        revision: 3,
      } as PreviewToCanvasMessage),
    ).toBe(true);
    expect(host.postNarrativePreviewCanvasMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'current',
        sessionId: secondSessionId,
        sourceCanvasUri: 'file:///story/b.nkc',
        revision: 3,
      }),
    );
  });

  it('refreshes the Preview session for the requested source Canvas instead of the active Canvas', async () => {
    let activeSnapshot = createSnapshot(1, 'file:///story/a.nkc');
    const snapshotsBySource = new Map<string, NarrativeGraphSnapshot>([
      ['file:///story/a.nkc', activeSnapshot],
    ]);
    const plan = createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData());
    const host = {
      ...createHost(
        () => activeSnapshot,
        () => plan,
      ),
      extractNarrativeGraphSnapshotForSource: vi.fn((sourceCanvasUri: string) =>
        snapshotsBySource.get(sourceCanvasUri),
      ),
    };
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      now: () => 5250,
    });

    expect(await bridge.open()).toBe(true);
    const firstSessionId = readBootstrapMessages(
      panelFactory.createdPanels[0]?.webview.html ?? '',
    ).find(isPreviewLoadGraphMessage)?.sessionId;
    panelFactory.createdPanels[0]?.webview.receiveMessage({
      type: 'preview:webviewReady',
      requestId: 'ready-a',
      sessionId: firstSessionId,
      sourceCanvasUri: 'file:///story/a.nkc',
      revision: 1,
    });

    activeSnapshot = createSnapshot(1, 'file:///story/b.nkc');
    snapshotsBySource.set('file:///story/b.nkc', activeSnapshot);
    expect(await bridge.open()).toBe(true);

    snapshotsBySource.set('file:///story/a.nkc', createSnapshot(2, 'file:///story/a.nkc'));
    expect(bridge.refresh('file:///story/a.nkc')).toBe(true);

    expect(host.extractNarrativeGraphSnapshotForSource).toHaveBeenCalledWith('file:///story/a.nkc');
    expect(panelFactory.createdPanels[0]?.webview.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'preview:refreshPlaybackPlan',
        sessionId: firstSessionId,
        sourceCanvasUri: 'file:///story/a.nkc',
        revision: 2,
      }),
    );
    expect(panelFactory.createdPanels[1]?.webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:refreshPlaybackPlan',
        sourceCanvasUri: 'file:///story/a.nkc',
      }),
    );
  });

  it('marks visible Preview sessions stale and expires them after the grace period', async () => {
    vi.useFakeTimers();
    try {
      const host = createHost(createSnapshot(1, 'file:///story/a.nkc'), () =>
        createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
      );
      const disposeMediaPanel = vi.fn();
      const panelFactory = createPanelFactory();
      const bridge = new NarrativePreviewBridge(
        { ...host, disposeNarrativePreviewMediaPanel: disposeMediaPanel },
        {
          panelFactory,
          staleSessionGraceMs: 1000,
          now: () => 5300,
        },
      );

      expect(await bridge.open()).toBe(true);
      const panel = panelFactory.createdPanels[0];
      panel?.webview.receiveMessage({
        type: 'preview:webviewReady',
        requestId: 'ready-stale',
      });

      bridge.handleCanvasEditorClosed('file:///story/a.nkc');

      expect(panel?.dispose).not.toHaveBeenCalled();
      expect(panel?.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'preview:sessionStale',
          sessionId: expect.stringMatching(/^canvas-preview:/),
          sourceCanvasUri: 'file:///story/a.nkc',
          revision: 1,
        }),
      );

      await vi.advanceTimersByTimeAsync(1000);

      expect(panel?.dispose).toHaveBeenCalledTimes(1);
      expect(disposeMediaPanel).toHaveBeenCalledWith(panel);
    } finally {
      vi.useRealTimers();
    }
  });

  it('disposes hidden Preview sessions immediately when the source Canvas editor closes', async () => {
    const host = createHost(createSnapshot(1, 'file:///story/a.nkc'), () =>
      createCanvasPlaybackPlanFromCanvasData(createStoryboardCanvasData()),
    );
    const disposeMediaPanel = vi.fn();
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(
      { ...host, disposeNarrativePreviewMediaPanel: disposeMediaPanel },
      {
        panelFactory,
        now: () => 5400,
      },
    );

    expect(await bridge.open()).toBe(true);
    const panel = panelFactory.createdPanels[0];
    panel?.setVisible(false);

    bridge.handleCanvasEditorClosed('file:///story/a.nkc');

    expect(panel?.dispose).toHaveBeenCalledTimes(1);
    expect(disposeMediaPanel).toHaveBeenCalledWith(panel);
    expect(panel?.webview.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'preview:sessionStale' }),
    );
  });

  it('hard gates panel creation when Narrative Preview is disabled', async () => {
    const host = createHost(createSnapshot(1));
    const panelFactory = createPanelFactory();
    const bridge = new NarrativePreviewBridge(host, {
      panelFactory,
      getFeatureToggles: () => ({
        preview: false,
        typewriterEffect: true,
        autoExpressionMatch: true,
        showLockedChoices: true,
        previewAutoSync: true,
        live2dPerformance: false,
      }),
    });

    expect(await bridge.open()).toBe(false);
    expect(panelFactory.createdPanels).toHaveLength(0);
    expect(host.extractNarrativeGraphSnapshot).not.toHaveBeenCalled();
  });

  it('parses typed Preview-to-Canvas messages and rejects malformed payloads', async () => {
    expect(
      parsePreviewToCanvasMessage({
        type: 'canvas:choiceMade',
        requestId: 'choice-1',
        fromNodeId: 'choice-a',
        toNodeId: 'ending-a',
      }),
    ).toEqual({
      type: 'canvas:choiceMade',
      requestId: 'choice-1',
      fromNodeId: 'choice-a',
      toNodeId: 'ending-a',
    });
    expect(parsePreviewToCanvasMessage({ type: 'canvas:highlightNode' })).toBeUndefined();
    expect(
      parsePreviewToCanvasMessage({ type: 'preview:loadGraph', requestId: 'x' }),
    ).toBeUndefined();
  });
});

function createCanvasData(): CanvasData {
  return {
    version: '2.1',
    name: 'Branching Story',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    narrative: {
      entryNodeId: 'start',
      genre: 'visual-novel',
      defaultLocale: 'zh-cn',
      variables: [{ id: 'affection', name: 'Affection', value: 2 }],
    },
    nodes: [
      createNode('start', 'narrative-start', { label: 'Start' }),
      createNode('scene-a', 'narrative-scene', {
        title: 'Cafe',
        sceneRef: 'scenes/cafe.fountain',
        backgroundRef: 'assets/bg/cafe.png',
        characters: ['characters/hero.yaml'],
        variableEffects: [{ variableId: 'affection', operation: 'add', value: 1 }],
        productionRefs: [
          {
            bindingId: 'bind-shot-1',
            role: 'source',
            target: {
              kind: 'storyboard-shot',
              sceneId: 'scene-1',
              shotId: 'scene-1-shot-1',
            },
          },
          {
            bindingId: 'bind-video-1',
            role: 'primary',
            target: {
              kind: 'generated-video',
              ref: {
                kind: 'generated-asset',
                assetId: 'generated-video-1',
                resourceRef: {
                  id: 'generated-video-1',
                  scope: 'project',
                  provider: 'generated',
                  kind: 'generated',
                  source: {
                    kind: 'generated-asset',
                    generatedAssetId: 'generated-video-1',
                  },
                  fingerprint: { strategy: 'provider', value: 'generated-video-1' },
                },
              },
            },
          },
        ],
      }),
      createNode('choice-a', 'choice', { label: 'Choice' }),
      createNode('ending-a', 'narrative-ending', {
        endingType: 'good',
        endingLabel: 'Good Ending',
        statisticsSummary: true,
      }),
      createNode('note-a', 'narrative-note', { content: 'Editor only' }),
    ],
    connections: [
      createConnection('c-start-scene', 'start', 'scene-a', 'default'),
      createConnection('c-scene-choice', 'scene-a', 'choice-a', 'choice', {
        choiceText: 'Stay',
        condition: 'affection >= 1',
        priority: 2,
      }),
      createConnection('c-choice-ending', 'choice-a', 'ending-a', 'choice', {
        label: 'Leave',
      }),
      createConnection('c-note-scene', 'note-a', 'scene-a', 'default'),
    ],
  };
}

function createNode(
  id: string,
  type: CanvasData['nodes'][number]['type'],
  data: Record<string, unknown>,
): CanvasData['nodes'][number] {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 1,
    data,
  } as CanvasData['nodes'][number];
}

function createConnection(
  id: string,
  sourceId: string,
  targetId: string,
  type: CanvasData['connections'][number]['type'],
  extra: Partial<CanvasData['connections'][number]> = {},
): CanvasData['connections'][number] {
  return {
    id,
    sourceId,
    targetId,
    sourceEndpoint: { nodeId: sourceId, scope: 'node' },
    targetEndpoint: { nodeId: targetId, scope: 'node' },
    type,
    ...extra,
  };
}

function createSnapshot(
  revision: number,
  sourceCanvasUri = 'file:///story/branch.nkc',
): NarrativeGraphSnapshot {
  return createNarrativeGraphSnapshotFromCanvasData(createCanvasData(), {
    revision,
    sourceCanvasUri,
  });
}

function createHost(
  snapshot: NarrativeGraphSnapshot | (() => NarrativeGraphSnapshot),
  plan?:
    CanvasPlaybackPlan | ((sourceCanvasUri?: string) => CanvasPlaybackPlan | undefined) | undefined,
  previewPlan?: (
    webview: unknown,
    sourceCanvasUri?: string,
  ) => CanvasPlaybackPlan | Promise<CanvasPlaybackPlan | undefined> | undefined,
) {
  return {
    extractNarrativeGraphSnapshot: vi.fn(() =>
      typeof snapshot === 'function' ? snapshot() : snapshot,
    ),
    extractCanvasPlaybackPlan: vi.fn((sourceCanvasUri?: string) =>
      typeof plan === 'function' ? plan(sourceCanvasUri) : plan,
    ),
    ...(previewPlan ? { extractCanvasPlaybackPlanForPreview: previewPlan } : {}),
    postNarrativePreviewCanvasMessage: vi.fn(() => true),
  };
}

async function waitForMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createStoryboardCanvasData(): CanvasData {
  return {
    version: '2.1',
    name: 'Scene Only',
    nodes: [
      {
        id: 'scene-a',
        type: 'scene',
        position: { x: 0, y: 0 },
        size: { width: 480, height: 280 },
        zIndex: 0,
        container: {
          policy: 'scene',
          childIds: ['shot-a1', 'shot-a2'],
          layout: { mode: 'sequence' },
        },
        data: { sceneTitle: 'Scene A', sceneNumber: 1 },
      },
      createNode('shot-a1', 'shot', {
        shotNumber: 1,
        duration: 2,
        visualDescription: 'Opening',
        characters: [{ characterName: 'Hero' }],
        shotScale: 'MS',
        characterAction: 'Looks around',
        emotion: [],
        sceneTags: [],
        generationStatus: 'idle',
        generationHistory: [],
      }),
      createNode('shot-a2', 'shot', {
        shotNumber: 2,
        duration: 3,
        visualDescription: 'Close up',
        characters: [],
        shotScale: 'CU',
        characterAction: 'Speaks',
        emotion: [],
        sceneTags: [],
        generationStatus: 'idle',
        generationHistory: [],
      }),
    ].map((node) =>
      node.id === 'shot-a1' || node.id === 'shot-a2' ? { ...node, parentId: 'scene-a' } : node,
    ) as CanvasData['nodes'],
    connections: [],
  };
}

function createPanelFactory(): NarrativePreviewPanelFactory & {
  readonly createdPanels: ReturnType<typeof createPanel>[];
} {
  const createdPanels: ReturnType<typeof createPanel>[] = [];
  return {
    createdPanels,
    createWebviewPanel: vi.fn((_viewType, title) => {
      const panel = createPanel(title);
      createdPanels.push(panel);
      return panel as never;
    }),
  };
}

function createPanel(title: string) {
  const disposeHandlers: Array<() => void> = [];
  let messageHandler: ((message: unknown) => void) | undefined;
  let visible = true;
  const panel = {
    title,
    get visible() {
      return visible;
    },
    setVisible: vi.fn((nextVisible: boolean) => {
      visible = nextVisible;
    }),
    webview: {
      html: '',
      cspSource: 'vscode-webview:',
      asWebviewUri: vi.fn((uri: { toString?: () => string; path?: string }) => ({
        toString: () => `vscode-webview-resource://${uri.path ?? uri.toString?.() ?? ''}`,
      })),
      postMessage: vi.fn(() => Promise.resolve(true)),
      onDidReceiveMessage: vi.fn((handler: (message: unknown) => void) => {
        messageHandler = handler;
        return { dispose: vi.fn() };
      }),
      receiveMessage: (message: unknown) => messageHandler?.(message),
    },
    reveal: vi.fn(),
    dispose: vi.fn(() => {
      for (const handler of disposeHandlers) {
        handler();
      }
    }),
    onDidDispose: vi.fn((handler: () => void) => {
      disposeHandlers.push(handler);
      return { dispose: vi.fn() };
    }),
  };
  return panel;
}

function readBootstrapMessages(html: string): unknown[] {
  const match = html.match(/const BOOTSTRAP_MESSAGES = (.*?);/);
  if (!match?.[1]) {
    return [];
  }
  return JSON.parse(match[1]) as unknown[];
}

function readPreviewI18n(html: string): Record<string, string> {
  const match = html.match(/const I18N = (.*?);/);
  if (!match?.[1]) {
    return {};
  }
  return JSON.parse(match[1]) as Record<string, string>;
}

function isPreviewLoadGraphMessage(
  message: unknown,
): message is { readonly type: 'preview:loadGraph'; readonly sessionId?: string } {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { readonly type?: unknown }).type === 'preview:loadGraph'
  );
}
