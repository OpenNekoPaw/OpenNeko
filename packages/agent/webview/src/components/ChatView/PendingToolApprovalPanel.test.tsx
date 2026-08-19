import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PendingToolApprovalProjection } from '../../presenters/pending-tool-approval-presenter';
import { PendingToolApprovalPanel } from './PendingToolApprovalPanel';

const confirmTool = vi.fn();

vi.mock('../../host-runtime-context', () => ({
  useAgentHostMessages: () => ({ confirmTool }),
}));

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, number>) =>
      key === 'toolCalls.pendingApprovals'
        ? `Approvals (${params?.count ?? 0})`
        : key === 'toolCalls.approve'
          ? 'Approve'
          : key === 'toolCalls.deny'
            ? 'Deny'
            : key,
  }),
}));

describe('PendingToolApprovalPanel', () => {
  beforeEach(() => confirmTool.mockReset());

  it('renders all approvals above the composer and submits exact identities', () => {
    render(
      <PendingToolApprovalPanel
        approvals={[approval('tool-a'), approval('tool-b')]}
        conversationId="conversation-a"
      />,
    );

    expect(screen.getByRole('region', { name: 'Approvals (2)' })).toBeTruthy();
    expect(screen.getByText('Approve tool-a')).toBeTruthy();
    expect(screen.getByText('Approve tool-b')).toBeTruthy();
    expect(screen.getAllByText(/prompt=tool-/)).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Approve' })[1]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Deny' })[0]!);

    expect(confirmTool).toHaveBeenNthCalledWith(1, 'tool-b', true, 'conversation-a');
    expect(confirmTool).toHaveBeenNthCalledWith(2, 'tool-a', false, 'conversation-a');
  });

  it('keeps approvals visible but inert without an exact Conversation identity', () => {
    render(<PendingToolApprovalPanel approvals={[approval('tool-a')]} conversationId={null} />);

    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Deny' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shares the centered composer rail and keeps multiple approvals bounded', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    const panelRule = css.match(/\.agent-pending-approval-panel\s*\{(?<body>[^}]+)\}/)?.groups
      ?.body;
    const listRule = css.match(/\.agent-pending-approval-list\s*\{(?<body>[^}]+)\}/)?.groups?.body;
    const actionRule = css.match(/\.agent-pending-approval-actions\s*\{(?<body>[^}]+)\}/)?.groups
      ?.body;
    const factRule = css.match(/\.agent-tool-approval-fact\s*\{(?<body>[^}]+)\}/)?.groups?.body;

    expect(panelRule).toContain('width: 100%');
    expect(panelRule).toContain('max-width: 820px');
    expect(panelRule).toContain('margin: 0 auto 8px');
    expect(panelRule).not.toContain('var(--agent-warning)');
    expect(listRule).toContain('max-height: min(240px, 32vh)');
    expect(listRule).toContain('overflow-y: auto');
    expect(actionRule).toContain('justify-content: flex-end');
    expect(factRule).toContain('padding: 5px 8px');
    expect(factRule).toContain('border-radius: 6px');
  });
});

function approval(id: string): PendingToolApprovalProjection {
  return {
    toolCall: {
      id,
      name: 'GenerateImage',
      arguments: { prompt: id },
      pendingConfirmation: true,
      confirmation: { action: 'Generate', description: `Approve ${id}`, details: {} },
    },
    summary: `prompt=${id}`,
  };
}
