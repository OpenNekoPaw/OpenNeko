import * as vscode from 'vscode';
import type { AgentContextPayload } from '@neko/shared';
import { normalizeAgentRuntimePromptLocale } from '@neko/agent/runtime';
import { buildGlobalErrorMessage, type WebviewToExtensionMessage } from '@neko-agent/types';
import { getLogger } from '../../base';
import type { ChatWebviewMessageRouterDeps } from './types';
import { resolveRequiredConversationId } from './conversationId';

const logger = getLogger('ChatMessageRoutes');

export function tryHandleMessageRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  const { webview } = deps;

  switch (message.type) {
    case 'sendMessage':
      if (deps.characterDialogue?.hasSession(message.conversationId)) {
        void deps.characterDialogue.routeUserMessage(message.conversationId, message.message);
        return true;
      }
      if (deps.embodyCharacter?.hasSession(message.conversationId)) {
        void deps.embodyCharacter.routeUserMessage(message.conversationId, message.message);
        return true;
      }
      dispatchAgentMessageTurn(deps, {
        conversationId: message.conversationId,
        messageText: message.message,
        sessionMode: message.sessionMode,
        chatModel: message.chatModel,
        agentModels: message.agentModels,
        llmConfig: message.llmConfig,
        mediaModel: message.mediaModel,
        purposeModels: message.purposeModels,
        attachments: message.attachments,
        contextPayloads: message.contextPayloads,
        fileReferences: message.fileReferences,
        promptId: message.promptId,
        locale: vscode.env.language,
      });
      return true;

    case 'searchProjectFiles': {
      const allowsTablessSearch = message.purpose === 'roleplay' || message.purpose === 'entry';
      const conversationId = allowsTablessSearch
        ? message.conversationId
        : resolveRequiredConversationId(webview, message, 'searchProjectFiles');
      if (!allowsTablessSearch && !conversationId) return true;
      deps.messages?.searchProjectFiles(webview, message.filter, conversationId, {
        purpose: message.purpose,
      });
      return true;
    }

    case 'startCharacterDialogueFromSlash':
      void deps.characterDialogue?.launchFromSlash({ args: message.args });
      return true;

    case 'confirmRoleplayCandidate':
      void deps.characterDialogue?.confirmRoleplayCandidate({
        projectSearchItemId: message.projectSearchItemId,
        ...(message.initialUserMessage !== undefined
          ? { initialUserMessage: message.initialUserMessage }
          : {}),
      });
      return true;

    case 'mermaidError': {
      const conversationId = resolveRequiredConversationId(
        webview,
        message,
        'report Mermaid error',
      );
      if (!conversationId) return true;
      dispatchAgentMessageTurn(deps, {
        conversationId,
        messageText: message.feedbackMessage,
        sessionMode: 'agent',
        locale: vscode.env.language,
      });
      return true;
    }

    case 'requestCanvasAuthoringHandoff': {
      const locale = vscode.env.language;
      dispatchAgentMessageTurn(deps, {
        conversationId: message.conversationId,
        messageText: buildCanvasAuthoringHandoffPrompt(message, locale),
        sessionMode: 'agent',
        contextPayloads: [buildCanvasAuthoringHandoffContextPayload(message, locale)],
        locale,
      });
      return true;
    }

    default:
      return false;
  }
}

function dispatchAgentMessageTurn(
  deps: ChatWebviewMessageRouterDeps,
  request: Parameters<
    NonNullable<ChatWebviewMessageRouterDeps['messages']>['handleUserMessage']
  >[1],
): void {
  const operation = deps.messages?.handleUserMessage(deps.webview, request);
  if (!operation) return;
  void operation.catch((error: unknown) => {
    logger.error('Agent message route failed:', error);
    const message = error instanceof Error ? error.message : 'Agent message route failed.';
    void Promise.resolve(deps.webview.postMessage(buildGlobalErrorMessage(message))).catch(
      (postError: unknown) =>
        logger.error('Failed to project Agent message route error:', postError),
    );
  });
}

type CanvasAuthoringHandoffRouteMessage = Omit<
  Extract<WebviewToExtensionMessage, { type: 'requestCanvasAuthoringHandoff' }>,
  'type'
>;

