/**
 * useChatActions - Chat message sending, cancellation, and copy
 *
 * Sends messages directly to Extension; compatible text sends are queued by the runtime.
 * Model configuration is locked for the duration of a running Agent turn.
 */

import {
  useCallback,
  useRef,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
} from 'react';
import {
  Message,
  type MessageContextReference,
  type AgentLlmConfig,
  type AgentFlatPurposeModelRefs,
  type AgentModelSlots,
  type MediaUnderstandingModelSelections,
  type MessageModelProjection,
  type SessionMode,
  type TabType,
} from '@neko-agent/types';
import { AgentHostMessages } from '@/messages';
import type {
  MessageAttachment,
  SelectedFileReference,
} from '@/components/ChatView/InputArea/types';
import {
  getBuiltinSlashCommand,
  normalizeSlashCommandName,
  parseAgentInputTrigger,
  type AgentMediaModelSelections,
} from '@neko-agent/types';
import { projectMessageModelSelection } from '../presenters/config-message-presenter';
import { projectContextReferencesFromPayloads } from '../presenters/context-reference-presenter';
import { toAttachmentTypeFromPathReference } from '../presenters/reference-token-presenter';
import { isDocumentFile, type AgentContextPayload, type ChatModelOption } from '@neko/shared';

/** Per-category resolved media model for agent mode */
export type AgentMediaModels = AgentMediaModelSelections;

export interface PendingSendInput {
  messageText?: string;
  displayMessageText?: string;
  sessionMode?: SessionMode;
  attachments?: MessageAttachment[];
  contextPayloads?: AgentContextPayload[];
  fileReferences?: SelectedFileReference[];
  agentModels?: AgentModelSlots;
  understandingModels?: MediaUnderstandingModelSelections;
  llmConfig?: AgentLlmConfig;
}

export interface UseChatActionsProps {
  inputValue: string;
  isThinking: boolean;
  isCharacterRoleSession?: boolean;
  selectedModel: string;
  availableModels?: readonly ChatModelOption[];
  sessionMode?: SessionMode;
  mediaProviderId?: string;
  mediaModelId?: string;
  /** Per-category media models for agent mode (overrides mediaModelId when set) */
  agentMediaModels?: AgentMediaModels;
  /** Per-category media understanding models for the current webview session. */
  understandingModels?: MediaUnderstandingModelSelections;
  activeConversationId: string | null;
  activeConversationIdRef: MutableRefObject<string | null>;
  isConversationSwitching?: boolean;
  streamingMessageIdRef: MutableRefObject<string | null>;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setStreamingMessageId: Dispatch<SetStateAction<string | null>>;
  setActiveTab: Dispatch<SetStateAction<TabType>>;

  clearInput: () => void;
  setAttachedFiles: (files: MessageAttachment[]) => void;
  setSelectedFileReferences?: (references: SelectedFileReference[]) => void;
  ensureConversationForSend?: (input: PendingSendInput) => void;
  onUserMessageSent?: (event: { conversationId: string; message: Message }) => void;
}

export interface UseChatActionsReturn {
  handleSend: (input?: PendingSendInput) => void;
  triggerSend: (messageText: string) => void;
  handleCancelMessage: () => void;
  copyLastResponse: () => void;
}

