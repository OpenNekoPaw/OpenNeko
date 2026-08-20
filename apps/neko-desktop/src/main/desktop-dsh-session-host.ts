import {
  parseDshSessionHostRequest,
  type DshConversationCreationTarget,
  type DshSessionChangedEvent,
  type DshSessionHostEvent,
  type DshSessionHostProjection,
  type DshSessionHostResult,
  type DshComposerConfigurationHostResult,
  type DshComposerMentionsHostResult,
  type DshComposerMaterializedAssetHostResult,
} from '@neko/agent-contracts/dsh-session-host';
import { decodeDshAcpJsonPayload } from '@neko/agent-contracts/dsh-acp';
import type {
  ConversationDshSessionBindingStore,
  ConversationDshSessionBoundClient,
} from '@neko/agent-runtime/application';
import type { DshAcpProjection, DshAcpProjectedEvent } from '@neko/agent-runtime/acp';
import { validateContentLocator, type ContentLocator } from '@neko/content';

import type { DesktopSenderIdentity } from './window-registry';

export class DesktopDshSessionHost {
  constructor(
    private readonly options: {
      readonly bindings: Pick<ConversationDshSessionBindingStore, 'getByDshSessionId'>;
      readonly conversations: Pick<
        ConversationDshSessionBoundClient,
        | 'ensureLoaded'
        | 'prompt'
        | 'cancel'
        | 'setSessionContext'
        | 'executeCommand'
        | 'invokeSkill'
      >;
      readonly promptContext: {
        resolve(
          conversationId: string,
          selectedContextPayloads?: readonly import('@neko/agent-contracts').AgentContextPayload[],
          selectedResources?: readonly {
            readonly label: string;
            readonly contentLocator: import('@neko/content').ContentLocator;
          }[],
        ): Promise<string>;
      };
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
        searchMentions(input: {
          readonly windowId: string;
          readonly workbenchInstanceId: string;
          readonly agentSurfaceId: string;
          readonly filter: string;
        }): Promise<DshComposerMentionsHostResult['mentions']>;
        materializeAsset(input: {
          readonly windowId: string;
          readonly workbenchInstanceId: string;
          readonly agentSurfaceId: string;
          readonly assetId: string;
        }): Promise<DshComposerMaterializedAssetHostResult['materialized']>;
        applyConversation(
          conversationId: string,
          windowId: string,
        ): Promise<{ readonly supportsImageInput: boolean }>;
      };
      readonly promptImages: {
        admit(input: {
          readonly conversationId: string;
          readonly windowId: string;
          readonly references: readonly {
            readonly label: string;
            readonly contentLocator: ContentLocator;
          }[];
          readonly modelSupportsImageInput: boolean;
        }): Promise<
          readonly {
            readonly referenceIndex: number;
            readonly data: string;
            readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
          }[]
        >;
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
  ): Promise<
    | DshSessionHostResult
    | DshComposerConfigurationHostResult
    | DshComposerMentionsHostResult
    | DshComposerMaterializedAssetHostResult
  > {
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
      request.operation === 'composer-mentions' ||
      request.operation === 'composer-materialize-asset' ||
      request.operation === 'composer-model' ||
      request.operation === 'composer-media-model' ||
      request.operation === 'composer-permission-preset'
    ) {
      const scope = {
        windowId: request.windowId,
        workbenchInstanceId: request.workbenchInstanceId,
        agentSurfaceId: request.agentSurfaceId,
      };
      if (request.operation === 'composer-mentions') {
        return {
          requestId: request.requestId,
          mentions: await this.options.composer.searchMentions({
            ...scope,
            filter: request.filter,
          }),
        };
      }
      if (request.operation === 'composer-materialize-asset') {
        return {
          requestId: request.requestId,
          materialized: await this.options.composer.materializeAsset({
            ...scope,
            assetId: request.assetId,
          }),
        };
      }
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
    } else if (request.operation === 'submit') {
      conversationId = request.conversationId;
      if (request.input.kind === 'command') {
        await this.options.conversations.executeCommand(conversationId, request.input.line);
      } else {
        const appliedModel = await this.options.composer.applyConversation(
          conversationId,
          request.windowId,
        );
        const context = await this.options.promptContext.resolve(
          conversationId,
          request.input.kind === 'message' ? request.input.contextPayloads : [],
          request.input.kind === 'message'
            ? request.input.references.map((reference) => ({
                label: reference.label,
                contentLocator: reference.contentLocator,
              }))
            : [],
        );
        if (request.input.kind === 'skill') {
          await this.options.conversations.setSessionContext(conversationId, context);
          const response = await this.options.conversations.invokeSkill({
            conversationId,
            skillName: request.input.skillName,
            displayText: request.input.displayText,
            ...(request.input.args === undefined ? {} : { args: request.input.args }),
          });
          stopReason = response.stopReason;
        } else {
          const images = await this.options.promptImages.admit({
            conversationId,
            windowId: request.windowId,
            references: request.input.references,
            modelSupportsImageInput: appliedModel.supportsImageInput,
          });
          const imageByReferenceIndex = new Map(
            images.map((image) => [image.referenceIndex, image] as const),
          );
          await this.options.conversations.setSessionContext(conversationId, context);
          const response = await this.options.conversations.prompt({
            conversationId,
            prompt: [
              ...(request.input.text.length === 0
                ? []
                : [{ type: 'text' as const, text: request.input.text }]),
              ...request.input.references.flatMap((reference, referenceIndex) => {
                const image = imageByReferenceIndex.get(referenceIndex);
                return [
                  {
                    type: 'resource_link' as const,
                    name: reference.label,
                    uri: serializeContentLocatorResourceUri(reference.contentLocator),
                  },
                  ...(image === undefined
                    ? []
                    : [
                        {
                          type: 'image' as const,
                          data: image.data,
                          mimeType: image.mimeType,
                        },
                      ]),
                ];
              }),
            ],
          });
          stopReason = response.stopReason;
        }
      }
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

function serializeContentLocatorResourceUri(
  locator: import('@neko/content').ContentLocator,
): string {
  return `openneko-content:${encodeURIComponent(JSON.stringify(locator))}`;
}

function projectEvents(events: readonly DshAcpProjectedEvent[]): readonly DshSessionHostEvent[] {
  const projected: DshSessionHostEvent[] = [];
  for (const event of events) {
    if (event.kind !== 'tool') {
      if (event.kind === 'message' && event.role === 'user') {
        try {
          projected.push(projectUserMessageEvent(event));
        } catch (error) {
          projected.push({
            kind: 'diagnostic',
            code: 'ACP_RESOURCE_LINK_INVALID',
            message: error instanceof Error ? error.message : String(error),
          });
        }
        continue;
      }
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
      if (event.role === 'user') {
        throw new Error(
          'User messages must be projected through the resource validation boundary.',
        );
      }
      return {
        kind: 'message',
        role: 'assistant',
        turn: event.turn,
        step: event.step,
        text: event.text,
        messageId: event.messageId,
        state: event.state,
      };
    case 'thought':
      return {
        kind: 'thought',
        turn: event.turn,
        step: event.step,
        text: event.text,
        messageId: event.messageId,
        state: event.state,
      };
    case 'tool':
      throw new Error('Tool events must be projected through the bounded payload path.');
    case 'command':
      return {
        kind: 'command',
        commandId: event.commandId,
        name: event.name,
        ...(event.args === undefined ? {} : { args: event.args }),
        status: event.status,
        ...(event.text === undefined ? {} : { text: event.text }),
      };
    case 'turn':
      return event.phase === 'start'
        ? {
            kind: 'turn',
            turn: event.turn,
            phase: 'start',
            startedAt: event.startedAt,
          }
        : {
            kind: 'turn',
            turn: event.turn,
            phase: 'end',
            startedAt: event.startedAt,
            completedAt: event.completedAt,
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

function projectUserMessageEvent(
  event: Extract<DshAcpProjectedEvent, { readonly kind: 'message'; readonly role: 'user' }>,
): Extract<DshSessionHostEvent, { readonly kind: 'message'; readonly role: 'user' }> {
  return {
    kind: 'message',
    role: 'user',
    content: event.content.map((block) =>
      block.type === 'text'
        ? { type: 'text' as const, text: block.text }
        : {
            type: 'resource' as const,
            label: block.name,
            contentLocator: deserializeContentLocatorResourceUri(block.uri),
          },
    ),
    ...(event.messageId === undefined ? {} : { messageId: event.messageId }),
  };
}

function deserializeContentLocatorResourceUri(uri: string): ContentLocator {
  const prefix = 'openneko-content:';
  if (!uri.startsWith(prefix) || uri.length === prefix.length) {
    throw new Error('ACP resource link does not use the OpenNeko content scheme.');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(decodeURIComponent(uri.slice(prefix.length)));
  } catch (error) {
    throw new Error('ACP resource link contains an invalid encoded ContentLocator.', {
      cause: error,
    });
  }
  const validation = validateContentLocator(decoded);
  if (!validation.ok) {
    throw new Error(
      `ACP resource link contains an invalid ContentLocator: ${validation.diagnostics.map((item) => item.code).join(', ')}.`,
    );
  }
  return validation.locator;
}
