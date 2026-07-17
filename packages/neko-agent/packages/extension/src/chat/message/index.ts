/**
 * Message Processing Modules
 *
 * Specialized processors used by AgentMessageTurnHandler:
 * - AttachmentProcessor: File/image attachment handling
 * - AgentStreamProcessor: Agent event stream processing
 */

export { AttachmentProcessor, type ProcessedAttachments } from './attachmentProcessor';
export {
  AgentStreamProcessor,
  type AgentStreamProcessorDeps,
  type StreamProcessingResult,
  type StreamCallbacks,
} from './agentStreamProcessor';
export type { CollectedToolCall } from '@neko/agent/runtime';
export type { ContentBlock } from '@neko-agent/types';
