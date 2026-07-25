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
  if (message.canonicalStoryboard) {
    return [
      '这是结构化内容交接；Canvas 只允许创建 Markdown、Media、Group、Job、File 和 CanvasEmbed 节点。',
      '将可读内容写入 Markdown；稳定媒体或文件引用使用独立 Media/File 节点，并用 sequence、reference 或 derived-from 连接表达关系。',
      '不得创建 Storyboard、Scene、Shot 或其他专用 Canvas 节点，也不得从 Markdown 推断领域运行时。',
    ];
  }
  if (message.sourceKind === 'markdown') {
    return [
      'Markdown 内容只创建或更新 Markdown 节点；稳定资源应显式创建为 Media/File 节点并通过 canonical 连接关联。',
    ];
  }
  return ['只有合适时才创建或更新 Canvas 节点；也可以解释为什么当前内容不适合 Canvas。'];
}

function projectCanvasAuthoringSourceGuidanceEn(
  message: CanvasAuthoringHandoffRouteMessage,
): readonly string[] {
  if (message.canonicalStoryboard) {
    return [
      'This is a structured-content handoff. Canvas may create only Markdown, Media, Group, Job, File, and CanvasEmbed nodes.',
      'Write readable content to Markdown; project stable media or file references as separate Media/File nodes connected with sequence, reference, or derived-from.',
      'Do not create Storyboard, Scene, Shot, or other specialized Canvas nodes, and do not infer a domain runtime from Markdown.',
    ];
  }
  if (message.sourceKind === 'markdown') {
    return [
      'Markdown content may only create or update Markdown nodes. Project stable resources as explicit Media/File nodes with canonical connections.',
    ];
  }
  return [
    'Create or update Canvas nodes only when appropriate; otherwise explain why Canvas is not the right target.',
  ];
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
