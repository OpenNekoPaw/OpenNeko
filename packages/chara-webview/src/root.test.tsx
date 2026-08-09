import type {
  CharacterFoundationCommand,
  CharacterFoundationSnapshot,
  OpenNekoDesktopCharacterBridge,
  OpenNekoDesktopCharacterRoomWorkbenchBridge,
  RoomView,
} from '@neko/chara/contracts';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CharacterCatalogSurface,
  CharacterDetailSurface,
  CharacterRoomInteractionFeed,
  CharacterRoomTimelineSurface,
  type CharacterDetailSelection,
  useCharacterManagementRuntime,
  useCharacterRoomWorkbenchRuntime,
} from './root';

function emptySnapshot(): CharacterFoundationSnapshot {
  return {
    character: {
      projects: [],
      versions: [],
      relationships: [],
      characterRuns: [],
      dialogueRuns: [],
      rooms: [],
      roomRuns: [],
    },
    world: { projects: [], versions: [], runtimes: [] },
    diagnostics: [],
  };
}

describe('Character Management surfaces', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads one catalog and exposes no Dialogue, Room or World peer tabs', async () => {
    const { container } = render(<Harness host={createHost()} />);

    expect(await screen.findByRole('heading', { name: 'Characters' })).toBeTruthy();
    expect(
      screen.getByText('Manage characters used in creation, dialogue, and interaction.'),
    ).toBeTruthy();
    expect(container.querySelector('[data-neko-empty-state="fill"] svg')).not.toBeNull();
    const viewSwitcher = container.querySelector('.character-management__view-switcher');
    expect(viewSwitcher?.querySelectorAll('button')).toHaveLength(2);
    expect(viewSwitcher?.querySelector('button:first-child')?.getAttribute('aria-label')).toBe(
      'List view',
    );
    expect(screen.queryByRole('navigation', { name: 'Character workspace views' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dialogues' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rooms' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'World Foundation' })).toBeNull();
  });

  it('filters the catalog and opens the exact project detail', async () => {
    const snapshot = projectSnapshot();
    render(<Harness host={createHost(undefined, snapshot)} />);

    await screen.findByText('Lin');
    fireEvent.change(screen.getByLabelText('Search characters'), { target: { value: 'missing' } });
    expect(await screen.findByText('No matching characters')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search characters'), { target: { value: 'lin' } });
    fireEvent.click(await screen.findByRole('button', { name: /Lin/u }));

    expect(await screen.findByRole('heading', { name: 'Lin' })).toBeTruthy();
    expect(screen.getByLabelText('Display name')).toHaveProperty('disabled', true);
  });

  it('submits Character creation through the injected typed Host port', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001',
    );
    const execute = vi.fn(
      async (command: CharacterFoundationCommand): Promise<CharacterFoundationSnapshot> => {
        const snapshot = emptySnapshot();
        if (command.operation !== 'character-project-create') return snapshot;
        return {
          ...snapshot,
          character: {
            ...snapshot.character,
            projects: [
              {
                characterProjectId: command.input.characterProjectId,
                displayName: command.input.displayName,
                draft: command.input.draft,
                evidence: [],
                candidates: [],
                reviewStatus: 'draft',
                createdAt: '2026-08-09T00:00:00.000Z',
                updatedAt: '2026-08-09T00:00:00.000Z',
              },
            ],
          },
        };
      },
    );
    render(<Harness host={createHost(execute)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'New character' }));
    await screen.findByRole('heading', { name: 'Define character' });

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Lin' } });
    fireEvent.change(screen.getByLabelText('Summary'), {
      target: { value: 'An archivist who guards the sealed tower.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenCalledWith({
      operation: 'character-project-create',
      input: {
        characterProjectId: 'character-project:00000000-0000-4000-8000-000000000001',
        displayName: 'Lin',
        draft: {
          summary: 'An archivist who guards the sealed tower.',
          canon: [],
          knowledgeBoundary: [],
          behaviorPolicy: [],
          expressionPolicy: [],
          representationRefs: [],
        },
      },
    });
    expect(await screen.findByRole('heading', { name: 'Lin' })).toBeTruthy();
  });

  it('keeps a snapshot failure visible and retries the same catalog path', async () => {
    const getSnapshot = vi
      .fn<OpenNekoDesktopCharacterBridge['characterFoundation']['getSnapshot']>()
      .mockRejectedValueOnce(new Error('Character catalog unavailable'))
      .mockResolvedValueOnce(emptySnapshot());
    render(<Harness host={{ getSnapshot, execute: vi.fn() }} />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Character catalog unavailable',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Characters' })).toBeTruthy();
    expect(getSnapshot).toHaveBeenCalledTimes(2);
  });

  it('keeps a command failure visible without replacing the create detail', async () => {
    const execute = vi.fn<OpenNekoDesktopCharacterBridge['characterFoundation']['execute']>();
    execute.mockRejectedValue(new Error('Character project write rejected'));
    render(<Harness host={createHost(execute)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'New character' }));
    await screen.findByRole('heading', { name: 'Define character' });

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Lin' } });
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Summary' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Character project write rejected',
    );
    expect(screen.getByRole('heading', { name: 'Define character' })).toBeTruthy();
  });
});

