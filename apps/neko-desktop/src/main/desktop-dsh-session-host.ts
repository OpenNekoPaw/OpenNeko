import {
  parseDshSessionHostRequest,
  type DshConversationCreationTarget,
  type DshSessionChangedEvent,
  type DshSessionHostEvent,
  type DshSessionHostProjection,
  type DshSessionHostResult,
  type DshComposerConfigurationHostResult,
} from '@neko/agent-contracts/dsh-session-host';
import { decodeDshAcpJsonPayload } from '@neko/agent-contracts/dsh-acp';
import type {
  ConversationDshSessionBindingStore,
  ConversationDshSessionBoundClient,
} from '@neko/agent-runtime/application';
import type { DshAcpProjection, DshAcpProjectedEvent } from '@neko/agent-runtime/acp';

import type { DesktopSenderIdentity } from './window-registry';

export class DesktopDshSessionHost {
  constructor(
    private readonly options: {
      readonly bindings: Pick<ConversationDshSessionBindingStore, 'getByDshSessionId'>;
      readonly conversations: Pick<
        ConversationDshSessionBoundClient,
        'ensureLoaded' | 'prompt' | 'cancel' | 'setSessionContext'
      >;
      readonly promptContext: { resolve(conversationId: string): Promise<string> };
      readonly composer: {
        project(input: {
          readonly windowId: string;
          readonly workbenchInstanceId: string;
          readonly agentSurfaceId: string;
        }): Promise<DshComposerConfigurationHostResult['configuration']>;
        selectModel(input: {
          readonly windowId: string;
          readonly workbenchInstanceId: string;
          readonly agentSurfaceId: string;
          readonly modelOptionId: string;
        }): Promise<DshComposerConfigurationHostResult['configuration']>;
        selectMediaModel(input: {
          readonly windowId: string;
          readonly workbenchInstanceId: string;
          readonly agentSurfaceId: string;
          readonly category: 'image' | 'video' | 'audio';
          readonly modelOptionId: string;
        }): Promise<DshComposerConfigurationHostResult['configuration']>;
        selectPermissionPreset(input: {
          readonly windowId: string;
          readonly workbenchInstanceId: string;
          readonly agentSurfaceId: string;
          readonly permissionPresetId: string;
        }): Promise<DshComposerConfigurationHostResult['configuration']>;
        applyConversation(conversationId: string, windowId: string): Promise<void>;
      };
      readonly createConversation: (input: {
        readonly windowId: string;
        readonly rendererSessionId: string;
        readonly workbenchInstanceId: string;
        readonly agentSurfaceId: string;
        readonly permissionPresetId: string;
        readonly target: DshConversationCreationTarget;
      }) => Promise<{ readonly conversationId: string }>;
      readonly projection: Pick<DshAcpProjection, 'snapshot'>;
      readonly windows: {
        resolveSender(sender: DesktopSenderIdentity): {
          readonly windowId: string;
          readonly rendererSessionId: string;
        };
      };
      readonly publishChanged: (event: DshSessionChangedEvent) => void;
    },
  ) {}

