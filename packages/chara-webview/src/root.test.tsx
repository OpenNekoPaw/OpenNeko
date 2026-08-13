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
  CharacterCompanionContinuitySurface,
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
      storylines: [],
      storylineDrafts: [],
      storylineVersions: [],
      companionContinuities: [],
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

  it('hands quick generation to the Agent entry without creating a Character', async () => {
    const execute = vi.fn();
    const { container } = render(<Harness host={createHost(execute)} />);

    await screen.findByRole('heading', { name: 'Characters' });
    fireEvent.click(screen.getByRole('button', { name: 'Quick generate' }));

    expect(container.querySelector('output')?.getAttribute('data-quick-generation-count')).toBe(
      '1',
    );
    expect(execute).not.toHaveBeenCalled();
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
    expect(container.querySelector('[data-character-studio-section="presentation"]')).toBeNull();
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
          representationRefs: [],
        },
        sources: { evidence: [], assetRepresentations: [] },
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
    fireEvent.change(screen.getByLabelText('Character state'), {
      target: { value: 'Protect its record.' },
    });
    fireEvent.change(screen.getByLabelText('Relationship state'), {
      target: { value: 'The record must be shared.' },
    });
    fireEvent.change(screen.getByLabelText('Narrative memories'), {
      target: { value: 'Learn to trust a witness.' },
    });
    fireEvent.change(screen.getByLabelText('Node title'), {
      target: { value: 'Guarded' },
    });
    fireEvent.change(screen.getByLabelText('Current situation'), {
      target: { value: 'Keeps distance.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish storyline' }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(execute).toHaveBeenNthCalledWith(1, {
      operation: 'character-storyline-create',
      input: {
        characterStorylineId: 'character-storyline:00000000-0000-4000-8000-000000000002',
        characterProjectId: project.characterProjectId,
        displayName: 'Trust arc',
        draft: {
          characterVersionId: 'character-version:lin',
          premise: 'The sealed archive opens.',
          constraints: [],
          nodeOrder: ['storyline-node:00000000-0000-4000-8000-000000000002'],
          nodes: [
            {
              storylineNodeId: 'storyline-node:00000000-0000-4000-8000-000000000002',
              title: 'Guarded',
              spoilerVisibility: 'visible',
              context: {
                situation: 'Keeps distance.',
                characterState: 'Protect its record.',
                relationshipState: 'The record must be shared.',
                allowedStoryFacts: [],
                forbiddenStoryFacts: [],
                narrativeMemories: ['Learn to trust a witness.'],
                knowledgeBoundary: [],
                behaviorConstraints: [],
                expressionConstraints: [],
                authorOnlyNotes: [],
              },
            },
          ],
          edges: [],
        },
      },
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      operation: 'character-storyline-publish',
      input: {
        characterStorylineId: 'character-storyline:00000000-0000-4000-8000-000000000002',
        characterStorylineVersionId:
          'character-storyline-version:00000000-0000-4000-8000-000000000002',
        label: 'Trust arc',
      },
    });
  });

  it('edits a stable Storyline draft and compares, restores, and deletes authored publications', async () => {
    const base = projectSnapshot();
    const project = base.character.projects[0];
    if (!project) throw new Error('Storyline catalog fixture requires a CharacterProject.');
    const firstNode = {
      storylineNodeId: 'storyline-node:opening',
      title: 'Opening',
      spoilerVisibility: 'visible' as const,
      context: {
        situation: 'The archive is sealed.',
        characterState: 'Guarded',
        relationshipState: 'Distant',
        allowedStoryFacts: [],
        forbiddenStoryFacts: [],
        narrativeMemories: ['The seal has never opened.'],
        knowledgeBoundary: [],
        behaviorConstraints: [],
        expressionConstraints: [],
        authorOnlyNotes: [],
      },
    };
    const secondNode = {
      ...firstNode,
      title: 'Opening revised',
      context: { ...firstNode.context, situation: 'The archive seal is breaking.' },
    };
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
        storylines: [
          {
            characterStorylineId: 'character-storyline:trust',
            characterProjectId: project.characterProjectId,
            displayName: 'Trust arc',
            createdAt: '2026-08-09T00:00:00.000Z',
            updatedAt: '2026-08-10T00:00:00.000Z',
          },
        ],
        storylineDrafts: [
          {
            characterStorylineId: 'character-storyline:trust',
            characterVersionId: 'character-version:lin',
            premise: 'A guarded archive.',
            constraints: [],
            nodeOrder: ['storyline-node:opening'],
            nodes: [secondNode],
            edges: [],
            updatedAt: '2026-08-10T00:00:00.000Z',
          },
        ],
        storylineVersions: [
          {
            characterStorylineVersionId: 'character-storyline-version:first',
            characterStorylineId: 'character-storyline:trust',
            characterVersionId: 'character-version:lin',
            label: 'First publication',
            premise: 'A sealed archive.',
            constraints: [],
            nodeOrder: ['storyline-node:opening'],
            nodes: [firstNode],
            edges: [],
            publishedAt: '2026-08-09T00:00:00.000Z',
          },
          {
            characterStorylineVersionId: 'character-storyline-version:second',
            characterStorylineId: 'character-storyline:trust',
            characterVersionId: 'character-version:lin',
            label: 'Second publication',
            premise: 'A guarded archive.',
            constraints: [],
            nodeOrder: ['storyline-node:opening'],
            nodes: [secondNode],
            edges: [],
            publishedAt: '2026-08-10T00:00:00.000Z',
          },
        ],
      },
    };
    const execute = vi.fn(async () => snapshot);
    render(<Harness host={createHost(execute, snapshot)} />);
    fireEvent.click(await screen.findByRole('button', { name: /Lin/u }));
    fireEvent.click(screen.getByText('Publish a character storyline'));
    fireEvent.change(screen.getByLabelText('Character storyline'), {
      target: { value: 'character-storyline:trust' },
    });

    expect(screen.getByLabelText('Node title')).toHaveProperty('value', 'Opening revised');
    expect(screen.queryByText(/progress|transition|complete/i)).toBeNull();
    fireEvent.change(screen.getByLabelText('Left publication'), {
      target: { value: 'character-storyline-version:first' },
    });
    fireEvent.change(screen.getByLabelText('Right publication'), {
      target: { value: 'character-storyline-version:second' },
    });
    expect(screen.getByText('Opening')).toBeTruthy();
    expect(screen.getAllByText('Opening revised').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: 'Restore as draft' })[0]!);
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith({
        operation: 'character-storyline-restore-as-draft',
        input: {
          characterStorylineId: 'character-storyline:trust',
          characterStorylineVersionId: 'character-storyline-version:first',
        },
      }),
    );
    expect(screen.getByLabelText('Node title')).toHaveProperty('value', 'Opening');

    fireEvent.click(screen.getByRole('button', { name: 'Delete selected storyline' }));
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith({
        operation: 'character-storyline-delete',
        input: { characterStorylineId: 'character-storyline:trust' },
      }),
    );
  });

  it('accepts a Companion continuity candidate with the exact CAS revision', async () => {
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
            participantId: 'participant:lin',
            controller: { kind: 'agent', primaryAgentSessionId: 'conversation:character:lin' },
            runtimeBinding: {
              kind: 'companion',
              companionContinuityId: 'companion-continuity:lin',
              relationshipId: 'relationship:lin',
            },
            createdAt: '2026-08-09T00:00:00.000Z',
          },
        ],
        companionContinuities: [
          {
            companionContinuityId: 'companion-continuity:lin',
            userId: 'user:local',
            characterProjectId: project.characterProjectId,
            continuityRevision: 4,
            candidates: [
              {
                companionMemoryCandidateId: 'companion-memory-candidate:rain',
                companionContinuityId: 'companion-continuity:lin',
                sourceCharacterVersionId: 'character-version:lin',
                provenance: {
                  kind: 'room-event',
                  roomRunId: 'room-run:rain',
                  roomEventId: 'room-event:rain',
                },
                content: 'The user waited in the rain.',
                compatibility: {
                  requiredCanonFacts: [],
                  prohibitedKnowledgeBoundaries: [],
                  requiredBehaviorPolicies: [],
                },
                sensitivityTraits: [],
                retentionTraits: ['long-term'],
                expectedContinuityRevision: 4,
                status: 'pending',
                createdAt: '2026-08-09T01:00:00.000Z',
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
      operation: 'companion-memory-candidate-accept',
      input: {
        companionContinuityId: 'companion-continuity:lin',
        companionMemoryCandidateId: 'companion-memory-candidate:rain',
        companionMemoryEntryId: 'companion-memory-entry:00000000-0000-4000-8000-000000000003',
        expectedContinuityRevision: 4,
      },
    });
  });

  it('keeps a snapshot failure visible and retries the same catalog path', async () => {
    const getSnapshot = vi
      .fn<OpenNekoDesktopCharacterBridge['characterFoundation']['getSnapshot']>()
      .mockRejectedValueOnce(new Error('Character catalog unavailable'))
      .mockResolvedValueOnce(emptySnapshot());
    render(
      <Harness
        host={{
          getSnapshot,
          getConversationLaunchCatalog: vi.fn(async () => ({ targets: [], diagnostics: [] })),
          execute: vi.fn(),
        }}
      />,
    );

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

describe('Character Companion continuity surface', () => {
  it('shows Companion memory candidates and keeps Narrative context session-only', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000004',
    );
    const companionRun = {
      characterRunId: 'character-run:companion',
      characterVersionId: 'character-version:companion',
      participantId: 'participant:companion',
      controller: { kind: 'agent' as const, primaryAgentSessionId: 'conversation:companion' },
      runtimeBinding: {
        kind: 'companion' as const,
        companionContinuityId: 'continuity:companion',
        relationshipId: 'relationship:companion',
      },
      createdAt: '2026-08-12T00:00:00.000Z',
    };
    const narrativeRun = {
      characterRunId: 'character-run:narrative',
      characterVersionId: 'character-version:narrative',
      participantId: 'participant:narrative',
      controller: { kind: 'agent' as const, primaryAgentSessionId: 'conversation:narrative' },
      runtimeBinding: { kind: 'narrative' as const },
      createdAt: '2026-08-12T00:00:00.000Z',
    };
    const snapshot: CharacterFoundationSnapshot = {
      ...emptySnapshot(),
      character: {
        ...emptySnapshot().character,
        characterRuns: [companionRun, narrativeRun],
        companionContinuities: [
          {
            companionContinuityId: 'continuity:companion',
            userId: 'user:local',
            characterProjectId: 'character-project:companion',
            continuityRevision: 2,
            candidates: [
              {
                companionMemoryCandidateId: 'candidate:tea',
                companionContinuityId: 'continuity:companion',
                sourceCharacterVersionId: 'character-version:companion',
                provenance: {
                  kind: 'conversation-turn',
                  conversationId: 'conversation:companion',
                  turnId: 'turn:1',
                },
                content: 'The user prefers jasmine tea.',
                compatibility: {
                  requiredCanonFacts: [],
                  prohibitedKnowledgeBoundaries: [],
                  requiredBehaviorPolicies: [],
                },
                sensitivityTraits: [],
                retentionTraits: ['long-term'],
                expectedContinuityRevision: 2,
                status: 'pending',
                createdAt: '2026-08-12T00:01:00.000Z',
              },
            ],
            entries: [],
            createdAt: '2026-08-12T00:00:00.000Z',
            updatedAt: '2026-08-12T00:01:00.000Z',
          },
        ],
      },
    };
    const execute = vi.fn(async () => snapshot);
    render(
      <CharacterCompanionContinuitySurface
        execute={execute}
        locale="en"
        runs={[companionRun, narrativeRun]}
        snapshot={snapshot}
      />,
    );

    expect(screen.getByText('The user prefers jasmine tea.')).not.toBeNull();
    expect(screen.getByText(/Session-only/u)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledWith({
      operation: 'companion-memory-candidate-accept',
      input: {
        companionContinuityId: 'continuity:companion',
        companionMemoryCandidateId: 'candidate:tea',
        companionMemoryEntryId: 'companion-memory-entry:00000000-0000-4000-8000-000000000004',
        expectedContinuityRevision: 2,
      },
    });
    execute.mockRejectedValueOnce(new Error('Continuity revision changed.'));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Continuity revision changed.');
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
  const [quickGenerationCount, setQuickGenerationCount] = useState(0);
  return (
    <>
      <CharacterCatalogSurface
        locale="en"
        onCreate={() => setSelection({ kind: 'create' })}
        onQuickGenerate={() => setQuickGenerationCount((count) => count + 1)}
        onSelect={(characterProjectId) => setSelection({ kind: 'project', characterProjectId })}
        runtime={runtime}
        selectedProjectId={selection?.kind === 'project' ? selection.characterProjectId : undefined}
      />
      <output data-quick-generation-count={quickGenerationCount} />
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
  return {
    getSnapshot: vi.fn(async () => snapshot),
    getConversationLaunchCatalog: vi.fn(async () => ({ targets: [], diagnostics: [] })),
    execute,
  };
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
