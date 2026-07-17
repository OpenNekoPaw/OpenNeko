/**
 * Custom Hooks Module
 *
 * Exports all custom hooks for state management.
 */

export {
  useConversationState,
  type StreamingState,
  type ConversationRenderStateUpdater,
  type ConversationState,
  type ConversationStateRefs,
  type ConversationStateActions,
  type UseConversationStateReturn,
} from './useConversationState';

export {
  useConfigState,
  type ProjectFileInfo,
  type ConfigState,
  type ConfigStateActions,
  type UseConfigStateReturn,
} from './useConfigState';

export {
  useResourceState,
  type ResourceState,
  type ResourceStateActions,
  type UseResourceStateReturn,
} from './useResourceState';

export { useTabManager, type UseTabManagerProps, type UseTabManagerReturn } from './useTabManager';

export {
  useSlashCommands,
  type UseSlashCommandsProps,
  type UseSlashCommandsReturn,
} from './useSlashCommands';

export {
  useChatActions,
  type PendingSendInput,
  type UseChatActionsProps,
  type UseChatActionsReturn,
} from './useChatActions';

export {
  useWebviewKeyboardEditableReporting,
  useWebviewKeyboardFocusReporting,
} from './useWebviewKeyboardReporting';
