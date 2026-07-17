import { useMemo, useRef, useSyncExternalStore } from 'react';
import type { OpenTab } from '@neko-agent/types';
import { ChatWorkspace, type ChatWorkspaceProps } from './ChatWorkspace';
import type { TabRenderRuntime } from '@/render-runtime/tab-render-runtime';
import { AgentMarkdownSessionRegistryProvider } from '@/markdown/agent-markdown-session-context';
import { projectConversationProjectionRenderState } from '@/presenters/conversation-projection-presenter';

export interface ConversationTabRuntimeViewProps extends Omit<
  ChatWorkspaceProps,
  'isVisible' | 'tabRenderStore' | 'streamingMessageIdRef'
> {
  readonly tab: OpenTab;
  readonly runtime: TabRenderRuntime;
  readonly visible: boolean;
}

/**
 * Retains one immutable React render subtree for one Tab binding.
 * Visibility changes must never rebind this component to another runtime.
 */
export function ConversationTabRuntimeView({
  tab,
  runtime,
  visible,
  messages,
  workItems,
  isThinking,
  streamingMessageId,
  ...workspaceProps
}: ConversationTabRuntimeViewProps) {
  if (runtime.tabId !== tab.id || runtime.conversationId !== tab.conversationId) {
    throw new Error(
      `Tab runtime binding mismatch: expected ${tab.id}/${tab.conversationId}, received ${runtime.tabId}/${runtime.conversationId}.`,
    );
  }

  const subscribeProjection = useMemo(
    () => (listener: () => void) => runtime.projectionReplica.subscribe(listener),
    [runtime],
  );
  const readProjection = useMemo(() => () => runtime.projectionReplica.getSnapshot(), [runtime]);
  const projectionSnapshot = useSyncExternalStore(
    subscribeProjection,
    readProjection,
    readProjection,
  );
  const streamingMessageIdRef = useRef<string | null>(null);
  const renderState = useMemo(
    () =>
      projectConversationProjectionRenderState({
        messages,
        workItems,
        isThinking,
        streamingMessageId,
        projection: projectionSnapshot.projection,
      }),
    [isThinking, messages, projectionSnapshot.projection, streamingMessageId, workItems],
  );
  streamingMessageIdRef.current = renderState.streamingMessageId;

  return (
    <AgentMarkdownSessionRegistryProvider registry={runtime.markdownSessions}>
      <div
        data-agent-tab-runtime={tab.id}
        data-agent-conversation={tab.conversationId}
        hidden={!visible}
        aria-hidden={!visible}
        className={visible ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
      >
        <ChatWorkspace
          {...workspaceProps}
          messages={[...renderState.messages]}
          workItems={[...renderState.workItems]}
          isThinking={renderState.isThinking}
          streamingMessageId={renderState.streamingMessageId}
          streamingMessageIdRef={streamingMessageIdRef}
          tabRenderStore={runtime.store}
          isVisible={visible}
        />
      </div>
    </AgentMarkdownSessionRegistryProvider>
  );
}
