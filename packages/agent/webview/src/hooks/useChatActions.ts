/**
 * useChatActions - Chat message sending, cancellation, and copy
 *
 * Sends messages to the Desktop host; subsequent full inputs are queued by the runtime.
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
  type AgentInputCatalogMessage,
  type AgentCanvasTurnIntent,
  type AgentFlatPurposeModelRefs,
  type AgentModelSlots,
  type MediaUnderstandingModelSelections,
  type MessageModelProjection,
  type SessionMode,
  type TabType,
} from '@neko/agent-contracts';
import { useAgentHostMessages } from '../host-runtime-context';
import type {
  MessageAttachment,
  SelectedFileReference,
} from '../components/ChatView/InputArea/types';
import {
  parseAgentInputTrigger,
  type AgentContextPayload,
  type AgentMediaModelSelections,
  type ParsedAgentInputTrigger,
} from '@neko/agent-contracts';
import { resolveAgentInputInvocationIntent } from '../components/ChatView/InputArea/slash-command-catalog';
import { projectMessageModelSelection } from '../presenters/config-message-presenter';
import { projectMessageContextReferences } from '../presenters/context-reference-presenter';
import { type ChatModelOption } from '@neko/ai-contracts';

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
  canvasTurnTarget?: AgentCanvasTurnIntent;
}

export interface PendingSendIdentity {
  readonly id: string;
  readonly timestamp: number;
}

export interface UseChatActionsProps {
  inputValue: string;
  isThinking: boolean;
  inputCatalog?: AgentInputCatalogMessage;
  reportInputDiagnostic?: (message: string) => void;
  selectedModel: string;
  availableModels?: readonly ChatModelOption[];
  sessionMode?: SessionMode;
  /** Per-category generation models exposed to approved Agent Tools. */
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
  ensureConversationForSend?: (input: PendingSendInput) => boolean;
  onUserMessageSent?: (event: { conversationId: string; message: Message }) => void;
}

export interface UseChatActionsReturn {
  handleSend: (
    input?: PendingSendInput,
    identity?: PendingSendIdentity,
  ) => boolean | Promise<boolean>;
  triggerSend: (messageText: string) => void;
  handleCancelMessage: () => void;
  copyLastResponse: () => void;
}