export function useChatActions({
  inputValue,
  isThinking,
  isCharacterRoleSession = false,
  selectedModel,
  availableModels,
  sessionMode,
  mediaProviderId,
  mediaModelId,
  agentMediaModels,
  understandingModels,
  activeConversationId,
  activeConversationIdRef,
  isConversationSwitching = false,
  streamingMessageIdRef,
  messages,
  setMessages,
  setIsThinking,
  setStreamingMessageId,
  setActiveTab,
  clearInput,
  setAttachedFiles,
  setSelectedFileReferences,
  ensureConversationForSend,
  onUserMessageSent,
}: UseChatActionsProps): UseChatActionsReturn {
  // Lightweight dedup guard: prevent double-click within 1s
  const lastSentRef = useRef<{ hash: string; time: number }>();

  const isDuplicate = useCallback((content: string): boolean => {
    const hash = content.trim().slice(0, 100);
    const now = Date.now();
    if (lastSentRef.current?.hash === hash && now - lastSentRef.current.time < 1000) return true;
    lastSentRef.current = { hash, time: now };
    return false;
  }, []);

  // Send a user message — always send directly to Extension.
  // AgentRunner handles queueing if the agent is already running.
  const handleSend = useCallback(
    (input?: PendingSendInput) => {
      if (isConversationSwitching) return;
      const isQueueingSend = isThinking;

      const messageText = input?.messageText ?? inputValue;
      const displayMessageText = input?.displayMessageText ?? messageText;
      const inputSessionMode = input?.sessionMode;
      const attachments = input?.attachments;
      const contextPayloads = input?.contextPayloads;
      const fileReferenceAttachments = projectFileReferenceAttachments(input?.fileReferences);
      const fileReferenceContextReferences = projectFileReferenceContextReferences(
        input?.fileReferences,
      );
      const outboundAttachments = mergeDisplayAttachments(attachments, fileReferenceAttachments);
      const outboundContextPayloads = contextPayloads ?? [];
      const trimmed = messageText.trim();
      const hasAttachments = outboundAttachments.length > 0;
      const hasContextPayloads = (contextPayloads?.length ?? 0) > 0;
      const selectedFileReferenceCount = input?.fileReferences?.length ?? 0;
      const hasFileReferences = selectedFileReferenceCount > 0;
      if (!trimmed && !hasAttachments && !hasContextPayloads && !hasFileReferences) return;
      if (
        isQueueingSend &&
        !isQueueableRunningTextSend({
          trimmed,
          hasAttachments,
          hasContextPayloads,
          selectedFileReferenceCount,
        })
      ) {
        return;
      }

      const conversationId = activeConversationId;
      if (!conversationId) {
        const pendingSessionMode = inputSessionMode ?? sessionMode ?? 'agent';
        ensureConversationForSend?.({
          messageText,
          displayMessageText,
          ...(inputSessionMode ? { sessionMode: inputSessionMode } : {}),
          ...(attachments ? { attachments } : {}),
          ...(contextPayloads ? { contextPayloads } : {}),
          ...(input?.fileReferences ? { fileReferences: input.fileReferences } : {}),
          ...(pendingSessionMode === 'agent' && input?.agentModels
            ? { agentModels: input.agentModels }
            : {}),
          ...(pendingSessionMode === 'agent' && input?.understandingModels
            ? { understandingModels: input.understandingModels }
            : {}),
          ...(pendingSessionMode === 'agent' && input?.llmConfig
            ? { llmConfig: input.llmConfig }
            : {}),
        });
        return;
      }

      const slashCommand = isCharacterRoleSession ? null : parseDirectBuiltinSlashCommand(trimmed);
      if (slashCommand) {
        clearInput();
        setAttachedFiles([]);
        setSelectedFileReferences?.([]);
        AgentHostMessages.invokeSlashCommand(
          slashCommand.command,
          slashCommand.args,
          conversationId,
        );
        return;
      }

      const skillInvocation = isCharacterRoleSession ? null : parseDirectSkillInvocation(trimmed);
      if (skillInvocation) {
        clearInput();
        setAttachedFiles([]);
        setSelectedFileReferences?.([]);
        AgentHostMessages.invokeSkill(
          skillInvocation.skillName,
          skillInvocation.args,
          conversationId,
        );
        return;
      }

      // Dedup guard: prevent accidental double-click
      if (isDuplicate(`${trimmed}:${attachments?.length ?? 0}:${contextPayloads?.length ?? 0}`)) {
        return;
      }

      // Clear stale streaming state only for a new foreground turn.
      // Queueing while the current turn streams must preserve the active assistant message.
      if (!isQueueingSend) {
        setStreamingMessageId(null);
        streamingMessageIdRef.current = null;
      }

      const contextReferences = mergeContextReferences(
        projectContextReferencesFromPayloads(contextPayloads),
        fileReferenceContextReferences,
      );
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: displayMessageText.trim(),
        timestamp: Date.now(),
        ...(isQueueingSend ? { isQueued: true } : {}),
        ...(outboundAttachments.length > 0 ? { attachments: outboundAttachments } : {}),
        ...(contextReferences ? { contextReferences } : {}),
      };

      if (!isQueueingSend) {
        setMessages((prev) => [...prev, userMessage]);
      }
      onUserMessageSent?.({ conversationId, message: userMessage });
      clearInput();
      setAttachedFiles([]);
      setSelectedFileReferences?.([]);
      if (!isQueueingSend) {
        setIsThinking(true);
      }

      const effectiveSessionMode = inputSessionMode ?? sessionMode ?? 'agent';
      const modelProjection = projectMessageModelSelection({
        selectedModel,
        chatModelOptions: availableModels,
        sessionMode: effectiveSessionMode,
        mediaProviderId,
        mediaModelId,
        agentMediaModels,
      });
      const purposeModels = projectAgentPurposeModels(
        modelProjection.purposeModels,
        input?.understandingModels ?? understandingModels,
      );
      AgentHostMessages.sendMessage({
        conversationId,
        message: trimmed,
        sessionMode: effectiveSessionMode,
        ...projectAgentModelSendProjection({
          sessionMode: effectiveSessionMode,
          modelProjection,
          agentModels: input?.agentModels,
        }),
        ...(effectiveSessionMode === 'agent' && input?.agentModels
          ? { agentModels: input.agentModels }
          : {}),
        ...(effectiveSessionMode === 'agent' && purposeModels
          ? { purposeModels }
          : {}),
        ...(effectiveSessionMode === 'agent' && input?.llmConfig
          ? { llmConfig: input.llmConfig }
          : {}),
        ...(outboundAttachments.length > 0 ? { attachments: outboundAttachments } : {}),
        ...(outboundContextPayloads.length > 0 ? { contextPayloads: outboundContextPayloads } : {}),
        ...(input?.fileReferences && input.fileReferences.length > 0
          ? { fileReferences: input.fileReferences }
          : {}),
      });
    },
    [
      inputValue,
      isThinking,
      isCharacterRoleSession,
      selectedModel,
      sessionMode,
      mediaProviderId,
      mediaModelId,
      agentMediaModels,
      understandingModels,
      activeConversationId,
      isConversationSwitching,
      availableModels,
      isDuplicate,
      setMessages,
      setIsThinking,
      setStreamingMessageId,
      streamingMessageIdRef,
      clearInput,
      setAttachedFiles,
      setSelectedFileReferences,
      ensureConversationForSend,
      onUserMessageSent,
    ],
  );

  // Trigger send from external message (with custom message text)
  const triggerSend = useCallback(
    (messageText: string) => {
      if (isConversationSwitching) return;
      const isQueueingSend = isThinking;

      const conversationId = activeConversationIdRef.current;
      const trimmed = messageText.trim();
      if (
        isQueueingSend &&
        !isQueueableRunningTextSend({
          trimmed,
          hasAttachments: false,
          hasContextPayloads: false,
          selectedFileReferenceCount: 0,
        })
      ) {
        return;
      }

      if (!conversationId) {
        ensureConversationForSend?.({
          messageText,
          displayMessageText: messageText,
        });
        return;
      }

      if (!isQueueingSend) {
        setStreamingMessageId(null);
        streamingMessageIdRef.current = null;
      }

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: messageText,
        timestamp: Date.now(),
        ...(isQueueingSend ? { isQueued: true } : {}),
      };

      if (!isQueueingSend) {
        setMessages((prev) => [...prev, userMessage]);
      }
      onUserMessageSent?.({ conversationId, message: userMessage });
      if (!isQueueingSend) {
        setIsThinking(true);
      }
      setActiveTab('chat');

      const modelProjection = projectMessageModelSelection({
        selectedModel,
        chatModelOptions: availableModels,
        sessionMode: 'agent',
      });
      AgentHostMessages.sendMessage({
        conversationId,
        message: messageText,
        sessionMode: 'agent',
        ...modelProjection,
      });
    },
    [
      isThinking,
      isConversationSwitching,
      selectedModel,
      availableModels,
      setMessages,
      setIsThinking,
      setActiveTab,
      setStreamingMessageId,
      streamingMessageIdRef,
      activeConversationIdRef,
      ensureConversationForSend,
      onUserMessageSent,
    ],
  );

  // Copy last assistant response to clipboard
  const copyLastResponse = useCallback(() => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant) {
      navigator.clipboard.writeText(lastAssistant.content);
    }
  }, [messages]);

  // Cancel current AI message generation
  const handleCancelMessage = useCallback(() => {
    if (isConversationSwitching) return;

    const conversationId = activeConversationIdRef.current;
    if (isThinking && conversationId) {
      AgentHostMessages.cancelMessage(conversationId);
      setIsThinking(false);
    }
  }, [isThinking, isConversationSwitching, activeConversationIdRef, setIsThinking]);

  return { handleSend, triggerSend, handleCancelMessage, copyLastResponse };
}

