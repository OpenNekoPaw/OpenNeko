import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DomainActivityItem } from '@neko/shared/domain-activity';
import type { DomainActivityReplicaState } from '@/hooks/useDomainActivity';
import { DomainActivityView } from './DomainActivityView';

describe('DomainActivityView', () => {
  it('renders concrete Generation and Export cards with authoritative revisions', () => {
    render(
      <DomainActivityView
        state={state([generationActivity(), exportActivity()])}
        onCommand={vi.fn()}
      />,
    );

    expect(screen.getByText('image generation')).toBeTruthy();
    expect(screen.getByText('generation:generation-1 · r4')).toBeTruthy();
    expect(screen.getByText('MP4 export')).toBeTruthy();
    expect(screen.getByText('export:export-1 · r7')).toBeTruthy();
    expect(screen.getByText('60%')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
  });

  it('dispatches the exact displayed item and disables only its pending commands', () => {
    const onCommand = vi.fn();
    const generation = generationActivity();
    render(
      <DomainActivityView
        state={{
          ...state([generation, exportActivity()]),
          pendingJobKeys: ['generation:generation-1'],
        }}
        onCommand={onCommand}
      />,
    );

    expect((screen.getByRole('button', { name: 'Cancel job' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    const retry = screen.getByRole('button', { name: 'Retry job' }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
    fireEvent.click(retry);
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        jobKind: 'export',
        jobId: 'export-1',
        jobRevision: 7,
      }),
      'retry',
    );
  });

  it('shows attachment and command diagnostics without hiding authoritative cards', () => {
    const { rerender } = render(
      <DomainActivityView
        state={{
          phase: 'attaching',
          snapshot: { projectionVersion: 0, items: [] },
          pendingJobKeys: [],
        }}
        onCommand={vi.fn()}
      />,
    );
    expect(screen.getByText('Loading activity')).toBeTruthy();

    rerender(
      <DomainActivityView
        state={{
          ...state([exportActivity()]),
          diagnostic: 'stale revision: export-1 is at 8, not 7',
        }}
        onCommand={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('stale revision');
    expect(screen.getByText('export:export-1 · r7')).toBeTruthy();
  });
});

function state(items: readonly DomainActivityItem[]): DomainActivityReplicaState {
  return {
    phase: 'live',
    snapshot: { projectionVersion: 9, items },
    pendingJobKeys: [],
  };
}

function generationActivity(): DomainActivityItem {
  return {
    jobKind: 'generation',
    jobId: 'generation-1',
    phase: 'running',
    jobRevision: 4,
    createdAt: 100,
    updatedAt: 130,
    label: 'image generation',
    mediaKind: 'image',
    progress: { stage: 'waiting-provider', percent: 60 },
    supportedCommands: ['cancel', 'reconcile'],
  };
}

function exportActivity(): DomainActivityItem {
  return {
    jobKind: 'export',
    jobId: 'export-1',
    phase: 'failed',
    jobRevision: 7,
    createdAt: 100,
    updatedAt: 140,
    label: 'MP4 export',
    format: 'mp4',
    progress: { stage: 'failed', percent: 80 },
    supportedCommands: ['retry'],
    failure: {
      code: 'export-failed',
      message: 'Export failed.',
      retryable: true,
    },
  };
}