export function useChatActions({
  inputValue,
  isThinking,
  inputCatalog,
  reportInputDiagnostic,
  selectedModel,
  availableModels,
  sessionMode,
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
  const agentHostMessages = useAgentHostMessages();
  // Lightweight dedup guard: prevent double-click within 1s
  const lastSentRef = useRef<{ hash: string; time: number }>();
  const pendingSubmissionHashesRef = useRef(new Set<string>());

  const isDuplicate = useCallback((content: string): boolean => {
    const hash = content.trim().slice(0, 100);
    const now = Date.now();
    if (lastSentRef.current?.hash === hash && now - lastSentRef.current.time < 1000) return true;
    return false;
  }, []);

  const recordAcceptedSend = useCallback((content: string): void => {
    lastSentRef.current = { hash: content.trim().slice(0, 100), time: Date.now() };
  }, []);

  // Send a user message directly to the Desktop host.
  // AgentRunner handles queueing if the agent is already running.
  const handleSend = useCallback(
    (input?: PendingSendInput, identity?: PendingSendIdentity) => {
      if (isConversationSwitching) return false;
      const isQueueingSend = isThinking;

      const messageText = input?.messageText ?? inputValue;
      const displayMessageText = input?.displayMessageText ?? messageText;
      const inputSessionMode = input?.sessionMode;
      const attachments = input?.attachments;
      const contextPayloads = input?.contextPayloads;
      const outboundAttachments = attachments ?? [];
      const outboundContextPayloads = contextPayloads ?? [];
      const trimmed = messageText.trim();
      const hasAttachments = outboundAttachments.length > 0;
      const hasContextPayloads = (contextPayloads?.length ?? 0) > 0;
      const selectedFileReferenceCount = input?.fileReferences?.length ?? 0;
      const hasFileReferences = selectedFileReferenceCount > 0;
      if (!trimmed && !hasAttachments && !hasContextPayloads && !hasFileReferences) return false;
      const effectiveSessionMode: SessionMode = inputSessionMode ?? sessionMode ?? 'agent';
      const conversationId = activeConversationId;
      if (!conversationId) {
        const pendingSessionMode = inputSessionMode ?? sessionMode ?? 'agent';
        if (!ensureConversationForSend) {
          reportInputDiagnostic?.(
            'Agent message cannot be sent before the exact Conversation creator is available.',
          );
          return false;
        }
        return ensureConversationForSend({
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
        });
      }

      const parsedTrigger = parseAgentInputTrigger(trimmed);
      if (parsedTrigger?.trigger === 'command' || parsedTrigger?.trigger === 'skill') {
        try {
          if (!inputCatalog || inputCatalog.conversationId !== conversationId) {
            throw new Error(
              `Agent input '${parsedTrigger.prefix}${parsedTrigger.name}' cannot run before the exact Conversation catalog is available.`,
            );
          }
          const intent = resolveAgentInputInvocationIntent({
            trigger: parsedTrigger as ParsedAgentInputTrigger & {
              readonly trigger: 'command' | 'skill';
            },
            entries: inputCatalog.entries,
            phase: inputCatalog.phase,
            bindingKind: inputCatalog.bindingKind,
          });
          clearInput();
          setAttachedFiles([]);
          setSelectedFileReferences?.([]);
          agentHostMessages.invokeAgentInput(intent, conversationId);
          return true;
        } catch (error) {
          reportInputDiagnostic?.(error instanceof Error ? error.message : String(error));
          return false;
        }
      }

      // Dedup guard: prevent accidental double-click
      if (
        !identity &&
        isDuplicate(`${trimmed}:${attachments?.length ?? 0}:${contextPayloads?.length ?? 0}`)
      ) {
        return false;
      }

      const contextReferences = projectMessageContextReferences({
        payloads: contextPayloads,
        fileReferences: input?.fileReferences,
      });
      const modelProjection = projectMessageModelSelection({
        selectedModel,
        chatModelOptions: availableModels,
        sessionMode: effectiveSessionMode,
        agentMediaModels,
      });
      const purposeModels = projectAgentPurposeModels(
        modelProjection.purposeModels,
        input?.understandingModels ?? understandingModels,
      );
      const submissionHash = `${trimmed}:${attachments?.length ?? 0}:${contextPayloads?.length ?? 0}`;
      if (pendingSubmissionHashesRef.current.has(submissionHash)) return false;
      pendingSubmissionHashesRef.current.add(submissionHash);

      return (async () => {
        try {
          const receipt = await agentHostMessages.sendMessage({
            conversationId,
            message: trimmed,
            sessionMode: effectiveSessionMode,
            ...projectAgentModelSendProjection({
              sessionMode: effectiveSessionMode,
              modelProjection,
              agentModels: input?.agentModels,
            }),
            ...(input?.agentModels ? { agentModels: input.agentModels } : {}),
            ...(purposeModels ? { purposeModels } : {}),
            ...(outboundAttachments.length > 0 ? { attachments: outboundAttachments } : {}),
            ...(outboundContextPayloads.length > 0
              ? { contextPayloads: outboundContextPayloads }
              : {}),
            ...(input?.fileReferences && input.fileReferences.length > 0
              ? { fileReferences: input.fileReferences }
              : {}),
            ...(input?.canvasTurnTarget ? { canvasTurnTarget: input.canvasTurnTarget } : {}),
          });
          if (receipt.conversationId !== conversationId) {
            throw new Error(
              `Agent submission receipt belongs to Conversation '${receipt.conversationId}', expected '${conversationId}'.`,
            );
          }

          // Clear stale streaming state only after Host acceptance for a new foreground turn.
          if (receipt.state === 'active' && !isQueueingSend) {
            setStreamingMessageId(null);
            streamingMessageIdRef.current = null;
          }
          const userMessage: Message = {
            id: `released:${receipt.queueItemId}`,
            role: 'user',
            content: displayMessageText.trim(),
            timestamp: receipt.createdAt,
            ...(receipt.state === 'queued' ? { isQueued: true } : {}),
            ...(outboundAttachments.length > 0 ? { attachments: outboundAttachments } : {}),
            ...(contextReferences ? { contextReferences } : {}),
          };
          if (receipt.state === 'active') {
            setMessages((prev) =>
              prev.some((message) => message.id === userMessage.id) ? prev : [...prev, userMessage],
            );
          }
          onUserMessageSent?.({ conversationId, message: userMessage });
          if (receipt.state === 'active' && !isQueueingSend) {
            setIsThinking(true);
          }
          recordAcceptedSend(submissionHash);
          return true;
        } catch (error) {
          reportInputDiagnostic?.(error instanceof Error ? error.message : String(error));
          return false;
        } finally {
          pendingSubmissionHashesRef.current.delete(submissionHash);
        }
      })();
    },
    [
      inputValue,
      isThinking,
      inputCatalog,
      reportInputDiagnostic,
      selectedModel,
      sessionMode,
      agentMediaModels,
      understandingModels,
      activeConversationId,
      isConversationSwitching,
      availableModels,
      isDuplicate,
      recordAcceptedSend,
      setMessages,
      setIsThinking,
      setStreamingMessageId,
      streamingMessageIdRef,
      clearInput,
      setAttachedFiles,
      setSelectedFileReferences,
      ensureConversationForSend,
      onUserMessageSent,
      agentHostMessages,
    ],
  );

  // Trigger send from external message (with custom message text)
  const triggerSend = useCallback(
    (messageText: string) => {
      if (isConversationSwitching) return;
      const isQueueingSend = isThinking;

      const conversationId = activeConversationIdRef.current;
      const trimmed = messageText.trim();
      if (!trimmed) return;
      if (!conversationId) {
        ensureConversationForSend?.({
          messageText,
          displayMessageText: messageText,
        });
        return;
      }

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };
      setActiveTab('chat');

      const modelProjection = projectMessageModelSelection({
        selectedModel,
        chatModelOptions: availableModels,
        sessionMode: 'agent',
      });
      void agentHostMessages
        .sendMessage({
          conversationId,
          message: trimmed,
          sessionMode: 'agent',
          ...modelProjection,
        })
        .then((receipt) => {
          if (receipt.state === 'active' && !isQueueingSend) {
            setStreamingMessageId(null);
            streamingMessageIdRef.current = null;
          }
          const acceptedMessage: Message = {
            ...userMessage,
            id: `released:${receipt.queueItemId}`,
            timestamp: receipt.createdAt,
            ...(receipt.state === 'queued' ? { isQueued: true } : {}),
          };
          if (receipt.state === 'active') {
            setMessages((prev) =>
              prev.some((message) => message.id === acceptedMessage.id)
                ? prev
                : [...prev, acceptedMessage],
            );
          }
          onUserMessageSent?.({ conversationId, message: acceptedMessage });
          if (receipt.state === 'active') setIsThinking(true);
        })
        .catch((error: unknown) => {
          reportInputDiagnostic?.(error instanceof Error ? error.message : String(error));
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
      agentHostMessages,
      reportInputDiagnostic,
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
      agentHostMessages.cancelMessage(conversationId);
      setIsThinking(false);
    }
  }, [
    isThinking,
    isConversationSwitching,
    activeConversationIdRef,
    setIsThinking,
    agentHostMessages,
  ]);

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
  if (!input.agentModels?.primary) {
    return input.modelProjection;
  }

  const { chatModel: _chatModel, ...rest } = input.modelProjection;
  return rest;
}
