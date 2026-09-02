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
  type DshComposerSubmitInput,
  type DshComposerImageInput,
  type DshImageAttachmentPreviewHostResult,
  type DshImageAttachmentPreviewsReleaseHostResult,
  type DshTerminalArtifactOpenHostResult,
  type DshSessionTerminalArtifactReference,
  type DshSessionImageAttachmentIdentity,
  type DshSessionToolContentBlock,
} from '@neko/agent-contracts/dsh-session-host';
import {
  decodeDshAcpImageAttachmentRefProjection,
  decodeDshAcpJsonPayload,
  type DshAcpImageAttachmentRefProjection,
  type DshAcpTurnConfiguration,
} from '@neko/agent-contracts/dsh-acp';
import type {
  AgentPromptImage,
  ConversationDshSessionBindingStore,
  ConversationDshSessionBoundClient,
  DshConversationCatalogStore,
  DshTurnCanvasTargetOwner,
  DshCanvasArtifactDeliveryService,
} from '@neko/agent-runtime/application';
import {
  AgentTerminalMarkdownContractError,
  createAgentTerminalArtifactAdmission,
  parseAgentTerminalMarkdown,
} from '@neko/agent-runtime/application';
import type {
  DshAcpProjection,
  DshAcpProjectedDisplayBlock,
  DshAcpProjectedEvent,
} from '@neko/agent-runtime/acp';
import type { CanvasWorkspaceTurnTarget } from '@neko/canvas-domain';
import {
  isWorkspaceFileContentLocator,
  validateContentLocator,
  type ContentLocator,
} from '@neko/content-domain';

import type { DesktopSenderIdentity } from './window-registry';

