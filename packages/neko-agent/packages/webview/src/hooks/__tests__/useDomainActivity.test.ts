import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDomainActivity } from '../useDomainActivity';

const host = vi.hoisted(() => ({
  attachDomainActivity: vi.fn(),
  acknowledgeDomainActivity: vi.fn(),
  detachDomainActivity: vi.fn(),
  commandDomainJob: vi.fn(),
}));

vi.mock('@/messages', () => ({ AgentHostMessages: host }));

describe('useDomainActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  });

  it('installs snapshot, applies ordered patch and acknowledges each authoritative version', () => {
    const { result } = renderHook(() => useDomainActivity());
    const attachmentId = 'domain-activity-00000000-0000-4000-8000-000000000001';
    expect(host.attachDomainActivity).toHaveBeenCalledWith(attachmentId);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'domainActivitySnapshot',
            key: { attachmentId },
            sequence: 0,
            snapshot: { projectionVersion: 2, items: [] },
          },
        }),
      );
    });
    expect(result.current.state).toMatchObject({
      phase: 'live',
      snapshot: { projectionVersion: 2, items: [] },
    });
    expect(host.acknowledgeDomainActivity).toHaveBeenCalledWith(attachmentId, 0, 2);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'domainActivityPatch',
            key: { attachmentId },
            sequence: 1,
            patch: {
              baseProjectionVersion: 2,
              projectionVersion: 3,
              removed: [],
              upserts: [activity()],
            },
          },
        }),
      );
    });
    expect(result.current.state.snapshot).toMatchObject({
      projectionVersion: 3,
      items: [{ jobId: 'generation-1', jobRevision: 4 }],
    });
    expect(host.acknowledgeDomainActivity).toHaveBeenLastCalledWith(attachmentId, 1, 3);
  });

  it('sends exact identity and displayed revision for commands', () => {
    const { result } = renderHook(() => useDomainActivity());
    act(() => result.current.execute(activity(), 'cancel'));

    expect(host.commandDomainJob).toHaveBeenCalledWith({
      requestId: '00000000-0000-4000-8000-000000000001',
      jobKind: 'generation',
      jobId: 'generation-1',
      expectedRevision: 4,
      command: 'cancel',
    });
  });

  it('tracks pending commands independently by exact Job identity', () => {
    vi.mocked(crypto.randomUUID)
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000003');
    const { result } = renderHook(() => useDomainActivity());
    const generation = activity();
    const exportJob = exportActivity();

    act(() => {
      result.current.execute(generation, 'cancel');
      result.current.execute(exportJob, 'retry');
    });
    expect(result.current.state.pendingJobKeys).toEqual([
      'generation:generation-1',
      'export:export-1',
    ]);

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'domainJobCommandResult',
            requestId: '00000000-0000-4000-8000-000000000002',
            success: true,
          },
        }),
      );
    });
    expect(result.current.state.pendingJobKeys).toEqual(['export:export-1']);
  });

  it('requests a replacement snapshot when patch sequence is stale', () => {
    const { result } = renderHook(() => useDomainActivity());
    const attachmentId = 'domain-activity-00000000-0000-4000-8000-000000000001';
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'domainActivitySnapshot',
            key: { attachmentId },
            sequence: 0,
            snapshot: { projectionVersion: 2, items: [] },
          },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'domainActivityPatch',
            key: { attachmentId },
            sequence: 2,
            patch: {
              baseProjectionVersion: 2,
              projectionVersion: 3,
              removed: [],
              upserts: [activity()],
            },
          },
        }),
      );
    });

    expect(result.current.state.phase).toBe('attaching');
    expect(result.current.state.diagnostic).toContain('revision gap');
    expect(host.attachDomainActivity).toHaveBeenCalledTimes(2);
  });
});

function activity() {
  return {
    jobKind: 'generation' as const,
    jobId: 'generation-1',
    phase: 'running' as const,
    jobRevision: 4,
    createdAt: 100,
    updatedAt: 130,
    label: 'image generation',
    mediaKind: 'image' as const,
    progress: { stage: 'waiting-provider', percent: 60 },
    supportedCommands: ['cancel', 'reconcile'] as const,
  };
}

function exportActivity() {
  return {
    jobKind: 'export' as const,
    jobId: 'export-1',
    phase: 'failed' as const,
    jobRevision: 7,
    createdAt: 100,
    updatedAt: 140,
    label: 'MP4 export',
    format: 'mp4',
    progress: { stage: 'failed', percent: 80 },
    supportedCommands: ['retry'] as const,
  };
}