function projectAgentPurposeModels(
  generation: AgentFlatPurposeModelRefs | undefined,
  understanding: MediaUnderstandingModelSelections | undefined,
): AgentFlatPurposeModelRefs | undefined {
  const purposes: AgentFlatPurposeModelRefs = {
    ...generation,
    ...(understanding?.image ? { 'image.understand': understanding.image } : {}),
    ...(understanding?.video ? { 'video.understand': understanding.video } : {}),
    ...(understanding?.audio ? { 'audio.understand': understanding.audio } : {}),
  };
  return Object.keys(purposes).length > 0 ? purposes : undefined;
}

interface AgentModelSendProjectionInput {
  readonly sessionMode: SessionMode;
  readonly modelProjection: MessageModelProjection;
  readonly agentModels?: AgentModelSlots;
}

function projectAgentModelSendProjection(
  input: AgentModelSendProjectionInput,
): MessageModelProjection {
  if (input.sessionMode !== 'agent' || !input.agentModels?.primary) {
    return input.modelProjection;
  }

  const { chatModel: _chatModel, ...rest } = input.modelProjection;
  return rest;
}

function projectFileReferenceAttachments(
  references: readonly SelectedFileReference[] | undefined,
): MessageAttachment[] {
  return (
    references
      ?.filter((reference) => !isDocumentFile(reference.path))
      .map((reference) => {
        const type = toAttachmentTypeFromPathReference(reference);
        return {
          id: reference.id,
          name: reference.label,
          type,
          path: reference.path,
          ...(reference.thumbnailUri && type === 'image'
            ? { preview: reference.thumbnailUri }
            : {}),
        };
      }) ?? []
  );
}

