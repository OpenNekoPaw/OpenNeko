import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterFoundationCommand,
  type CharacterFoundationSnapshot,
  type CharacterAuthoringCommand,
  type CharacterAuthoringSnapshot,
  type CharacterProject,
  type CharacterVersion,
  type OpenNekoDesktopCharacterBridge,
  type OpenNekoDesktopCharacterRoomWorkbenchBridge,
  type RoomView,
} from '@neko/chara/contracts';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CharacterCatalogSurface,
  CharacterAuthoringSurface,
  CharacterCompanionContinuitySurface,
  CharacterDetailSurface,
  CharacterParticipantIdentityAvatar,
  CharacterRoomInteractionFeed,
  CharacterRoomTimelineSurface,
  type CharacterDetailSelection,
  type CharacterManagementDetailActions,
  useCharacterManagementRuntime,
  useCharacterRoomWorkbenchRuntime,
} from './root';
import { CharacterAuthoringEditor } from './character-panel';
import { CharacterVersionWorkspace } from './character-version-workspace';

function emptySnapshot(): CharacterFoundationSnapshot {
  return {
    character: {
      globalCharacters: [],
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
    const host = createHost();
    const { container } = render(<Harness host={host} />);

    expect(await screen.findByRole('heading', { name: 'Characters' })).toBeTruthy();
    expect(
      screen.getByText('Manage characters used in creation, dialogue, and interaction.'),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'My Characters' })).toBeTruthy();
    expect(screen.getByLabelText('0 characters')).toBeTruthy();
    await waitFor(() => {
      expect(container.querySelector('[data-neko-empty-state="fill"] svg')).not.toBeNull();
    });
    expect(container.querySelector('.character-management__hero-visual')).not.toBeNull();
    expect(container.querySelector('.character-management__catalog.is-empty')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Create from a Character template' })).toBeTruthy();
    expect(container.querySelector('[data-character-template="character-kit"]')).not.toBeNull();
    expect(container.querySelector('.character-management__view-switcher')).toBeNull();
    expect(screen.getByText('No characters yet. Add or import the first character.')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Character workspace views' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dialogues' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rooms' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'World Foundation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh characters' })).toBeNull();
    expect(host.getSnapshot).toHaveBeenCalledOnce();
  });

  it('mounts the project-local authoring-only Studio from validated authority', async () => {
    const foundation = projectSnapshot();
    const project = foundation.localProject;
    const snapshot: CharacterAuthoringSnapshot = {
      project,
      versions: foundation.localVersions,
      authoringTestSnapshots: [],
      storylines: foundation.character.storylines,
      storylineDrafts: foundation.character.storylineDrafts,
      storylineVersions: foundation.character.storylineVersions,
      lineage: null,
      referenceInventories: foundation.localVersions.map((version) => ({
        characterVersionId: version.characterVersionId,
        coverage: 'complete' as const,
        references: [],
        diagnostics: [],
      })),
      diagnostics: [],
    };
    const getSnapshot = vi.fn(async () => snapshot);
    const execute = vi.fn(
      async (_windowId: string, _binding: unknown, _command: CharacterAuthoringCommand) => snapshot,
    );
    const { container, unmount } = render(
      <CharacterAuthoringSurface
        binding={{
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          authority: { kind: 'project', projectId: 'project-1' },
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
    ).toBeTruthy();
    expect(
      container.querySelector('[data-character-studio-section="authoring-tests"]'),
    ).toBeTruthy();
    expect(container.querySelector('[data-character-studio-section="memory-review"]')).toBeNull();
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'Updated summary' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledWith(
      'window-1',
      expect.objectContaining({ characterProjectId: project.characterProjectId }),
      expect.objectContaining({ operation: 'character-project-update-draft' }),
    );
    unmount();
    expect(container.querySelector('[data-character-authoring-surface="true"]')).toBeNull();
  });

  it('keeps a finalized usable version when the exact Conversation launch fails', async () => {
    const foundation = projectSnapshot();
    const baseProject = foundation.localProject;
    const project = { ...baseProject, reviewStatus: 'ready' as const };
    const snapshot: CharacterAuthoringSnapshot = {
      project,
      versions: [],
      authoringTestSnapshots: [],
      storylines: [],
      storylineDrafts: [],
      storylineVersions: [],
      lineage: null,
      referenceInventories: [],
      diagnostics: [],
    };
    const execute = vi.fn(
      async (_windowId: string, _binding: unknown, _command: CharacterAuthoringCommand) => snapshot,
    );
    const onFinalizeAndStartConversation = vi.fn(async () => {
      throw new Error('Agent Entry is unavailable.');
    });
    render(
      <CharacterAuthoringSurface
        binding={{
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          authority: { kind: 'project', projectId: 'project-1' },
          characterProjectId: project.characterProjectId,
        }}
        host={{ getSnapshot: vi.fn(async () => snapshot), execute }}
        initialSnapshot={snapshot}
        locale="en"
        onFinalizeAndStartConversation={onFinalizeAndStartConversation}
        windowId="window-1"
      />,
    );

    fireEvent.change(screen.getByLabelText('Version label'), { target: { value: 'Ready Rin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Finalize and start Conversation' }));

    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    const command = execute.mock.calls[0]?.[2];
    expect(command).toMatchObject({
      operation: 'character-version-publish',
      input: {
        characterProjectId: project.characterProjectId,
        label: 'Ready Rin',
      },
    });
    const characterVersionId =
      command?.operation === 'character-version-publish'
        ? command.input.characterVersionId
        : undefined;
    expect(characterVersionId).toMatch(/^character-version:/u);
    await waitFor(() =>
      expect(onFinalizeAndStartConversation).toHaveBeenCalledWith({
        characterProjectId: project.characterProjectId,
        characterVersionId,
        label: 'Lin',
      }),
    );
    expect(await screen.findByText('Agent Entry is unavailable.')).toBeTruthy();
    expect(screen.getByLabelText('Version label')).toHaveProperty('value', '');
  });

  it('shows the read-only version graph, exact comparison and reference-based delete state', () => {
    const snapshot = versionWorkspaceSnapshot();
    const execute = vi.fn(async () => snapshot);
    const { container } = render(
      <CharacterVersionWorkspace
        execute={execute}
        hasUnsavedDraft={false}
        locale="en"
        project={snapshot.project}
        snapshot={snapshot}
        versions={snapshot.versions}
      />,
    );

    expect(
      screen.getByText('Inspect branches, compare immutable content, and review exact references.'),
    ).toBeTruthy();
    expect(screen.getByText(/Draft basis/u)).toBeTruthy();
    expect(screen.getByText('Source not declared')).toBeTruthy();
    expect(screen.getByText('conversation:lin')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete version' })).toHaveProperty('disabled', true);
    expect(screen.getByText('1 exact reference(s) block deletion.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Compare with another version'), {
      target: { value: 'character-version:branch' },
    });
    expect(screen.getAllByText('Changed').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-character-version-workspace="true"]')).not.toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it('requires explicit draft replacement and exact confirmation before continuing or deleting', async () => {
    const snapshot = versionWorkspaceSnapshot();
    const execute = vi.fn(async () => snapshot);
    render(
      <CharacterVersionWorkspace
        execute={execute}
        hasUnsavedDraft
        locale="en"
        project={snapshot.project}
        snapshot={snapshot}
        versions={snapshot.versions}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue from this version' }));
    expect(screen.getByText('The current unsaved draft will be replaced.')).toBeTruthy();
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft and continue' }));
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith({
        operation: 'character-version-continue',
        input: {
          characterProjectId: 'character-project:lin',
          characterVersionId: 'character-version:root',
          replaceWorkingDraft: true,
        },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Branch version/u }));
    expect(screen.getByRole('button', { name: 'Delete version' })).toHaveProperty(
      'disabled',
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete version' }));
    expect(screen.getByText('Delete this unreferenced version?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() =>
      expect(execute).toHaveBeenLastCalledWith({
        operation: 'character-version-delete',
        input: {
          characterProjectId: 'character-project:lin',
          characterVersionId: 'character-version:branch',
        },
      }),
    );
  });

  it('filters the catalog and opens the exact global detail', async () => {
    const snapshot = projectSnapshot();
    const { container } = render(<Harness host={createHost(undefined, snapshot)} />);

    await screen.findByText('Lin');
    fireEvent.change(screen.getByLabelText('Search characters'), { target: { value: 'missing' } });
    expect(await screen.findByText('No matching characters')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search characters'), { target: { value: 'lin' } });
    fireEvent.click(await screen.findByRole('button', { name: /Lin/u }));

    expect(await screen.findByRole('heading', { name: 'Lin' })).toBeTruthy();
    expect(screen.getByText('Global catalog')).toBeTruthy();
    expect(screen.getByText('Version history')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Available versions' })).toBeTruthy();
    const detail = container.querySelector('[data-character-management-detail-surface="true"]');
    expect(detail?.querySelector('form')).toBeNull();
    expect(detail?.querySelector('input')).toBeNull();
    expect(detail?.querySelector('textarea')).toBeNull();
    expect(detail?.querySelector('[data-character-detail-editor="true"]')).toBeNull();
    expect(detail?.querySelector('[data-character-studio-section]')).toBeNull();
  });

  it('launches the exact selected global version without authoring controls', async () => {
    const base = projectSnapshot();
    const publication = base.character.versions[0]!;
    const onStartInteraction = vi.fn();
    render(<Harness detailActions={{ onStartInteraction }} host={createHost(undefined, base)} />);
    fireEvent.click(await screen.findByRole('button', { name: /Lin/u }));

    expect(screen.getByText('Global catalog')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Edit character/u })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start conversation' }));
    expect(onStartInteraction).toHaveBeenCalledWith(
      publication.globalCharacterId,
      publication.characterVersionId,
    );
  });

  it('previews immutable Character facts, representation models, and TTS defaults read-only', async () => {
    const base = projectSnapshot();
    const publication = base.character.versions[0]!;
    const snapshot = {
      ...base,
      character: {
        ...base.character,
        versions: [
          {
            ...publication,
            definition: {
              ...publication.definition,
              summary: 'A careful archive keeper.',
              backgroundStory: {
                ...publication.definition.backgroundStory,
                overview: 'Raised among living records.',
                origins: [
                  {
                    loreEntryId: 'lore-origin-1',
                    statement: 'Born in Archive City.',
                    evidenceIds: [],
                  },
                ],
              },
              originSetting: {
                ...publication.definition.originSetting,
                overview: 'Archive City remembers every promise.',
              },
              canon: ['Never destroys an original record.'],
              knowledgeBoundary: ['Does not know sealed collections.'],
              behaviorPolicy: ['Ask before revealing private notes.'],
              expressionPolicy: ['Speaks precisely and warmly.'],
              representationRefs: [
                {
                  representationId: 'avatar-vrm-1',
                  kind: 'vrm' as const,
                  resourceRef: '${ASSET_ROOT}/characters/neko.vrm',
                },
                {
                  representationId: 'voice-neko-1',
                  kind: 'voice' as const,
                  resourceRef: 'voice://neko-1',
                },
              ],
              representationDefaults: { avatarRepresentationId: 'avatar-vrm-1' },
              voiceDefaults: {
                providerRef: 'tts-provider-local',
                voiceRepresentationId: 'voice-neko-1',
                speed: 1.05,
                autoRead: true,
              },
            },
          },
        ],
      },
    };
    const { container } = render(<Harness host={createHost(undefined, snapshot)} />);
    fireEvent.click(await screen.findByRole('button', { name: /Lin/u }));

    expect(screen.getAllByText('A careful archive keeper.').length).toBeGreaterThan(1);
    expect(screen.getByText('Raised among living records.')).toBeTruthy();
    expect(screen.getByText('Never destroys an original record.')).toBeTruthy();
    expect(screen.getAllByText('avatar-vrm-1')).toHaveLength(2);
    expect(screen.getByText('tts-provider-local')).toBeTruthy();
    expect(
      screen.getByText(/chat LLM provider and model belong to the exact conversation/u),
    ).toBeTruthy();
    const detail = container.querySelector('[data-character-management-detail-surface="true"]');
    expect(detail?.querySelector('input')).toBeNull();
    expect(detail?.querySelector('textarea')).toBeNull();
    expect(screen.queryByRole('button', { name: /save|publish|edit/u })).toBeNull();
  });

  it('keeps add and package import as distinct catalog actions', async () => {
    const execute = vi.fn();
    const onCreate = vi.fn();
    const onImport = vi.fn();
    render(<Harness host={createHost(execute)} onCreate={onCreate} onImport={onImport} />);
    await screen.findByRole('heading', { name: 'Characters' });
    expect(screen.queryByRole('button', { name: 'Generate with AI' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Add character' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Import character package' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Create manually' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add character' })[0]!);
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onImport).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Import character package' })[0]!);
    expect(onImport).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });

  it('starts from the exact Character Kit quick start without creating a local record', async () => {
    const execute = vi.fn();
    const onStartFromTemplate = vi.fn();
    const { container } = render(
      <Harness host={createHost(execute)} onStartFromTemplate={onStartFromTemplate} />,
    );
    await screen.findByRole('heading', { name: 'Characters' });

    const template = container.querySelector<HTMLButtonElement>(
      '[data-character-template="character-kit"]',
    );
    if (!template) throw new Error('Character catalog fixture requires the Character Kit.');
    fireEvent.click(template);

    expect(onStartFromTemplate).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });

  it('defaults to current and allows an exact historical version for conversation', async () => {
    const base = projectSnapshot();
    const globalCharacterId = base.character.globalCharacters[0]!.globalCharacterId;
    const versions = ['root', 'branch'].map((suffix) => ({
      characterVersionId: `character-version:lin-${suffix}`,
      globalCharacterId,
      label: suffix === 'root' ? 'Root' : 'Branch',
      definition: base.localProject.draft,
      acceptedEvidenceIds: [],
      publishedAt: `2026-08-0${suffix === 'root' ? '9' : '8'}T01:00:00.000Z`,
    }));
    const snapshot: CharacterFoundationFixture = {
      ...base,
      character: {
        ...base.character,
        globalCharacters: [
          {
            ...base.character.globalCharacters[0]!,
            currentCharacterVersionId: versions[0]!.characterVersionId,
            characterVersionIds: versions.map((version) => version.characterVersionId),
          },
        ],
        versions,
      },
    };
    const onStartInteraction = vi.fn();
    render(
      <Harness detailActions={{ onStartInteraction }} host={createHost(undefined, snapshot)} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Lin/u }));

    const startButton = screen.getByRole('button', { name: 'Start conversation' });
    expect(startButton).toHaveProperty('disabled', false);
    fireEvent.change(screen.getByLabelText('Conversation version'), {
      target: { value: versions[1]!.characterVersionId },
    });
    expect(startButton).toHaveProperty('disabled', false);
    fireEvent.click(startButton);
    expect(onStartInteraction).toHaveBeenCalledWith(
      globalCharacterId,
      versions[1]!.characterVersionId,
    );
  });

  it('resets the preview to another Character current version without reusing stale selection', async () => {
    const base = projectSnapshot();
    const first = base.character.versions[0]!;
    const secondVersion = {
      ...first,
      characterVersionId: 'character-version:mio-current',
      globalCharacterId: 'global-character:mio',
      label: 'Mio current',
      definition: { ...first.definition, summary: 'Mio current summary.' },
    };
    const snapshot: CharacterFoundationFixture = {
      ...base,
      character: {
        ...base.character,
        globalCharacters: [
          ...base.character.globalCharacters,
          {
            globalCharacterId: secondVersion.globalCharacterId,
            displayName: 'Mio',
            currentCharacterVersionId: secondVersion.characterVersionId,
            characterVersionIds: [secondVersion.characterVersionId],
            createdAt: '2026-08-10T00:00:00.000Z',
            updatedAt: '2026-08-10T00:00:00.000Z',
          },
        ],
        versions: [...base.character.versions, secondVersion],
      },
    };
    render(<Harness host={createHost(undefined, snapshot)} />);
    fireEvent.click(await screen.findByRole('button', { name: /Lin/u }));
    fireEvent.click(screen.getByRole('button', { name: /Mio/u }));

    expect(screen.getAllByText('Mio current summary.').length).toBeGreaterThan(1);
    expect(screen.getByLabelText('Conversation version')).toHaveProperty(
      'value',
      secondVersion.characterVersionId,
    );
  });

  it('saves editable Voice defaults through the Character draft authority', async () => {
    const snapshot = projectSnapshot();
    const execute = vi.fn(async () => snapshot);
    render(<EditorHarness execute={execute} snapshot={snapshot} />);

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
    const project = base.localProject;
    const snapshot: CharacterFoundationFixture = {
      ...base,
      localVersions: [
        {
          characterVersionId: 'character-version:lin',
          characterProjectId: project.characterProjectId,
          label: 'Published Lin',
          definition: project.draft,
          acceptedEvidenceIds: [],
          publishedAt: '2026-08-09T00:00:00.000Z',
        },
      ],
    };
    const execute = vi.fn(async () => snapshot);
    render(<EditorHarness execute={execute} snapshot={snapshot} />);
    fireEvent.click(screen.getByText('Create a storyline version'));

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
    const project = base.localProject;
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
    const snapshot: CharacterFoundationFixture = {
      ...base,
      localVersions: [
        {
          characterVersionId: 'character-version:lin',
          characterProjectId: project.characterProjectId,
          label: 'Published Lin',
          definition: project.draft,
          acceptedEvidenceIds: [],
          publishedAt: '2026-08-09T00:00:00.000Z',
        },
      ],
      character: {
        ...base.character,
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
    render(<EditorHarness execute={execute} snapshot={snapshot} />);
    fireEvent.click(screen.getByText('Create a storyline version'));
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
    expect(execute).not.toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'character-storyline-delete' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm storyline deletion' }));
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith({
        operation: 'character-storyline-delete',
        input: { characterStorylineId: 'character-storyline:trust' },
      }),
    );
  });

  it('captures an authoring-test snapshot without creating a usable version', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000003',
    );
    const snapshot = projectAuthoringSnapshot(projectSnapshot());
    const execute = vi.fn(async () => snapshot);
    render(
      <CharacterAuthoringEditor
        execute={execute}
        locale="en"
        selectedProjectId={snapshot.project.characterProjectId}
        snapshot={snapshot}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Capture test snapshot' }));

    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledWith({
      operation: 'character-authoring-test-capture',
      input: {
        characterProjectId: snapshot.project.characterProjectId,
        authoringTestSnapshotId: 'character-authoring-test:00000000-0000-4000-8000-000000000003',
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
                constraints: {
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
    expect(container.querySelector('[data-participant-portrait-resource-ref]')).toBeNull();
    expect(
      container.querySelector('[data-character-participant-identity="participant-agent"]'),
    ).not.toBeNull();
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
  detailActions,
  host,
  onCreate = () => undefined,
  onImport,
  onStartFromTemplate = () => undefined,
}: {
  readonly detailActions?: CharacterManagementDetailActions;
  readonly host: OpenNekoDesktopCharacterBridge['characterFoundation'];
  readonly onCreate?: () => void;
  readonly onImport?: () => void;
  readonly onStartFromTemplate?: () => void;
}): JSX.Element {
  const runtime = useCharacterManagementRuntime({ active: true, host });
  const [selection, setSelection] = useState<CharacterDetailSelection>();
  return (
    <>
      <CharacterCatalogSurface
        locale="en"
        onCreate={onCreate}
        onImport={onImport ?? (() => undefined)}
        onStartFromTemplate={onStartFromTemplate}
        onSelect={(globalCharacterId) => setSelection({ kind: 'global', globalCharacterId })}
        runtime={runtime}
        selectedGlobalCharacterId={selection?.globalCharacterId}
      />
      <CharacterDetailSurface
        actions={{ ...detailActions }}
        locale="en"
        runtime={runtime}
        selection={selection}
      />
    </>
  );
}

function EditorHarness({
  execute,
  snapshot,
}: {
  readonly execute: (command: CharacterFoundationCommand) => Promise<CharacterFoundationFixture>;
  readonly snapshot: CharacterFoundationFixture;
}): JSX.Element {
  const project = snapshot.localProject;
  return (
    <CharacterAuthoringEditor
      execute={async (command: CharacterAuthoringCommand) => {
        if (
          command.operation === 'character-authoring-test-capture' ||
          command.operation === 'character-version-continue' ||
          command.operation === 'character-version-delete'
        ) {
          throw new Error(
            'The Foundation editor fixture does not execute authoring-only commands.',
          );
        }
        return projectAuthoringSnapshot(
          await execute(command as unknown as CharacterFoundationCommand),
        );
      }}
      locale="en"
      selectedProjectId={project.characterProjectId}
      snapshot={projectAuthoringSnapshot(snapshot)}
    />
  );
}

function projectAuthoringSnapshot(
  snapshot: CharacterFoundationFixture,
): CharacterAuthoringSnapshot {
  const project = snapshot.localProject;
  return {
    project,
    versions: snapshot.localVersions.filter(
      (version) => version.characterProjectId === project.characterProjectId,
    ),
    authoringTestSnapshots: [],
    storylines: snapshot.character.storylines.filter(
      (storyline) => storyline.characterProjectId === project.characterProjectId,
    ),
    storylineDrafts: snapshot.character.storylineDrafts,
    storylineVersions: snapshot.character.storylineVersions,
    lineage: null,
    referenceInventories: snapshot.localVersions
      .filter((version) => version.characterProjectId === project.characterProjectId)
      .map((version) => ({
        characterVersionId: version.characterVersionId,
        coverage: 'complete',
        references: [],
        diagnostics: [],
      })),
    diagnostics: snapshot.diagnostics.filter(
      (diagnostic) => diagnostic.owner === 'character',
    ) as CharacterAuthoringSnapshot['diagnostics'],
  };
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
        participantProjection={[
          {
            participantId: 'participant-user',
            displayName: 'User',
            controllerKind: 'human',
            schedulingState: 'active',
          },
          {
            participantId: 'participant-agent',
            displayName: 'Lin',
            controllerKind: 'agent',
            schedulingState: 'active',
            character: {
              characterRunId: 'character-run-lin',
              versionLabel: 'Lin release',
              mode: 'companion',
              agentSessionBound: true,
              portraitRepresentationId: 'portrait-lin',
            },
          },
        ]}
        renderParticipantIdentity={(participant) => (
          <CharacterParticipantIdentityAvatar
            locale="en"
            participant={participant}
            portraitState="unavailable"
            size="compact"
          />
        )}
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

type CharacterFoundationFixture = CharacterFoundationSnapshot & {
  readonly localProject: CharacterProject;
  readonly localVersions: readonly CharacterVersion[];
};

function projectSnapshot(): CharacterFoundationFixture {
  const localProject: CharacterProject = {
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
  };
  const localVersion: CharacterVersion = {
    characterVersionId: 'character-version:lin-root',
    characterProjectId: localProject.characterProjectId,
    label: 'Root',
    definition: localProject.draft,
    acceptedEvidenceIds: [],
    publishedAt: '2026-08-09T01:00:00.000Z',
  };
  return {
    ...emptySnapshot(),
    localProject,
    localVersions: [localVersion],
    character: {
      ...emptySnapshot().character,
      globalCharacters: [
        {
          globalCharacterId: 'global-character:lin',
          displayName: 'Lin',
          currentCharacterVersionId: localVersion.characterVersionId,
          characterVersionIds: [localVersion.characterVersionId],
          createdAt: '2026-08-09T00:00:00.000Z',
          updatedAt: '2026-08-09T00:00:00.000Z',
        },
      ],
      versions: [
        {
          characterVersionId: localVersion.characterVersionId,
          globalCharacterId: 'global-character:lin',
          label: localVersion.label,
          definition: localVersion.definition,
          acceptedEvidenceIds: localVersion.acceptedEvidenceIds,
          publishedAt: localVersion.publishedAt,
        },
      ],
    },
  };
}

function versionWorkspaceSnapshot(): CharacterAuthoringSnapshot {
  const foundation = projectSnapshot();
  const baseProject = foundation.localProject;
  const project = { ...baseProject, draftBasisCharacterVersionId: 'character-version:root' };
  const versions = [
    {
      characterVersionId: 'character-version:root',
      characterProjectId: project.characterProjectId,
      label: 'Root version',
      definition: project.draft,
      acceptedEvidenceIds: [],
      publishedAt: '2026-08-09T00:00:00.000Z',
    },
    {
      characterVersionId: 'character-version:branch',
      characterProjectId: project.characterProjectId,
      label: 'Branch version',
      definition: { ...project.draft, canon: ['A newly accepted fact.'] },
      acceptedEvidenceIds: [],
      publishedAt: '2026-08-10T00:00:00.000Z',
    },
    {
      characterVersionId: 'character-version:unlinked',
      characterProjectId: project.characterProjectId,
      label: 'Imported version',
      definition: project.draft,
      acceptedEvidenceIds: [],
      publishedAt: '2026-08-11T00:00:00.000Z',
    },
  ];
  return {
    project,
    versions,
    authoringTestSnapshots: [],
    storylines: [],
    storylineDrafts: [],
    storylineVersions: [],
    lineage: {
      characterProjectId: project.characterProjectId,
      relations: [
        { characterVersionId: 'character-version:root', parentCharacterVersionIds: [] },
        {
          characterVersionId: 'character-version:branch',
          parentCharacterVersionIds: ['character-version:root'],
        },
      ],
    },
    referenceInventories: versions.map((version) => ({
      characterVersionId: version.characterVersionId,
      coverage: 'complete' as const,
      references:
        version.characterVersionId === 'character-version:root'
          ? [
              {
                ownerKind: 'agent' as const,
                referenceKind: 'conversation' as const,
                referenceId: 'conversation:lin',
                characterVersionId: version.characterVersionId,
              },
            ]
          : [],
      diagnostics: [],
    })),
    diagnostics: [],
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
