import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  WorldActionIntent,
  WorldRuntimeBinding,
  WorldRuntimeProjection,
} from '@neko/world/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorldRuntimeRoot } from './runtime';

describe('WorldRuntimeRoot', () => {
  it('reattaches the exact runtime binding and renders the five fixed World surfaces', async () => {
    const getSnapshot = vi.fn(async () => projection());
    const { container } = render(
      <WorldRuntimeRoot
        active
        binding={binding()}
        createIntentId={() => 'intent-1'}
        host={{ getSnapshot, launch: vi.fn(), submitAction: vi.fn() }}
        locale="en"
        now={() => '2026-08-14T00:00:00.000Z'}
        windowId="window-1"
      />,
    );

    expect(screen.getByText('Connecting to World Runtime...')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Rain city' })).toBeTruthy();
    expect(getSnapshot).toHaveBeenCalledWith('window-1', binding());
    for (const surface of ['main', 'interaction', 'right-manager', 'bottom-timeline', 'status']) {
      expect(container.querySelector(`[data-world-runtime-surface="${surface}"]`)).not.toBeNull();
    }
    expect(screen.getByText('North Gate')).toBeTruthy();
    expect(screen.getByText('weather')).toBeTruthy();
    expect(screen.getByText(/complete World Experience/u)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search World runtime'), {
      target: { value: 'missing' },
    });
    expect(container.querySelectorAll('.world-runtime__manager li')).toHaveLength(0);
    expect(screen.getByText('No matching items.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search World runtime'), {
      target: { value: 'actor-1' },
    });
    expect(screen.getByText('participant-1')).toBeTruthy();
  });

  it('fails visibly when Host returns another runtime binding', async () => {
    render(
      <WorldRuntimeRoot
        active
        binding={binding()}
        createIntentId={() => 'intent-1'}
        host={{
          getSnapshot: async () =>
            projection({ binding: { ...binding(), worldRunId: 'another-run' } }),
          launch: vi.fn(),
          submitAction: vi.fn(),
        }}
        locale="en"
        now={() => '2026-08-14T00:00:00.000Z'}
        windowId="window-1"
      />,
    );

    expect(await screen.findByText('Unable to open World Runtime')).toBeTruthy();
    expect(screen.getByText(/another exact binding/u)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Rain city' })).toBeNull();
  });

  it('submits one exact typed intent and waits for the authoritative projection', async () => {
    let resolveAction: ((value: WorldRuntimeProjection) => void) | undefined;
    const submitAction = vi.fn(
      (_windowId: string, _binding: WorldRuntimeBinding, _intent: WorldActionIntent) =>
        new Promise<WorldRuntimeProjection>((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(
      <WorldRuntimeRoot
        active
        binding={binding()}
        createIntentId={() => 'intent-1'}
        host={{ getSnapshot: async () => projection(), launch: vi.fn(), submitAction }}
        locale="en"
        now={() => '2026-08-14T00:00:00.000Z'}
        windowId="window-1"
      />,
    );

    await screen.findByRole('heading', { name: 'Rain city' });
    fireEvent.change(screen.getByLabelText('Parameters (JSON)'), {
      target: {
        value:
          '{"fact":{"factId":"fact-weather","key":"weather","value":"storm","visibility":{"kind":"public"},"knownByActorIds":["actor-1"]}}',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit action' }));

    await waitFor(() => expect(submitAction).toHaveBeenCalledOnce());
    const submitted = submitAction.mock.calls[0]?.[2];
    expect(submitted).toMatchObject({
      worldActionIntentId: 'intent-1',
      worldRunId: 'run-1',
      worldSaveId: 'save-1',
      branchId: 'branch-main',
      observedTimepoint: 3,
      expectedWorldStateRevision: 2,
    });
    expect(screen.getByText('rain')).toBeTruthy();
    expect(screen.queryByText('storm')).toBeNull();

    resolveAction?.(
      projection({
        facts: [{ factId: 'fact-weather', key: 'weather', value: 'storm' }],
        timepoint: 4,
        worldStateRevision: 3,
      }),
    );
    expect(await screen.findByText('storm')).toBeTruthy();
  });

  it('drops a late snapshot after the Runtime Root is unmounted', async () => {
    let resolveSnapshot: ((value: WorldRuntimeProjection) => void) | undefined;
    const getSnapshot = vi.fn(
      () =>
        new Promise<WorldRuntimeProjection>((resolve) => {
          resolveSnapshot = resolve;
        }),
    );
    const { unmount } = render(
      <WorldRuntimeRoot
        active
        binding={binding()}
        createIntentId={() => 'intent-1'}
        host={{ getSnapshot, launch: vi.fn(), submitAction: vi.fn() }}
        locale="en"
        now={() => '2026-08-14T00:00:00.000Z'}
        windowId="window-1"
      />,
    );
    await waitFor(() => expect(getSnapshot).toHaveBeenCalledOnce());

    unmount();
    resolveSnapshot?.(projection());
    await Promise.resolve();
    expect(document.querySelector('[data-world-runtime-root="true"]')).toBeNull();
  });

  it('contains no local World fact reducer or alternate runtime authority', async () => {
    const source = await readFile(
      resolve(dirname(fileURLToPath(import.meta.url)), 'runtime.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/setFacts|useReducer|appendEvent|localStorage|worldFoundation/iu);
  });
});

function binding(): WorldRuntimeBinding {
  return {
    worldProjectId: 'world-1',
    worldVersionId: 'version-1',
    worldRunId: 'run-1',
    worldSaveId: 'save-1',
    branchId: 'branch-main',
    participantId: 'participant-1',
    actorId: 'actor-1',
  };
}

function projection(overrides: Partial<WorldRuntimeProjection> = {}): WorldRuntimeProjection {
  return {
    binding: binding(),
    status: 'ready',
    background: 'Rain city',
    locations: [
      { definitionId: 'location-1', name: 'North Gate', description: 'Closed at high tide.' },
    ],
    facts: [{ factId: 'fact-weather', key: 'weather', value: 'rain' }],
    availableActions: ['world.foundation.fact.set'],
    participants: [{ participantId: 'participant-1', actorId: 'actor-1' }],
    worldStateRevision: 2,
    timepoint: 3,
    branches: [{ branchId: 'branch-main', active: true, eventCount: 1 }],
    timeline: [
      {
        worldEventId: 'event-1',
        actorId: 'actor-1',
        action: 'world.foundation.fact.set',
        timepoint: 3,
        committedAt: '2026-08-14T00:00:00.000Z',
      },
    ],
    diagnostics: [],
    ...overrides,
  };
}
