import { useCallback } from 'react';
import type { PendingToolApprovalProjection } from '../../presenters/pending-tool-approval-presenter';
import { useAgentHostMessages } from '../../host-runtime-context';
import { useTranslation } from '../../i18n/I18nContext';
import { WarningIcon } from './ToolCallDisplay/icons';

interface PendingToolApprovalPanelProps {
  readonly approvals: readonly PendingToolApprovalProjection[];
  readonly conversationId: string | null;
}

export function PendingToolApprovalPanel({
  approvals,
  conversationId,
}: PendingToolApprovalPanelProps) {
  if (approvals.length === 0) return null;
  return <PendingToolApprovalPanelContent approvals={approvals} conversationId={conversationId} />;
}

function PendingToolApprovalPanelContent({
  approvals,
  conversationId,
}: PendingToolApprovalPanelProps) {
  const { t } = useTranslation();
  const agentHostMessages = useAgentHostMessages();
  const handleDecision = useCallback(
    (toolCallId: string, approved: boolean) => {
      if (!conversationId) {
        throw new Error('Pending Tool approval requires an exact Conversation identity.');
      }
      agentHostMessages.confirmTool(toolCallId, approved, conversationId);
    },
    [agentHostMessages, conversationId],
  );

  return (
    <section
      className="agent-pending-approval-panel"
      aria-label={t('toolCalls.pendingApprovals', { count: approvals.length })}
    >
      <div className="agent-pending-approval-heading">
        <WarningIcon className="h-4 w-4 shrink-0" />
        <span>{t('toolCalls.pendingApprovals', { count: approvals.length })}</span>
      </div>
      <div className="agent-pending-approval-list">
        {approvals.map(({ toolCall, summary }) => (
          <article className="agent-pending-approval-item" key={toolCall.id}>
            <div className="agent-pending-approval-content">
              <div className="agent-pending-approval-tool">
                <span className="agent-badge font-mono text-[11px]">{toolCall.name}</span>
                {toolCall.confirmation?.action ? <span>{toolCall.confirmation.action}</span> : null}
              </div>
              <p className="agent-pending-approval-question">
                {toolCall.confirmation?.description}
              </p>
              {summary ? <code className="agent-pending-approval-command">{summary}</code> : null}
            </div>
            <div className="agent-pending-approval-actions">
              <button
                type="button"
                className="neko-button neko-button-secondary"
                disabled={!conversationId}
                data-approval-action="deny"
                onClick={() => handleDecision(toolCall.id, false)}
              >
                {t('toolCalls.deny')}
              </button>
              <button
                type="button"
                className="neko-button"
                disabled={!conversationId}
                data-approval-action="approve"
                onClick={() => handleDecision(toolCall.id, true)}
              >
                {t('toolCalls.approve')}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
