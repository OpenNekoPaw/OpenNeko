import type { WorldFoundationCommand, WorldFoundationSnapshot } from '@neko/world/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldFoundationRoot } from './root';

const now = '2026-08-10T10:00:00.000Z';

function emptySnapshot(): WorldFoundationSnapshot {
  return { world: { projects: [], versions: [], runtimes: [] }, diagnostics: [] };
}

describe('WorldFoundationRoot', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates a WorldProject through the injected typed Host port', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001',
    );
    const execute = vi.fn(
      async (_command: WorldFoundationCommand): Promise<WorldFoundationSnapshot> => emptySnapshot(),
    );
    render(
      <WorldFoundationRoot
        active
        host={{ getSnapshot: async () => emptySnapshot(), execute }}
        locale="en"
      />,
    );

    await screen.findByRole('heading', { name: 'Define world' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Archive City' } });
    fireEvent.change(screen.getByLabelText('Background'), {
      target: { value: 'A city built around a sealed archive.' },
    });
    fireEvent.change(screen.getByLabelText(/^Initial facts/u), {
      target: { value: 'archive.open = false' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    const command = execute.mock.calls[0]?.[0];
    expect(command).toMatchObject({
      operation: 'world-project-create',
      input: {
        title: 'Archive City',
        draft: {
          background: 'A city built around a sealed archive.',
          initialFacts: [{ key: 'archive.open', value: false }],
        },
      },
    });
  });

  it('reviews a sourced transformation candidate before the canonical commit', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000002',
    );
    const snapshot = runtimeSnapshot();
    const execute = vi.fn(
      async (_command: WorldFoundationCommand): Promise<WorldFoundationSnapshot> => snapshot,
    );
    render(
      <WorldFoundationRoot
        active
        host={{ getSnapshot: async () => snapshot, execute }}
        locale="en"
      />,
    );

    await screen.findByText(
      'Complete World Experience, Story, Gameplay, realtime AI, game engines, and world models are not enabled.',
    );
    fireEvent.change(screen.getByLabelText('Fact key'), { target: { value: 'city.weather' } });
    fireEvent.change(screen.getByLabelText('JSON value'), { target: { value: '"rain"' } });
    fireEvent.change(screen.getByLabelText('Transformation intent'), {
      target: { value: 'Turn the archive city into a rainy night.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare candidate' }));

    expect(execute).not.toHaveBeenCalled();
    expect(screen.getByText('Transformation candidate')).toBeTruthy();
    expect(screen.getAllByText('Turn the archive city into a rainy night.')).toHaveLength(2);
    expect(screen.getByText('world-action:world.foundation.fact.set')).toBeTruthy();
    expect(screen.getByText('world-fact:00000000-0000-4000-8000-000000000002')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Apply transformation' }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      operation: 'world-transformation-state-commit',
      input: {
        category: 'world-state',
        owner: 'world-runtime',
        requester: { actorId: 'foundation-author', authority: 'author' },
        base: {
          worldRunId: 'run-a',
          worldSaveId: 'save-a',
          branchId: 'branch-main',
          worldStateRevision: 0,
        },
        source: { intent: 'Turn the archive city into a rainy night.' },
        diff: [{ operation: 'add', after: { key: 'city.weather', value: 'rain' } }],
        requirements: [
          {
            capabilityKind: 'world-action',
            capabilityId: 'world.foundation.fact.set',
            mode: 'required',
          },
        ],
      },
    });
    await screen.findByText(
      'Exact capability resolved and committed through the WorldRuntime event path.',
    );
    expect(screen.queryByText('Enter World Experience')).toBeNull();
  });

  it('keeps a failed candidate reviewable and supports dismissing it', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000003',
    );
    const snapshot = runtimeSnapshot();
    const execute = vi.fn(async () => {
      throw new Error("World capability 'world.foundation.fact.set' is unavailable.");
    });
    render(
      <WorldFoundationRoot
        active
        host={{ getSnapshot: async () => snapshot, execute }}
        locale="en"
      />,
    );

    await screen.findByText('Propose World transformation');
    fireEvent.change(screen.getByLabelText('Fact key'), { target: { value: 'city.weather' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare candidate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply transformation' }));

    await screen.findByText('Needs attention');
    expect(
      screen.getAllByText("World capability 'world.foundation.fact.set' is unavailable."),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Transformation candidate')).toBeNull();
  });

  it('keeps an invalid transformation draft local and visible', async () => {
    const snapshot = runtimeSnapshot();
    const execute = vi.fn(
      async (_command: WorldFoundationCommand): Promise<WorldFoundationSnapshot> => snapshot,
    );
    render(
      <WorldFoundationRoot
        active
        host={{ getSnapshot: async () => snapshot, execute }}
        locale="en"
      />,
    );

    await screen.findByText('Propose World transformation');
    fireEvent.change(screen.getByLabelText('Fact key'), { target: { value: 'city.weather' } });
    fireEvent.change(screen.getByLabelText('JSON value'), { target: { value: 'tru"rain"' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prepare candidate' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Invalid JSON value');
    expect(screen.queryByText('Transformation candidate')).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });
});

function runtimeSnapshot(): WorldFoundationSnapshot {
  const definition = {
    background: 'A city of archives.',
    worldBook: [],
    locations: [],
    organizations: [],
    rules: [],
    initialFacts: [],
  };
  return {
    world: {
      projects: [
        {
          worldProjectId: 'world-a',
          title: 'Archive City',
          draft: definition,
          sourceRefs: [],
          reviewStatus: 'ready',
          createdAt: now,
          updatedAt: now,
        },
      ],
      versions: [
        {
          worldVersionId: 'version-a',
          worldProjectId: 'world-a',
          label: 'First publication',
          definition,
          acceptedSourceRefIds: [],
          publishedAt: now,
        },
      ],
      runtimes: [
        {
          run: {
            worldRunId: 'run-a',
            worldVersionId: 'version-a',
            worldSaveId: 'save-a',
            branchId: 'branch-main',
            worldStateRevision: 0,
            timepoint: 0,
            createdAt: now,
          },
          save: {
            worldSaveId: 'save-a',
            worldRunId: 'run-a',
            worldVersionId: 'version-a',
            label: 'Foundation preview',
            activeBranchId: 'branch-main',
            branches: [
              {
                branchId: 'branch-main',
                events: [],
                state: {
                  worldVersionId: 'version-a',
                  worldRunId: 'run-a',
                  worldSaveId: 'save-a',
                  branchId: 'branch-main',
                  worldStateRevision: 0,
                  timepoint: 0,
                  facts: [],
                },
              },
            ],
            createdAt: now,
            updatedAt: now,
          },
        },
      ],
    },
    diagnostics: [],
  };
}
