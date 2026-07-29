import * as vscode from 'vscode';
import {
  buildAgentCapabilityLifecycleResultMessage,
  type WebviewToExtensionMessage,
} from '@neko-agent/types';
import {
  createAgentCapabilityLifecycleDiagnostic,
  isAgentCapabilityInvocationResult,
  isCanvasMarkdownCapabilityInput,
  isCanvasMarkdownCapabilityResult,
  validateAgentCapabilityInvocationInput,
  validateAgentCapabilityInvocationResult,
  type CanvasMarkdownCapabilityResult,
  type CanvasMarkdownCapabilityInput,
  type NekoCanvasAPI,
  type AgentCapabilityInvocationInput,
  type AgentCapabilityInvocationResult,
  type AgentCapabilityLifecycleDescriptor,
  type AgentCapabilityLifecyclePhase,
  type AgentCapabilityLifecycleTargetRef,
} from '@neko/shared';
import { buildRuntimePluginSlashCommandDispatch } from '@neko/agent/runtime';
import { getLogger } from '../../base';
import { sendGeneratedAssetToPlugin } from '../../services/pluginTransferBridge';
import type { ChatWebviewMessageRouterDeps } from './types';
import { resolveRequiredConversationId } from './conversationId';

const logger = getLogger('ChatWebviewMessageRouter');

export function tryHandleFileAndPluginRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  switch (message.type) {
    case 'openFile':
      deps.fileOperationHandler.handleOpenFile(message.filePath);
      return true;

    case 'revealDocumentLocator':
      deps.fileOperationHandler.handleRevealDocumentLocator({
        filePath: message.filePath,
        locator: message.locator,
        ...(message.source ? { source: message.source } : {}),
      });
      return true;

    case 'revealFile':
      deps.fileOperationHandler.handleRevealFile(message.filePath);
      return true;

    case 'openConfigFile':
      deps.fileOperationHandler.handleOpenConfigFile();
      return true;

    case 'openUrl':
      deps.fileOperationHandler.handleOpenUrl(message.url);
      return true;

    case 'revealContextSource': {
      const nav = message.navigationData;
      const filePath = nav?.['filePath'] ?? nav?.['path'];
      const resolvedPath = nav?.['resolvedPath'];
      if (message.contextType === 'media' && nav?.['partition'] === 'media-library' && filePath) {
        void vscode.commands.executeCommand(
          'neko.assets.revealMediaLibraryFile',
          resolvedPath ?? filePath,
        );
      } else if (filePath) {
        deps.fileOperationHandler.handleOpenFile(resolvedPath ?? filePath);
      } else if (message.contextType === 'canvas-node' && nav?.['nodeId']) {
        void vscode.commands.executeCommand('neko.canvas.selectNodeFromOutline', nav['nodeId']);
      }
      return true;
    }

    case 'downloadSvg':
      deps.fileOperationHandler.handleDownloadSvg(message.svg, message.filename);
      return true;

    case 'sendToPlugin':
      void sendGeneratedAssetToPlugin(
        message.target,
        message.assetPath,
        message.mediaType,
        message.payload,
      );
      return true;

    case 'invokeAgentCapabilityLifecycle':
      void invokeAgentCapabilityLifecycle(message, deps);
      return true;

    case 'dnd:start':
      deps.dndBroker.setPayload(message.asset);
      return true;

    case 'invokePluginSlashCommand':
      if (!resolveRequiredConversationId(deps.webview, message, 'invoke plugin slash command')) {
        return true;
      }
      const dispatch = buildRuntimePluginSlashCommandDispatch(message);
      vscode.commands
        .executeCommand(dispatch.command, dispatch.invocation)
        .then(undefined, (err) => {
          logger.warn(`Plugin slash command ${message.extensionId}/${message.commandId} failed`, {
            error: err,
          });
        });
      return true;

    default:
      return false;
  }
}