function projectFileReferenceContextReferences(
  references: readonly SelectedFileReference[] | undefined,
): MessageContextReference[] {
  return (
    references?.map((reference) => ({
      type: fileReferenceContextType(reference),
      id: reference.id,
      label: reference.label,
      summary: reference.path,
      ...(reference.thumbnailUri ? { thumbnailUri: reference.thumbnailUri } : {}),
      ...(reference.mediaType ? { mediaType: reference.mediaType } : {}),
      navigationData: {
        path: reference.path,
        filePath: reference.path,
      },
    })) ?? []
  );
}

function mergeContextReferences(
  payloadReferences: MessageContextReference[] | undefined,
  fileReferences: readonly MessageContextReference[],
): MessageContextReference[] | undefined {
  const merged: MessageContextReference[] = [];
  const seenIds = new Set<string>();

  for (const reference of payloadReferences ?? []) {
    merged.push(reference);
    seenIds.add(reference.id);
  }

  for (const reference of fileReferences) {
    if (seenIds.has(reference.id)) continue;
    merged.push(reference);
    seenIds.add(reference.id);
  }

  return merged.length > 0 ? merged : undefined;
}

function fileReferenceContextType(
  reference: SelectedFileReference,
): MessageContextReference['type'] {
  if (reference.mediaType === 'image') return 'image';
  if (reference.mediaType === 'audio') return 'audio-clip';
  if (
    reference.mediaType === 'video' ||
    reference.mediaType === 'sequence' ||
    reference.source === 'media-library'
  ) {
    return 'media';
  }
  if (reference.source === 'asset-library') return 'asset';
  if (reference.source === 'entity-graph') return 'entity';
  return 'file';
}

function mergeDisplayAttachments(
  attachments: readonly MessageAttachment[] | undefined,
  fileReferences: readonly MessageAttachment[],
): MessageAttachment[] {
  if (!attachments || attachments.length === 0) return [...fileReferences];
  if (fileReferences.length === 0) return [...attachments];
  return [...attachments, ...fileReferences];
}

function isQueueableRunningTextSend(input: {
  readonly trimmed: string;
  readonly hasAttachments: boolean;
  readonly hasContextPayloads: boolean;
  readonly selectedFileReferenceCount: number;
}): boolean {
  return (
    input.trimmed.length > 0 &&
    !input.hasAttachments &&
    !input.hasContextPayloads &&
    input.selectedFileReferenceCount === 0 &&
    !/^[/$]/.test(input.trimmed)
  );
}

function parseDirectSkillInvocation(
  input: string,
): { readonly skillName: string; readonly args?: string } | null {
  const parsed = parseAgentInputTrigger(input);
  if (!parsed || parsed.trigger !== 'skill') {
    return null;
  }

  return {
    skillName: parsed.name,
    ...(parsed.args ? { args: parsed.args } : {}),
  };
}

function parseDirectBuiltinSlashCommand(
  input: string,
): { readonly command: string; readonly args?: string } | null {
  if (!input.startsWith('/')) {
    return null;
  }

  const withoutPrefix = input.slice(1);
  const separatorIndex = withoutPrefix.search(/\s/);
  const commandToken =
    separatorIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, Math.max(separatorIndex, 0));
  const command = normalizeSlashCommandName(commandToken);
  const definition = command ? getBuiltinSlashCommand(command) : undefined;
  if (!definition?.availableInExtension) {
    return null;
  }

  if (separatorIndex === -1) {
    return { command };
  }

  const args = withoutPrefix.slice(separatorIndex + 1).trim();
  return { command, ...(args ? { args } : {}) };
}