export class DesktopDshSessionHost {
  constructor(
    private readonly options: {
      readonly bindings: Pick<ConversationDshSessionBindingStore, 'getByDshSessionId'>;
      readonly catalog: Pick<DshConversationCatalogStore, 'get'>;
      readonly conversations: Pick<
        ConversationDshSessionBoundClient,
        | 'ensureLoaded'
        | 'prompt'
        | 'cancel'
        | 'setSessionContext'
        | 'executeCommand'
        | 'invokeSkill'
        | 'readInbox'
        | 'readImageAttachment'
        | 'enqueueInboxMessage'
        | 'sendInboxMessageNow'
        | 'removeInboxMessage'
      >;
      readonly turnCanvasTargets: Pick<
        DshTurnCanvasTargetOwner,
        | 'admit'
        | 'bindQueuedMessage'
        | 'prioritizeQueuedMessage'
        | 'releaseAdmission'
        | 'releaseQueuedMessage'
      >;
      readonly imagePreviews: {
        project(input: {
          readonly windowId: string;
          readonly rendererSessionId: string;
          readonly conversationId: string;
          readonly attachment: DshSessionImageAttachmentIdentity;
          readonly read: (signal: AbortSignal) => Promise<Uint8Array>;
        }): DshImageAttachmentPreviewHostResult['preview'];
        release(windowId: string, conversationId: string): void;
      };
      readonly promptContext: {
        resolve(
          conversationId: string,
          selectedContextPayloads?: readonly import('@neko/agent-contracts').AgentContextPayload[],
          selectedResources?: readonly {
            readonly label: string;
            readonly contentLocator: import('@neko/content-domain').ContentLocator;
          }[],
          canvasTurnTarget?: CanvasWorkspaceTurnTarget,
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
        bindTurnConfiguration(
          conversationId: string,
          windowId: string,
          running: boolean,
        ): Promise<{
          readonly supportsImageInput: boolean;
          readonly configuration: DshAcpTurnConfiguration;
        }>;
      };
      readonly promptImages: {
        admit(input: {
          readonly conversationId: string;
          readonly windowId: string;
          readonly references: readonly {
            readonly label: string;
            readonly contentLocator: ContentLocator;
          }[];
          readonly images: readonly DshComposerImageInput[];
          readonly modelSupportsImageInput: boolean;
        }): Promise<readonly AgentPromptImage[]>;
      };
      readonly terminalArtifacts: Pick<DshCanvasArtifactDeliveryService, 'resolveTerminalArtifact'>;
      readonly openTerminalArtifact: (input: {
        readonly windowId: string;
        readonly rendererSessionId: string;
        readonly conversationId: string;
        readonly messageId: string;
        readonly reference: DshSessionTerminalArtifactReference;
      }) => Promise<void>;
      readonly createConversation: (input: {
        readonly requestId: string;
        readonly windowId: string;
        readonly rendererSessionId: string;
        readonly workbenchInstanceId: string;
        readonly agentSurfaceId: string;
        readonly permissionPresetId: string;
        readonly target: DshConversationCreationTarget;
        readonly initialInput: DshComposerSubmitInput;
      }) => Promise<{
        readonly conversationId: string;
        readonly completeInitialTurn?: () => Promise<void>;
      }>;
      readonly domainTurns?: {
        submit(input: {
          readonly requestId: string;
          readonly conversationId: string;
          readonly windowId: string;
          readonly running: boolean;
          readonly input: DshComposerSubmitInput;
        }): Promise<boolean>;
      };
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
    | DshImageAttachmentPreviewHostResult
    | DshImageAttachmentPreviewsReleaseHostResult
    | DshTerminalArtifactOpenHostResult
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
    if (request.operation === 'image-previews-release') {
      this.options.imagePreviews.release(request.windowId, request.conversationId);
      return { requestId: request.requestId, released: true };
    }
    if (request.operation === 'image-preview') {
      const dshSessionId = await this.options.conversations.ensureLoaded(request.conversationId);
      const attachment = findProjectedImageAttachment(
        projectEvents(this.options.projection.snapshot(dshSessionId).events, false),
        request.attachmentId,
      );
      const preview = this.options.imagePreviews.project({
        windowId: request.windowId,
        rendererSessionId: request.rendererSessionId,
        conversationId: request.conversationId,
        attachment,
        read: async (signal) => {
          if (signal.aborted) throw signal.reason;
          const stored = await this.options.conversations.readImageAttachment(
            request.conversationId,
            request.attachmentId,
          );
          assertImageAttachmentMatches(attachment, stored.attachment);
          const bytes = Buffer.from(stored.data, 'base64');
          if (signal.aborted) throw signal.reason;
          if (bytes.byteLength !== attachment.byteLength) {
            throw new Error(
              `DSH image attachment '${attachment.attachmentId}' returned an invalid byte length.`,
            );
          }
          return bytes;
        },
      });
      return { requestId: request.requestId, preview };
    }
    if (request.operation === 'terminal-artifact-open') {
      const dshSessionId = await this.options.conversations.ensureLoaded(request.conversationId);
      const snapshot = this.options.projection.snapshot(dshSessionId);
      const resolved = await this.options.terminalArtifacts.resolveTerminalArtifact({
        conversationId: request.conversationId,
        dshSessionId,
        messageId: request.messageId,
        events: snapshot.events,
      });
      if (
        resolved === undefined ||
        !isWorkspaceFileContentLocator(resolved.contentLocator) ||
        resolved.contentLocator.selector !== undefined
      ) {
        throw new Error(
          `DSH terminal artifact '${request.messageId}' is unavailable for the exact Conversation.`,
        );
      }
      await this.options.openTerminalArtifact({
        windowId: request.windowId,
        rendererSessionId: request.rendererSessionId,
        conversationId: request.conversationId,
        messageId: request.messageId,
        reference: {
          kind: 'reviewable-markdown',
          title: resolved.title,
          contentLocator: resolved.contentLocator,
        },
      });
      return { requestId: request.requestId, opened: true };
    }
    let stopReason: string | undefined;
    let conversationId: string;
    if (request.operation === 'create') {
      const created = await this.options.createConversation({
        requestId: request.requestId,
        windowId: request.windowId,
        rendererSessionId: request.rendererSessionId,
        workbenchInstanceId: request.workbenchInstanceId,
        agentSurfaceId: request.agentSurfaceId,
        permissionPresetId: request.permissionPresetId,
        target: request.target,
        initialInput: request.initialInput,
      });
      conversationId = created.conversationId;
      stopReason = await this.submitInput(
        request.requestId,
        conversationId,
        request.windowId,
        request.initialInput,
      );
      await created.completeInitialTurn?.();
    } else if (request.operation === 'submit') {
      conversationId = request.conversationId;
      stopReason = await this.submitInput(
        request.requestId,
        conversationId,
        request.windowId,
        request.input,
      );
    } else if (request.operation === 'cancel') {
      conversationId = request.conversationId;
      await this.options.conversations.cancel(request.conversationId);
    } else if (request.operation === 'inbox-send-now') {
      conversationId = request.conversationId;
      const priority = this.options.turnCanvasTargets.prioritizeQueuedMessage(request.messageId);
      try {
        await this.options.conversations.sendInboxMessageNow({
          conversationId,
          messageId: request.messageId,
        });
      } catch (error) {
        priority.rollback();
        throw error;
      }
    } else if (request.operation === 'inbox-remove') {
      conversationId = request.conversationId;
      await this.options.conversations.removeInboxMessage({
        conversationId,
        messageId: request.messageId,
      });
      this.options.turnCanvasTargets.releaseQueuedMessage(request.messageId);
    } else {
      conversationId = request.conversationId;
    }
    if (request.operation === 'snapshot') {
      await this.options.composer.applyConversation(conversationId, request.windowId);
    }
    return {
      requestId: request.requestId,
      projection: await this.project(conversationId),
      ...(stopReason === undefined ? {} : { stopReason }),
    };
  }

  private async submitInput(
    requestId: string,
    conversationId: string,
    windowId: string,
    input: DshComposerSubmitInput,
  ): Promise<string | undefined> {
    const dshSessionId = await this.options.conversations.ensureLoaded(conversationId);
    const isRunning = this.options.projection.snapshot(dshSessionId).currentTurn !== undefined;
    if (
      (await this.options.domainTurns?.submit({
        requestId,
        conversationId,
        windowId,
        running: isRunning,
        input,
      })) === true
    ) {
      return undefined;
    }
    if (isRunning && input.kind !== 'message') {
      throw new Error('Only ordinary messages can enter a running DSH Session inbox.');
    }
    if (input.kind === 'command') {
      await this.options.conversations.executeCommand(conversationId, input.line);
      return undefined;
    }

    const admission = this.options.turnCanvasTargets.admit(dshSessionId, input.canvasTurnTarget);
    let retainAdmission = false;
    try {
      const boundTurn = await this.options.composer.bindTurnConfiguration(
        conversationId,
        windowId,
        isRunning,
      );
      const context = await this.options.promptContext.resolve(
        conversationId,
        input.kind === 'message' ? input.contextPayloads : [],
        input.kind === 'message'
          ? input.references.map((reference) => ({
              label: reference.label,
              contentLocator: reference.contentLocator,
            }))
          : [],
        input.canvasTurnTarget,
      );
      if (input.kind === 'skills') {
        await this.options.conversations.setSessionContext(conversationId, context);
        const response = await this.options.conversations.invokeSkill({
          conversationId,
          invocations: input.invocations,
          displayText: input.displayText,
          promptText: input.promptText,
        });
        retainAdmission = true;
        return response.stopReason;
      }

      const images = await this.options.promptImages.admit({
        conversationId,
        windowId,
        references: input.references,
        images: input.images,
        modelSupportsImageInput: boundTurn.supportsImageInput,
      });
      const imageByReferenceIndex = new Map(
        images.flatMap((image) =>
          image.source.kind === 'reference' ? [[image.source.referenceIndex, image] as const] : [],
        ),
      );
      const imageByInlineIndex = new Map(
        images.flatMap((image) =>
          image.source.kind === 'inline' ? [[image.source.imageIndex, image] as const] : [],
        ),
      );
      const prompt = [
        ...(input.text.length === 0 ? [] : [{ type: 'text' as const, text: input.text }]),
        ...input.images.map((image, imageIndex) => {
          const admitted = imageByInlineIndex.get(imageIndex);
          if (admitted === undefined) {
            throw new Error(`DSH Prompt inline image ${imageIndex} was not admitted.`);
          }
          return {
            type: 'image' as const,
            data: admitted.data,
            mimeType: admitted.mimeType,
            _meta: { opennekoDisplayName: image.name },
          };
        }),
        ...input.references.flatMap((reference, referenceIndex) => {
          const image = imageByReferenceIndex.get(referenceIndex);
          return [
            {
              type: 'resource_link' as const,
              name: reference.label,
              uri: serializeContentLocatorResourceUri(reference.contentLocator),
            },
            ...(image === undefined
              ? []
              : [{ type: 'image' as const, data: image.data, mimeType: image.mimeType }]),
          ];
        }),
      ];
      if (isRunning) {
        const before = await this.options.conversations.readInbox(conversationId);
        const after = await this.options.conversations.enqueueInboxMessage({
          conversationId,
          prompt,
          displayContent: [
            ...(input.text.length === 0 ? [] : [{ type: 'text' as const, text: input.text }]),
            ...input.images.map((image) => ({ type: 'image' as const, name: image.name })),
            ...input.references.map((reference) => ({
              type: 'resource-link' as const,
              name: reference.label,
              uri: serializeContentLocatorResourceUri(reference.contentLocator),
            })),
          ],
          contextText: context,
          configuration: boundTurn.configuration,
        });
        const messageId = resolveNewNextTurnMessageId(before, after);
        this.options.turnCanvasTargets.bindQueuedMessage(admission.admissionId, messageId);
        retainAdmission = true;
        return undefined;
      }

      await this.options.conversations.setSessionContext(conversationId, context);
      const response = await this.options.conversations.prompt({ conversationId, prompt });
      retainAdmission = true;
      return response.stopReason;
    } finally {
      if (!retainAdmission) {
        this.options.turnCanvasTargets.releaseAdmission(admission.admissionId);
      }
    }
  }

  async publishChanged(dshSessionId: string): Promise<void> {
    const binding = await this.options.bindings.getByDshSessionId(dshSessionId);
    if (!binding) {
      throw new Error('DSH Session changed event requires a reverse Conversation binding.');
    }
    this.options.publishChanged({ conversationId: binding.conversationId });
  }

  private async project(conversationId: string): Promise<DshSessionHostProjection> {
    const record = await this.options.catalog.get(conversationId);
    if (record === undefined) {
      throw new Error(`Agent Conversation '${conversationId}' is missing from the catalog.`);
    }
    const dshSessionId = await this.options.conversations.ensureLoaded(conversationId);
    const snapshot = this.options.projection.snapshot(dshSessionId);
    const inbox = await this.options.conversations.readInbox(conversationId);
    const terminalArtifacts = new Map<string, DshSessionTerminalArtifactReference>();
    const terminalArtifactDiagnostics = new Map<string, string>();
    if (record.context.kind === 'workspace') {
      for (const event of snapshot.events) {
        if (event.kind !== 'message' || event.role !== 'assistant' || event.state !== 'final') {
          continue;
        }
        try {
          const resolved = await this.options.terminalArtifacts.resolveTerminalArtifact({
            conversationId,
            dshSessionId,
            messageId: event.messageId,
            events: snapshot.events,
          });
          if (resolved === undefined) continue;
          if (
            !isWorkspaceFileContentLocator(resolved.contentLocator) ||
            resolved.contentLocator.selector !== undefined
          ) {
            throw new Error('Terminal artifact resolution returned a non-file ContentLocator.');
          }
          terminalArtifacts.set(event.messageId, {
            kind: 'reviewable-markdown',
            title: resolved.title,
            contentLocator: resolved.contentLocator,
          });
        } catch (error) {
          terminalArtifactDiagnostics.set(
            event.messageId,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }
    return {
      conversationId,
      dshSessionId,
      title: record.title,
      ...(snapshot.currentTurn === undefined ? {} : { currentTurn: snapshot.currentTurn }),
      ...(snapshot.contextPressure === undefined
        ? {}
        : { contextPressure: snapshot.contextPressure }),
      inbox,
      todos: snapshot.todos,
      events: projectEvents(
        snapshot.events,
        record.context.kind === 'workspace',
        terminalArtifacts,
        terminalArtifactDiagnostics,
      ),
    };
  }
}

function resolveNewNextTurnMessageId(
  before: import('@neko/agent-contracts/dsh-acp').DshAcpInboxSnapshot,
  after: import('@neko/agent-contracts/dsh-acp').DshAcpInboxSnapshot,
): string {
  const existing = new Set(before.nextTurn.map((message) => message.messageId));
  const added = after.nextTurn.filter((message) => !existing.has(message.messageId));
  if (added.length !== 1) {
    throw new Error('DSH Inbox enqueue did not create one exact next-turn message identity.');
  }
  const [message] = added;
  if (message === undefined) {
    throw new Error('DSH Inbox enqueue did not expose the created next-turn message identity.');
  }
  return message.messageId;
}

function serializeContentLocatorResourceUri(
  locator: import('@neko/content-domain').ContentLocator,
): string {
  return `openneko-content:${encodeURIComponent(JSON.stringify(locator))}`;
}

function projectEvents(
  events: readonly DshAcpProjectedEvent[],
  admitsTerminalArtifact: boolean,
  terminalArtifacts: ReadonlyMap<string, DshSessionTerminalArtifactReference> = new Map(),
  terminalArtifactDiagnostics: ReadonlyMap<string, string> = new Map(),
): readonly DshSessionHostEvent[] {
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
      if (
        admitsTerminalArtifact &&
        event.kind === 'message' &&
        event.role === 'assistant' &&
        event.state === 'final'
      ) {
        try {
          const terminal = parseAgentTerminalMarkdown(
            event.text,
            createAgentTerminalArtifactAdmission(),
          );
          const value = projectEvent(
            { ...event, text: terminal.summaryMarkdown },
            terminalArtifacts.get(event.messageId),
            terminal.recommendedNextActionMarkdown,
          );
          if (value !== undefined) projected.push(value);
          const artifactDiagnostic = terminalArtifactDiagnostics.get(event.messageId);
          if (artifactDiagnostic !== undefined) {
            projected.push({
              kind: 'diagnostic',
              code: 'AGENT_TERMINAL_ARTIFACT_REFERENCE_UNAVAILABLE',
              message: artifactDiagnostic,
            });
          }
        } catch (error) {
          const value = projectEvent(event);
          if (value !== undefined) projected.push(value);
          projected.push({
            kind: 'diagnostic',
            code:
              error instanceof AgentTerminalMarkdownContractError
                ? error.code
                : 'AGENT_TERMINAL_ARTIFACT_PROJECTION_FAILED',
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
    let content: DshSessionToolContentBlock[] | undefined;
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
    if (event.content !== undefined) {
      content = [];
      for (const [index, block] of event.content.entries()) {
        try {
          const value = projectToolContentBlock(block);
          if (value !== undefined) content.push(value);
        } catch (error) {
          projected.push({
            kind: 'diagnostic',
            code: 'ACP_TOOL_CONTENT_INVALID',
            message: `Tool content block ${index} is invalid: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    }
    projected.push({
      kind: 'tool',
      toolCallId: event.toolCallId,
      turn: event.turn,
      status: event.status,
      ...(event.title === undefined ? {} : { title: event.title }),
      ...(content === undefined || content.length === 0 ? {} : { content }),
      ...(rawInput === undefined ? {} : { rawInput }),
      ...(rawOutput === undefined ? {} : { rawOutput }),
    });
  }
  return projected;
}

function projectToolContentBlock(
  block: DshAcpProjectedDisplayBlock,
): DshSessionToolContentBlock | undefined {
  if (block.type === 'text') return block.text.length === 0 ? undefined : block;
  const attachment = deserializeDshAttachmentResourceUri(block.uri);
  return attachment === undefined ? undefined : { type: 'image', label: block.name, attachment };
}

function projectEvent(
  event: DshAcpProjectedEvent,
  artifact?: DshSessionTerminalArtifactReference,
  recommendedNextActionMarkdown?: string,
): DshSessionHostEvent | undefined {
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
        ...(artifact === undefined ? {} : { artifact }),
        ...(recommendedNextActionMarkdown === undefined ? {} : { recommendedNextActionMarkdown }),
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
    content: event.content.map((block) => {
      if (block.type === 'text') return { type: 'text' as const, text: block.text };
      const attachment = deserializeDshAttachmentResourceUri(block.uri);
      return attachment === undefined
        ? {
            type: 'resource' as const,
            label: block.name,
            contentLocator: deserializeContentLocatorResourceUri(block.uri),
          }
        : { type: 'image' as const, label: block.name, attachment };
    }),
    ...(event.messageId === undefined ? {} : { messageId: event.messageId }),
  };
}

function deserializeDshAttachmentResourceUri(
  uri: string,
): DshSessionImageAttachmentIdentity | undefined {
  const prefix = 'openneko-dsh-attachment:';
  if (!uri.startsWith(prefix)) return undefined;
  if (uri.length === prefix.length) {
    throw new Error('ACP DSH attachment resource has no reference.');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(decodeURIComponent(uri.slice(prefix.length)));
  } catch (error) {
    throw new Error('ACP DSH attachment resource reference is invalid.', { cause: error });
  }
  const ref = decodeDshAcpImageAttachmentRefProjection(decoded);
  return {
    attachmentId: ref.attachmentId,
    mediaType: ref.mediaType,
    byteLength: ref.bytes,
    width: ref.width,
    height: ref.height,
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

function findProjectedImageAttachment(
  events: readonly DshSessionHostEvent[],
  attachmentId: string,
): DshSessionImageAttachmentIdentity {
  for (const event of events) {
    const content =
      event.kind === 'message' && event.role === 'user'
        ? event.content
        : event.kind === 'tool'
          ? event.content
          : undefined;
    if (content === undefined) continue;
    const image = content.find(
      (block) => block.type === 'image' && block.attachment.attachmentId === attachmentId,
    );
    if (image?.type === 'image') return image.attachment;
  }
  throw new Error(
    `DSH image attachment '${attachmentId}' is not projected by the exact Conversation.`,
  );
}

function assertImageAttachmentMatches(
  expected: DshSessionImageAttachmentIdentity,
  actual: DshAcpImageAttachmentRefProjection,
): void {
  if (
    actual.attachmentId !== expected.attachmentId ||
    actual.mediaType !== expected.mediaType ||
    actual.bytes !== expected.byteLength ||
    actual.width !== expected.width ||
    actual.height !== expected.height
  ) {
    throw new Error(
      `DSH image attachment '${expected.attachmentId}' changed across the preview boundary.`,
    );
  }
}