async function invokeAgentCapabilityLifecycle(
  message: Extract<WebviewToExtensionMessage, { type: 'invokeAgentCapabilityLifecycle' }>,
  deps: ChatWebviewMessageRouterDeps,
): Promise<void> {
  try {
    const lifecycleResult = await invokeAgentCapabilityLifecycleBackend(message.invocation, deps);
    const canvasResult = isCanvasMarkdownCapabilityResult(lifecycleResult.data)
      ? lifecycleResult.data
      : undefined;
    await deps.webview.postMessage(
      buildAgentCapabilityLifecycleResultMessage({
        requestId: message.requestId,
        conversationId: message.conversationId,
        success:
          lifecycleResult.status !== 'blocked' && lifecycleResult.status !== 'waiting-approval',
        lifecycleResult,
        ...(canvasResult ? { result: canvasResult } : {}),
      }),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn('Agent capability lifecycle invocation failed', { error });
    await deps.webview.postMessage(
      buildAgentCapabilityLifecycleResultMessage({
        requestId: message.requestId,
        conversationId: message.conversationId,
        success: false,
        error: reason,
        lifecycleResult: createBlockedCanvasMarkdownLifecycleResult(
          message.invocation.capabilityId,
          message.invocation.phase,
          reason,
        ),
      }),
    );
  }
}

async function invokeAgentCapabilityLifecycleBackend(
  invocation: AgentCapabilityInvocationInput,
  deps: ChatWebviewMessageRouterDeps,
): Promise<AgentCapabilityInvocationResult> {
  if (!isCanvasMarkdownLifecycleInvocation(invocation)) {
    return createBlockedCanvasMarkdownLifecycleResult(
      invocation.capabilityId,
      invocation.phase,
      'Agent capability lifecycle backend does not support this capability.',
      'agent-capability-lifecycle-unknown-capability',
      'capabilityId',
    );
  }

  return invokeCanvasMarkdownLifecycleCapability(deps.canvas, invocation, deps);
}

async function invokeCanvasMarkdownLifecycleCapability(
  canvasApi: NekoCanvasAPI,
  sourceInvocation: AgentCapabilityInvocationInput & {
    payload: CanvasMarkdownCapabilityInput;
  },
  deps: ChatWebviewMessageRouterDeps,
): Promise<AgentCapabilityInvocationResult> {
  const input = sourceInvocation.payload;
  const descriptor = deps.resolveLifecycleCapabilityDescriptor?.(input.capabilityId);
  if (!descriptor) {
    return createBlockedCanvasMarkdownLifecycleResult(
      input.capabilityId,
      sourceInvocation.phase,
      'Canvas Markdown lifecycle descriptor is not registered.',
      'agent-capability-lifecycle-unknown-capability',
      'capabilityId',
    );
  }

  const invocation = createCanvasMarkdownLifecycleInvocationInput(
    descriptor,
    input,
    sourceInvocation,
  );
  const inputDiagnostics = validateAgentCapabilityInvocationInput(invocation);
  if (inputDiagnostics.length > 0) {
    return {
      capabilityId: invocation.capabilityId,
      phase: invocation.phase,
      status: 'blocked',
      diagnostics: inputDiagnostics,
    };
  }

  if (!descriptor.phases.includes(invocation.phase)) {
    return createBlockedCanvasMarkdownLifecycleResult(
      invocation.capabilityId,
      invocation.phase,
      'Canvas Markdown lifecycle descriptor does not support the requested phase.',
      'agent-capability-lifecycle-unsupported-phase',
      'phase',
    );
  }

  if (
    isMutatingLifecyclePhase(invocation.phase) &&
    descriptor.requiresApproval &&
    !invocation.approval
  ) {
    return {
      capabilityId: invocation.capabilityId,
      phase: invocation.phase,
      status: 'waiting-approval',
      diagnostics: [
        createAgentCapabilityLifecycleDiagnostic(
          'warning',
          'agent-capability-lifecycle-approval-required',
          'Agent capability lifecycle mutation requires approval before execution.',
          'approval',
        ),
      ],
    };
  }

  const canvasResult: unknown = await canvasApi.markdown.invoke(input);
  if (!isCanvasMarkdownCapabilityResult(canvasResult)) {
    return createBlockedCanvasMarkdownLifecycleResult(
      invocation.capabilityId,
      invocation.phase,
      'Canvas Markdown capability returned an invalid result.',
      'canvas-markdown-invalid-result',
    );
  }
  const missingMutationRef = readMissingCanvasMarkdownMutationRefDiagnostic(canvasResult);
  if (missingMutationRef) {
    return createBlockedCanvasMarkdownLifecycleResult(
      invocation.capabilityId,
      invocation.phase,
      missingMutationRef.message,
      missingMutationRef.code,
    );
  }
  const lifecycleResult = toCanvasMarkdownLifecycleResult(invocation, canvasResult);
  if (isAgentCapabilityInvocationResult(lifecycleResult)) {
    return lifecycleResult;
  }
  return {
    capabilityId: invocation.capabilityId,
    phase: invocation.phase,
    status: 'blocked',
    diagnostics: [
      ...validateAgentCapabilityInvocationResult(lifecycleResult),
      createAgentCapabilityLifecycleDiagnostic(
        'error',
        'agent-capability-lifecycle-result-mismatch',
        'Canvas Markdown lifecycle facade returned an invalid result.',
      ),
    ],
  };
}

function createCanvasMarkdownLifecycleInvocationInput(
  descriptor: AgentCapabilityLifecycleDescriptor,
  input: CanvasMarkdownCapabilityInput,
  sourceInvocation: AgentCapabilityInvocationInput,
): AgentCapabilityInvocationInput {
  const target =
    sourceInvocation.target ??
    ('target' in input && input.target
      ? projectCanvasMarkdownLifecycleTarget(input.target)
      : undefined);
  const provenance =
    sourceInvocation.provenance ??
    ('provenance' in input && input.provenance
      ? {
          source: input.provenance.source,
          conversationId: input.provenance.conversationId,
          messageId: input.provenance.messageId,
          toolCallId: input.provenance.toolCallId,
          label: input.provenance.label,
        }
      : undefined);
  return {
    capabilityId: descriptor.capabilityId,
    phase: sourceInvocation.phase,
    payload: input,
    ...(target ? { target } : {}),
    ...(provenance ? { provenance } : {}),
    ...(sourceInvocation.approval ? { approval: sourceInvocation.approval } : {}),
  };
}

function toCanvasMarkdownLifecycleResult(
  invocation: AgentCapabilityInvocationInput,
  result: CanvasMarkdownCapabilityResult,
): AgentCapabilityInvocationResult {
  return {
    capabilityId: invocation.capabilityId,
    phase: invocation.phase,
    status: toCanvasMarkdownLifecycleStatus(invocation.phase, result.status),
    diagnostics: result.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      ...(diagnostic.fieldKey ? { fieldKey: diagnostic.fieldKey } : {}),
    })),
    ...(result.nodeIds?.length
      ? {
          changedRefs: result.nodeIds.map((nodeId) => ({
            kind: 'node' as const,
            id: nodeId,
            packageId: 'neko-canvas',
          })),
        }
      : {}),
    data: result,
  };
}