function buildCanvasAuthoringHandoffPrompt(
  message: CanvasAuthoringHandoffRouteMessage,
  locale?: string,
): string {
  const title = message.title ?? defaultCanvasAuthoringHandoffTitle(message.sourceKind);
  if (normalizeAgentRuntimePromptLocale(locale) === 'zh') {
    return [
      `把 "${title}" 作为 ${formatCanvasAuthoringSourceKindZh(message.sourceKind)} 发送到 Canvas。`,
      '这是 Agent 可见的 Canvas authoring handoff intent，不是直接 Canvas 命令。',
      '请根据内容和附加 handoff 上下文判断是否需要 Canvas authoring Skill、Canvas catalog/context 查询，以及应该使用哪个 Canvas capability/tool。',
      ...projectCanvasAuthoringSourceGuidanceZh(message),
      '使用 handoff 上下文里的稳定 resource refs。不要使用 Webview render URI、blob URL、runtime handle、旧 plugin-transfer payload 或 CanvasNode JSON。',
      '资源字段必须保持原始契约：统一 ResourceRef 使用 resourceRef；EPUB/PDF/CBZ 等 document-entry DocumentArchiveResourceRef 必须使用 documentResourceRef，不能放进 resourceRef。',
      '如果 Canvas 工具返回 blocked、error diagnostic 或没有返回新增/变更的 Canvas 引用，不要宣称已发送成功；应直接报告阻塞诊断。',
      '',
      message.content,
    ].join('\n');
  }
  return [
    `Send "${title}" to Canvas as ${formatCanvasAuthoringSourceKindEn(message.sourceKind)}.`,
    'This is an Agent-visible Canvas authoring handoff intent, not a direct Canvas command.',
    'Decide whether to use the Canvas authoring Skill, query Canvas catalog/context, and which Canvas capability/tool to call based on the content and attached handoff context.',
    ...projectCanvasAuthoringSourceGuidanceEn(message),
    'Use stable resource refs from the handoff context. Do not use Webview render URIs, blob URLs, runtime handles, old plugin-transfer payloads, or CanvasNode JSON.',
    'Preserve resource field contracts: unified ResourceRef values use resourceRef; EPUB/PDF/CBZ document-entry DocumentArchiveResourceRef values must use documentResourceRef and must not be placed in resourceRef.',
    'If a Canvas tool returns blocked, an error diagnostic, or no created/changed Canvas reference, do not claim the content was sent successfully; report the blocking diagnostic instead.',
    '',
    message.content,
  ].join('\n');
}

function buildCanvasAuthoringHandoffContextPayload(
  message: CanvasAuthoringHandoffRouteMessage,
  locale?: string,
): AgentContextPayload {
  const title = message.title ?? defaultCanvasAuthoringHandoffTitle(message.sourceKind);
  const resourceCount = message.resources?.length ?? 0;
  const stableRefCount = message.stableRefs?.length ?? 0;
  const diagnosticCount = message.diagnostics?.length ?? 0;
  const isZh = normalizeAgentRuntimePromptLocale(locale) === 'zh';
  const summaryParts = [
    message.sourceFormat ?? message.sourceKind,
    isZh
      ? `${resourceCount} 个稳定 resource ref`
      : resourceCount === 1
        ? '1 stable resource ref'
        : `${resourceCount} stable resource refs`,
    isZh
      ? `${stableRefCount} 个稳定语义 ref`
      : stableRefCount === 1
        ? '1 stable semantic ref'
        : `${stableRefCount} stable semantic refs`,
    isZh
      ? `${diagnosticCount} 个 handoff diagnostic`
      : diagnosticCount === 1
        ? '1 handoff diagnostic'
        : `${diagnosticCount} handoff diagnostics`,
  ];
  return {
    type: 'document-selection' as const,
    id: message.requestId,
    label: isZh ? `Canvas 创作交接: ${title}` : `Canvas authoring handoff: ${title}`,
    summary: summaryParts.join(', '),
    intent:
      message.userIntent ??
      (isZh
        ? '通过 Agent 工具选择把这段内容发送到 Canvas。'
        : 'Send this content to Canvas through Agent tool selection.'),
    data: {
      kind: 'canvas-authoring-handoff',
      requestId: message.requestId,
      sourceKind: message.sourceKind,
      content: message.content,
      title,
      ...(message.sourceFormat ? { sourceFormat: message.sourceFormat } : {}),
      ...(message.canonicalStoryboard ? { canonicalStoryboard: message.canonicalStoryboard } : {}),
      ...(message.resources ? { resources: message.resources } : {}),
      ...(message.stableRefs ? { stableRefs: message.stableRefs } : {}),
      ...(message.diagnostics ? { diagnostics: message.diagnostics } : {}),
      ...(message.promptSpans ? { promptSpans: message.promptSpans } : {}),
      ...(message.target ? { target: message.target } : {}),
      ...(message.provenance ? { provenance: message.provenance } : {}),
      ...(message.userIntent ? { userIntent: message.userIntent } : {}),
      ...(message.targetHints ? { targetHints: message.targetHints } : {}),
    },
  };
}

function defaultCanvasAuthoringHandoffTitle(
  sourceKind: CanvasAuthoringHandoffRouteMessage['sourceKind'],
): string {
  if (sourceKind === 'markdown') return 'Assistant Markdown';
  if (sourceKind === 'structured-content') return 'Assistant Structured Content';
  if (sourceKind === 'resource-backed-content') return 'Assistant Resource Content';
  return 'Assistant Text';
}