describe('Character Room Workbench surfaces', () => {
  it('renders Interaction and Timeline from one subscribed RoomView', async () => {
    let publish:
      | Parameters<
          OpenNekoDesktopCharacterRoomWorkbenchBridge['characterRoomWorkbench']['subscribe']
        >[1]
      | undefined;
    const initial = roomView('First room message.');
    const host: OpenNekoDesktopCharacterRoomWorkbenchBridge['characterRoomWorkbench'] = {
      getSnapshot: vi.fn(async () => initial),
      subscribe: vi.fn((_roomRunId, listener) => {
        publish = listener;
        return () => undefined;
      }),
    };
    const { container } = render(<RoomWorkbenchHarness host={host} />);

    expect(await screen.findByText('First room message.')).toBeTruthy();
    expect(container.querySelector('[data-character-room-feed]')?.textContent).toContain(
      'First room message.',
    );
    expect(container.querySelector('[data-character-room-timeline]')?.textContent).toContain(
      'First room message.',
    );
    if (!publish) throw new Error('Room Workbench subscription was not attached.');
    const updated = roomView('Accepted character response.', 2);
    await act(async () =>
      publish?.({ requestId: 'room-workbench-test', sequence: 1, projection: updated }),
    );

    expect(await screen.findByText('Accepted character response.')).toBeTruthy();
    expect(container.querySelector('[data-character-room-feed]')?.textContent).toContain(
      'Accepted character response.',
    );
    expect(container.querySelector('[data-character-room-timeline]')?.textContent).toContain(
      'Accepted character response.',
    );
  });
});

function Harness({
  host,
}: {
  readonly host: OpenNekoDesktopCharacterBridge['characterFoundation'];
}): JSX.Element {
  const runtime = useCharacterManagementRuntime({ active: true, host });
  const [selection, setSelection] = useState<CharacterDetailSelection>();
  return (
    <>
      <CharacterCatalogSurface
        locale="en"
        onCreate={() => setSelection({ kind: 'create' })}
        onSelect={(characterProjectId) => setSelection({ kind: 'project', characterProjectId })}
        runtime={runtime}
        selectedProjectId={selection?.kind === 'project' ? selection.characterProjectId : undefined}
      />
      <CharacterDetailSurface
        locale="en"
        onCreated={(characterProjectId) => setSelection({ kind: 'project', characterProjectId })}
        runtime={runtime}
        selection={selection}
      />
    </>
  );
}

function RoomWorkbenchHarness({
  host,
}: {
  readonly host: OpenNekoDesktopCharacterRoomWorkbenchBridge['characterRoomWorkbench'];
}): JSX.Element {
  const state = useCharacterRoomWorkbenchRuntime({
    active: true,
    roomRunId: 'room-run-a',
    host,
  });
  return (
    <>
      <CharacterRoomInteractionFeed locale="en" state={state} />
      <CharacterRoomTimelineSurface locale="en" state={state} />
    </>
  );
}

function createHost(
  execute: OpenNekoDesktopCharacterBridge['characterFoundation']['execute'] = vi.fn(async () =>
    emptySnapshot(),
  ),
  snapshot: CharacterFoundationSnapshot = emptySnapshot(),
): OpenNekoDesktopCharacterBridge['characterFoundation'] {
  return { getSnapshot: vi.fn(async () => snapshot), execute };
}

function projectSnapshot(): CharacterFoundationSnapshot {
  return {
    ...emptySnapshot(),
    character: {
      ...emptySnapshot().character,
      projects: [
        {
          characterProjectId: 'character-project:lin',
          displayName: 'Lin',
          draft: {
            summary: 'An archivist.',
            canon: [],
            knowledgeBoundary: [],
            behaviorPolicy: [],
            expressionPolicy: [],
            representationRefs: [],
          },
          evidence: [],
          candidates: [],
          reviewStatus: 'draft',
          createdAt: '2026-08-09T00:00:00.000Z',
          updatedAt: '2026-08-09T00:00:00.000Z',
        },
      ],
    },
  };
}

function roomView(content: string, roomRevision = 1): RoomView {
  return {
    roomRunId: 'room-run-a',
    roomRevision,
    participantId: 'participant-user',
    participants: [
      {
        participantId: 'participant-user',
        displayName: 'User',
        controller: { kind: 'human', userId: 'user:local' },
      },
      {
        participantId: 'participant-agent',
        displayName: 'Lin',
        characterVersionId: 'character-version-lin',
        controller: {
          kind: 'agent',
          characterRunId: 'character-run-lin',
          primaryAgentSessionId: 'conversation:character:lin',
        },
      },
    ],
    events: Array.from({ length: roomRevision }, (_, index) => ({
      kind: 'message' as const,
      roomEventId: `room-event-${String(index + 1)}`,
      roomRunId: 'room-run-a',
      sequence: index + 1,
      createdAt: '2026-08-09T10:00:00.000Z',
      visibility: { kind: 'public' as const },
      authorParticipantId: index === 0 ? 'participant-user' : 'participant-agent',
      content: index + 1 === roomRevision ? content : 'First room message.',
      mentionedParticipantIds: [],
    })),
  };
}