  async execute(
    sender: DesktopSenderIdentity,
    value: unknown,
  ): Promise<DshSessionHostResult | DshComposerConfigurationHostResult> {
    const request = parseDshSessionHostRequest(value);
    const window = this.options.windows.resolveSender(sender);
    if (
      window.windowId !== request.windowId ||
      window.rendererSessionId !== request.rendererSessionId
    ) {
      throw new Error('DSH Session request does not match its sender-bound renderer session.');
    }
    if (
      request.operation === 'composer-snapshot' ||
      request.operation === 'composer-model' ||
      request.operation === 'composer-media-model' ||
      request.operation === 'composer-permission-preset'
    ) {
      const scope = {
        windowId: request.windowId,
        workbenchInstanceId: request.workbenchInstanceId,
        agentSurfaceId: request.agentSurfaceId,
      };
      const configuration =
        request.operation === 'composer-snapshot'
          ? await this.options.composer.project(scope)
          : request.operation === 'composer-model'
            ? await this.options.composer.selectModel({
                ...scope,
                modelOptionId: request.modelOptionId,
              })
            : request.operation === 'composer-media-model'
              ? await this.options.composer.selectMediaModel({
                  ...scope,
                  category: request.category,
                  modelOptionId: request.modelOptionId,
                })
              : await this.options.composer.selectPermissionPreset({
                  ...scope,
                  permissionPresetId: request.permissionPresetId,
                });
      return { requestId: request.requestId, configuration };
    }
    let stopReason: string | undefined;
    let conversationId: string;
    if (request.operation === 'create') {
      conversationId = (
        await this.options.createConversation({
          windowId: request.windowId,
          rendererSessionId: request.rendererSessionId,
          workbenchInstanceId: request.workbenchInstanceId,
          agentSurfaceId: request.agentSurfaceId,
          permissionPresetId: request.permissionPresetId,
          target: request.target,
        })
      ).conversationId;
    } else if (request.operation === 'prompt') {
      conversationId = request.conversationId;
      await this.options.composer.applyConversation(conversationId, request.windowId);
      const context = await this.options.promptContext.resolve(conversationId);
      await this.options.conversations.setSessionContext(conversationId, context);
      const response = await this.options.conversations.prompt({
        conversationId: request.conversationId,
        prompt: [{ type: 'text', text: request.text }],
      });
      stopReason = response.stopReason;
    } else if (request.operation === 'cancel') {
      conversationId = request.conversationId;
      await this.options.conversations.cancel(request.conversationId);
    } else {
      conversationId = request.conversationId;
    }
    return {
      requestId: request.requestId,
      projection: await this.project(conversationId),
      ...(stopReason === undefined ? {} : { stopReason }),
    };
  }

  async publishChanged(dshSessionId: string): Promise<void> {
    const binding = await this.options.bindings.getByDshSessionId(dshSessionId);
    if (!binding) {
      throw new Error('DSH Session changed event requires a reverse Conversation binding.');
    }
    this.options.publishChanged({ conversationId: binding.conversationId });
  }

  private async project(conversationId: string): Promise<DshSessionHostProjection> {
    const dshSessionId = await this.options.conversations.ensureLoaded(conversationId);
    const snapshot = this.options.projection.snapshot(dshSessionId);
    return {
      conversationId,
      dshSessionId,
      ...(snapshot.currentTurn === undefined ? {} : { currentTurn: snapshot.currentTurn }),
      events: projectEvents(snapshot.events),
    };
  }
}

function projectEvents(events: readonly DshAcpProjectedEvent[]): readonly DshSessionHostEvent[] {
  const projected: DshSessionHostEvent[] = [];
  for (const event of events) {
    if (event.kind !== 'tool') {
      const value = projectEvent(event);
      if (value !== undefined) projected.push(value);
      continue;
    }
    let rawInput;
    let rawOutput;
    try {
      rawInput =
        event.rawInput === undefined
          ? undefined
          : decodeDshAcpJsonPayload(event.rawInput, 'Tool rawInput');
      rawOutput =
        event.rawOutput === undefined
          ? undefined
          : decodeDshAcpJsonPayload(event.rawOutput, 'Tool rawOutput');
    } catch (error) {
      projected.push({
        kind: 'diagnostic',
        code: 'ACP_TOOL_PAYLOAD_INVALID',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    projected.push({
      kind: 'tool',
      toolCallId: event.toolCallId,
      turn: event.turn,
      status: event.status,
      ...(event.title === undefined ? {} : { title: event.title }),
      ...(rawInput === undefined ? {} : { rawInput }),
      ...(rawOutput === undefined ? {} : { rawOutput }),
    });
  }
  return projected;
}

function projectEvent(event: DshAcpProjectedEvent): DshSessionHostEvent | undefined {
  switch (event.kind) {
    case 'message':
      return {
        kind: 'message',
        role: event.role,
        text: event.text,
        ...(event.messageId === undefined ? {} : { messageId: event.messageId }),
      };
    case 'tool':
      throw new Error('Tool events must be projected through the bounded payload path.');
    case 'turn':
      return {
        kind: 'turn',
        turn: event.turn,
        phase: event.phase,
        ...(event.reason === undefined ? {} : { reason: event.reason }),
      };
    case 'cancel':
      return {
        kind: 'cancel',
        ...(event.turn === undefined ? {} : { turn: event.turn }),
        ...(event.toolCallId === undefined ? {} : { toolCallId: event.toolCallId }),
      };
    case 'diagnostic':
      return { kind: 'diagnostic', code: event.code, message: event.message };
    case 'permission':
      return undefined;
  }
}