function toCanvasMarkdownLifecycleStatus(
  phase: AgentCapabilityLifecyclePhase,
  status: CanvasMarkdownCapabilityResult['status'],
): AgentCapabilityInvocationResult['status'] {
  if (status === 'blocked') return 'blocked';
  if (phase === 'validate') return 'validated';
  if (phase === 'apply') return 'applied';
  if (phase === 'execute') return 'executed';
  if (phase === 'describe') return 'described';
  return status === 'created' || status === 'changed' ? 'needs-review' : 'validated';
}

function projectCanvasMarkdownLifecycleTarget(
  target: NonNullable<CanvasMarkdownCapabilityInput['target']>,
): AgentCapabilityLifecycleTargetRef {
  return {
    packageId: 'neko-canvas',
    ...(target.canvasId ? { canvasId: target.canvasId } : {}),
    ...(target.nodeId ? { nodeId: target.nodeId } : {}),
    ...(target.containerId ? { containerId: target.containerId } : {}),
    ...(target.slotId ? { slotId: target.slotId } : {}),
    ...(target.fieldPath ? { fieldPath: target.fieldPath } : {}),
    ...(target.insertionPoint ? { insertionPoint: target.insertionPoint } : {}),
  };
}

function isCanvasMarkdownLifecycleInvocation(
  invocation: AgentCapabilityInvocationInput,
): invocation is AgentCapabilityInvocationInput & { payload: CanvasMarkdownCapabilityInput } {
  return (
    isCanvasMarkdownCapabilityInput(invocation.payload) &&
    invocation.capabilityId === invocation.payload.capabilityId
  );
}

function isMutatingLifecyclePhase(phase: AgentCapabilityLifecyclePhase): boolean {
  return phase === 'apply' || phase === 'execute';
}

function createBlockedCanvasMarkdownLifecycleResult(
  capabilityId: string,
  phase: AgentCapabilityLifecyclePhase,
  message: string,
  code = 'canvas-markdown-capability-invocation-failed',
  fieldKey?: string,
): AgentCapabilityInvocationResult {
  return {
    capabilityId,
    phase,
    status: 'blocked',
    diagnostics: [createAgentCapabilityLifecycleDiagnostic('error', code, message, fieldKey)],
  };
}

function readMissingCanvasMarkdownMutationRefDiagnostic(
  result: CanvasMarkdownCapabilityResult,
): { readonly code: string; readonly message: string } | undefined {
  if (result.status !== 'created' && result.status !== 'changed') {
    return undefined;
  }
  const hasRef = (result.nodeIds?.length ?? 0) > 0;
  if (hasRef) return undefined;
  return {
    code: 'canvas-markdown-mutation-result-missing-ref',
    message:
      'Canvas Markdown capability reported a mutation status but did not return any Canvas node reference.',
  };
}