function projectCanvasAuthoringSourceGuidanceZh(
  message: CanvasAuthoringHandoffRouteMessage,
): readonly string[] {
  if (message.canonicalStoryboard && isExplicitStructuredCanvasHandoffIntent(message.userIntent)) {
    return [
      '这是 canonical Storyboard 生产交接；必须把 handoff 上下文中的 canonicalStoryboard 原样传给现有 Canvas 分镜创建 capability。',
      '不得压平为 asset batch，不得从可见 Markdown 重建 scene/shot，也不得丢弃 shot media refs。',
      '创建结果必须包含 scene 容器与其所属 shot 子节点；失败或无新增引用时按阻塞处理。',
    ];
  }
  if (isStoryboardCreativeTableHandoff(message)) {
    return isExplicitStructuredCanvasHandoffIntent(message.userIntent)
      ? [
          '这是用户明确要求的专业结构化 Storyboard authoring；先验证来源，再创建 scene/shot 生产节点。',
          '调用 canvas.createStoryboardFromMarkdown 时传入 profileHint=storyboard、mode=create-nodes 和显式 approval context；失败时不得降级为其他结构化路径。',
        ]
      : [
          '这是普通 Storyboard Markdown 文档交接；保留灵活列、未决选择、来源追踪与引用，不创建专用 storyboard/table/scene/shot 节点。',
          '不得因为内容包含分镜表或 Storyboard 术语就推断专业结构化 authoring；只有用户明确要求创建结构化生产节点时才升级。',
        ];
  }
  if (message.sourceKind === 'markdown') {
    return [
      '不要默认当作普通表格；只有合适时才选择笔记、通用表格、creative table、storyboard profile 或其他 Canvas 工具。',
    ];
  }
  return ['只有合适时才创建或更新 Canvas 节点；也可以解释为什么当前内容不适合 Canvas。'];
}

function projectCanvasAuthoringSourceGuidanceEn(
  message: CanvasAuthoringHandoffRouteMessage,
): readonly string[] {
  if (message.canonicalStoryboard && isExplicitStructuredCanvasHandoffIntent(message.userIntent)) {
    return [
      'This is a canonical Storyboard production handoff; pass canonicalStoryboard from the handoff context unchanged to the existing Canvas storyboard creation capability.',
      'Do not flatten it to an asset batch, reconstruct scene/shot facts from visible Markdown, or drop shot media refs.',
      'Creation must return scene containers and their owned shot child nodes; treat failure or no created refs as blocked.',
    ];
  }
  if (isStoryboardCreativeTableHandoff(message)) {
    return isExplicitStructuredCanvasHandoffIntent(message.userIntent)
      ? [
          'This is explicit professional structured Storyboard authoring; validate the source before creating production scene/shot nodes.',
          'Call canvas.createStoryboardFromMarkdown with profileHint=storyboard, mode=create-nodes, and explicit approval context; do not downgrade to another structured path on failure.',
        ]
      : [
          'This is an ordinary Storyboard Markdown document handoff. Preserve flexible columns, unresolved choices, source trace, and references without creating specialized storyboard/table/scene/shot nodes.',
          'Do not infer professional structured authoring from a table or Storyboard terminology; upgrade only when the user explicitly requests structured production nodes.',
        ];
  }
  if (message.sourceKind === 'markdown') {
    return [
      'Do not assume a generic table; choose a note, generic table, creative table, storyboard profile, or another Canvas tool only when appropriate.',
    ];
  }
  return [
    'Create or update Canvas nodes only when appropriate; otherwise explain why Canvas is not the right target.',
  ];
}

function isStoryboardCreativeTableHandoff(message: CanvasAuthoringHandoffRouteMessage): boolean {
  const targetHints = message.targetHints;
  const declaredProfileHint = targetHints?.declaredProfileHint?.toLowerCase();
  return (
    message.sourceKind === 'markdown' &&
    targetHints?.declaredIntentHint === 'creative-table' &&
    declaredProfileHint === 'storyboard'
  );
}

function isExplicitStructuredCanvasHandoffIntent(userIntent: string | undefined): boolean {
  if (!userIntent) return false;
  const normalized = userIntent.toLowerCase();
  return (
    normalized.includes('structured storyboard') ||
    normalized.includes('structured production') ||
    normalized.includes('production nodes') ||
    normalized.includes('scene/shot nodes') ||
    normalized.includes('professional storyboard') ||
    normalized.includes('结构化 storyboard') ||
    normalized.includes('结构化分镜') ||
    normalized.includes('生产节点') ||
    normalized.includes('scene/shot 节点') ||
    normalized.includes('专业分镜')
  );
}

function formatCanvasAuthoringSourceKindZh(
  sourceKind: CanvasAuthoringHandoffRouteMessage['sourceKind'],
): string {
  switch (sourceKind) {
    case 'markdown':
      return 'Markdown';
    case 'generated-text':
      return '生成文本';
    case 'structured-content':
      return '结构化内容';
    case 'resource-backed-content':
      return '资源关联内容';
  }
}

function formatCanvasAuthoringSourceKindEn(
  sourceKind: CanvasAuthoringHandoffRouteMessage['sourceKind'],
): string {
  switch (sourceKind) {
    case 'markdown':
      return 'Markdown';
    case 'generated-text':
      return 'generated text';
    case 'structured-content':
      return 'structured content';
    case 'resource-backed-content':
      return 'resource-backed content';
  }
}
