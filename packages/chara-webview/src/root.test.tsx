import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterFoundationCommand,
  type CharacterFoundationSnapshot,
  type CharacterAuthoringSnapshot,
  type OpenNekoDesktopCharacterBridge,
  type OpenNekoDesktopCharacterRoomWorkbenchBridge,
  type RoomView,
} from '@neko/chara/contracts';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CharacterCatalogSurface,
  CharacterAuthoringStudioRoot,
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
      storylineVersions: [],
      storylineRuns: [],
      storylineObservationCandidates: [],
      memoryScopes: [],
      presentationConfigurations: [],
    },
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
    await waitFor(() => {
      expect(container.querySelector('[data-neko-empty-state="fill"] svg')).not.toBeNull();
    });
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

  it('mounts the project-local authoring-only Studio from validated authority', async () => {
    const foundation = projectSnapshot();
    const project = foundation.character.projects[0]!;
    const snapshot: CharacterAuthoringSnapshot = {
      project,
      versions: foundation.character.versions,
      diagnostics: [],
    };
    const getSnapshot = vi.fn(async () => snapshot);
    const execute = vi.fn(async () => snapshot);
    const { container, unmount } = render(
      <CharacterAuthoringStudioRoot
        binding={{
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          contentProjectId: 'content-project-1',
          characterProjectId: project.characterProjectId,
        }}
        host={{ getSnapshot, execute }}
        initialSnapshot={snapshot}
        locale="en"
        windowId="window-1"
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Lin' })).toBeTruthy();
    expect(getSnapshot).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-character-studio-section="runtime-inventory"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-character-studio-section="storyline-authoring"]'),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Updated summary' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledWith(
      'window-1',
      expect.objectContaining({ characterProjectId: project.characterProjectId }),
      expect.objectContaining({ operation: 'character-project-update-draft' }),
    );
    unmount();
    expect(container.querySelector('[data-character-authoring-studio="true"]')).toBeNull();
  });

  it('filters the catalog and opens the exact project detail', async () => {
    const snapshot = projectSnapshot();
    const { container } = render(<Harness host={createHost(undefined, snapshot)} />);

    await screen.findByText('Lin');
    fireEvent.change(screen.getByLabelText('Search characters'), { target: { value: 'missing' } });
    expect(await screen.findByText('No matching characters')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search characters'), { target: { value: 'lin' } });
    fireEvent.click(await screen.findByRole('button', { name: /Lin/u }));

    expect(await screen.findByRole('heading', { name: 'Lin' })).toBeTruthy();
    expect(screen.getByLabelText('Display name')).toHaveProperty('disabled', true);
    expect(
      container.querySelector<HTMLDetailsElement>(
        '[data-character-studio-section="character-definition"]',
      )?.open,
    ).toBe(false);
    expect(
      container.querySelector<HTMLDetailsElement>('[data-character-studio-section="presentation"]')
        ?.open,
    ).toBe(false);
    expect(
      container.querySelector<HTMLDetailsElement>(
        '[data-character-studio-section="storyline-authoring"]',
      )?.open,
    ).toBe(false);
    expect(screen.getByLabelText('Background story')).toBeTruthy();
    expect(screen.getByLabelText('Origin setting')).toBeTruthy();
    expect(
      container.querySelector('[data-character-studio-section="portrait-resource"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-character-studio-section="avatar-resource"]'),
    ).toBeTruthy();
    expect(screen.getByText('Character capabilities and history')).toBeTruthy();
    expect(screen.getAllByText('Character storylines').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Character memory').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Relationship memory').length).toBeGreaterThan(0);
    expect(screen.getByText('Presentation resources')).toBeTruthy();
    expect(screen.getAllByText('Voice defaults').length).toBeGreaterThan(0);
    expect(screen.getByText('Runtime history')).toBeTruthy();
    expect(screen.getByLabelText(/^Voice provider/u)).toBeTruthy();
    expect(screen.getByLabelText('Default voice resource')).toBeTruthy();
    expect(screen.getByText('Publish a character storyline')).toBeTruthy();
    expect(screen.getByText('Candidates and accepted memories')).toBeTruthy();
    expect(screen.getByText('Review relationship memory independently')).toBeTruthy();
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
    const { container } = render(<Harness host={createHost(execute)} />);
    fireEvent.click(await screen.findByRole('button', { name: 'New character' }));
    await screen.findByRole('heading', { name: 'Define character' });

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Lin' } });
    fireEvent.change(screen.getByLabelText('Summary'), {
      target: { value: 'An archivist who guards the sealed tower.' },
    });
    const avatarResource = container.querySelector(
      '[data-character-studio-section="avatar-resource"]',
    );
    if (!(avatarResource instanceof HTMLInputElement))
      throw new Error('Avatar resource input is unavailable.');
    fireEvent.change(avatarResource, {
      target: { value: 'global-asset-library:avatar-lin' },
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
          backgroundStory: createEmptyCharacterBackgroundStory(),
          originSetting: createEmptyCharacterOriginSetting(),
          canon: [],
          knowledgeBoundary: [],
          behaviorPolicy: [],
          expressionPolicy: [],
          representationRefs: [
            {
              representationId: 'avatar-main',
              kind: 'vrm',
              resourceRef: 'global-asset-library:avatar-lin',
            },
          ],
          representationDefaults: { avatarRepresentationId: 'avatar-main' },
        },
      },
    });
    expect(await screen.findByRole('heading', { name: 'Lin' })).toBeTruthy();
  });

  it('saves editable Voice defaults through the Character draft authority', async () => {
    const snapshot = projectSnapshot();
    const execute = vi.fn(async () => snapshot);
    render(<Harness host={createHost(execute, snapshot)} />);
    fireEvent.click(await screen.findByRole('button', { name: /Lin/u }));

    fireEvent.change(screen.getByLabelText(/^Voice provider/u), {
      target: { value: 'provider:local-tts' },
    });
    fireEvent.change(screen.getByLabelText('Default voice resource'), {
      target: { value: 'global-asset-library:voice-lin' },
    });
    fireEvent.change(screen.getByLabelText('Voice speed'), { target: { value: '1.2' } });
    fireEvent.click(screen.getByLabelText('Auto read'));
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledWith({
      operation: 'character-project-update-draft',
      input: {
        characterProjectId: 'character-project:lin',
        draft: expect.objectContaining({
          representationRefs: [
            {
              representationId: 'voice-main',
              kind: 'voice',
              resourceRef: 'global-asset-library:voice-lin',
            },
          ],
          voiceDefaults: {
            providerRef: 'provider:local-tts',
            voiceRepresentationId: 'voice-main',
            speed: 1.2,
            autoRead: true,
          },
        }),
      },
    });
  });

  it('publishes an explicitly selected Character storyline through the strict Host command', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000002',
    );
    const base = projectSnapshot();
    const project = base.character.projects[0];
    if (!project) throw new Error('Storyline UI fixture requires a CharacterProject.');
    const snapshot: CharacterFoundationSnapshot = {
      ...base,
      character: {
        ...base.character,
        versions: [
          {
            characterVersionId: 'character-version:lin',
            characterProjectId: project.characterProjectId,
            label: 'Published Lin',
            definition: project.draft,
            acceptedEvidenceIds: [],
            publishedAt: '2026-08-09T00:00:00.000Z',
          },
        ],
      },
    };
    const execute = vi.fn(async () => snapshot);
    render(<Harness host={createHost(execute, snapshot)} />);
    fireEvent.click(await screen.findByRole('button', { name: /Lin/u }));
    fireEvent.click(screen.getByText('Publish a character storyline'));

    fireEvent.change(screen.getByLabelText('Character version'), {
      target: { value: 'character-version:lin' },
    });
    fireEvent.change(screen.getByLabelText('Storyline label'), {
      target: { value: 'Trust arc' },
    });
    fireEvent.change(screen.getByLabelText('Premise'), {
      target: { value: 'The sealed archive opens.' },
    });
    fireEvent.change(screen.getByLabelText('Desire'), {
      target: { value: 'Protect its record.' },
    });
    fireEvent.change(screen.getByLabelText('Conflict'), {
      target: { value: 'The record must be shared.' },
    });
    fireEvent.change(screen.getByLabelText('Growth arc'), {
      target: { value: 'Learn to trust a witness.' },
    });
    fireEvent.change(screen.getByLabelText('Initial stage'), {
      target: { value: 'Guarded' },
    });
    fireEvent.change(screen.getByLabelText('Stage description'), {
      target: { value: 'Keeps distance.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish storyline' }));

    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledWith({
      operation: 'character-storyline-publish',
      input: {
        characterStorylineVersionId:
          'character-storyline-version:00000000-0000-4000-8000-000000000002',
        characterVersionId: 'character-version:lin',
        label: 'Trust arc',
        premise: 'The sealed archive opens.',
        desire: 'Protect its record.',
        conflict: 'The record must be shared.',
        growthArc: 'Learn to trust a witness.',
        stages: [
          {
            stageId: 'character-storyline-stage:00000000-0000-4000-8000-000000000002',
            title: 'Guarded',
            description: 'Keeps distance.',
          },
        ],
        turningPoints: [],
        constraints: [],
        acceptedEvidenceIds: [],
      },
    });
  });

  it('accepts a Character memory candidate with the exact CAS revision', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000003',
    );
    const base = projectSnapshot();
    const project = base.character.projects[0];
    if (!project) throw new Error('Memory UI fixture requires a CharacterProject.');
    const snapshot: CharacterFoundationSnapshot = {
      ...base,
      character: {
        ...base.character,
        versions: [
          {
            characterVersionId: 'character-version:lin',
            characterProjectId: project.characterProjectId,
            label: 'Published Lin',
            definition: project.draft,
            acceptedEvidenceIds: [],
            publishedAt: '2026-08-09T00:00:00.000Z',
          },
        ],
        characterRuns: [
          {
            characterRunId: 'character-run:lin',
            characterVersionId: 'character-version:lin',
            characterMemoryScopeId: 'character-memory-scope:lin',
            participantId: 'participant:lin',
            controller: { kind: 'agent', primaryAgentSessionId: 'conversation:character:lin' },
            runtimeBinding: { kind: 'companion', relationshipId: 'relationship:lin' },
            createdAt: '2026-08-09T00:00:00.000Z',
          },
        ],
        memoryScopes: [
          {
            characterMemoryScopeId: 'character-memory-scope:lin',
            characterRunId: 'character-run:lin',
            memoryRevision: 4,
            candidates: [
              {
                characterMemoryCandidateId: 'character-memory-candidate:rain',
                characterMemoryScopeId: 'character-memory-scope:lin',
                content: 'The user waited in the rain.',
                sourceRef: 'room-event:rain',
                observedAt: '2026-08-09T01:00:00.000Z',
                sensitivityTraits: [],
                retentionTraits: ['long-term'],
                expectedMemoryRevision: 4,
                status: 'pending',
              },
            ],
            entries: [],
            createdAt: '2026-08-09T00:00:00.000Z',
            updatedAt: '2026-08-09T01:00:00.000Z',
          },
        ],
      },
    };
    const execute = vi.fn(async () => snapshot);
    render(<Harness host={createHost(execute, snapshot)} />);
    fireEvent.click(await screen.findByRole('button', { name: /Lin/u }));
    fireEvent.click(screen.getByText('Candidates and accepted memories'));
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledWith({
      operation: 'character-memory-candidate-accept',
      input: {
        characterMemoryScopeId: 'character-memory-scope:lin',
        characterMemoryCandidateId: 'character-memory-candidate:rain',
        characterMemoryEntryId: 'character-memory-entry:00000000-0000-4000-8000-000000000003',
        expectedMemoryRevision: 4,
      },
    });
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
    expect(
      container
        .querySelector('[data-character-room-feed]')
        ?.getAttribute('data-room-cover-resource-ref'),
    ).toBe('global-asset-library:room-cover-a');
    expect(
      container
        .querySelector('[data-participant-id="participant-agent"]')
        ?.getAttribute('data-participant-portrait-resource-ref'),
    ).toBe('global-asset-library:portrait-lin');
    expect(
      container
        .querySelector('[data-participant-id="participant-user"]')
        ?.getAttribute('data-room-speaker-active'),
    ).toBe('true');
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
    expect(
      container
        .querySelector('[data-participant-id="participant-agent"]')
        ?.getAttribute('data-room-speaker-active'),
    ).toBe('true');
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
      <CharacterRoomInteractionFeed
        identity={{
          roomRunId: 'room-run-a',
          title: 'Archive Room',
          coverResourceRef: 'global-asset-library:room-cover-a',
          participants: [
            { participantId: 'participant-user', displayName: 'User' },
            {
              participantId: 'participant-agent',
              displayName: 'Lin',
              portraitResourceRef: 'global-asset-library:portrait-lin',
            },
          ],
        }}
        locale="en"
        state={state}
      />
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
            backgroundStory: createEmptyCharacterBackgroundStory(),
            originSetting: createEmptyCharacterOriginSetting(),
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
