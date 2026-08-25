// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createProjectCreativeCatalogItems,
  filterAndSortProjectCreativeCatalog,
  projectCreativeCatalogKinds,
  ProjectWorkspaceRoot,
} from './project-workspace';

afterEach(cleanup);

describe('ProjectWorkspaceRoot', () => {
  it('searches, filters, and orders the mixed catalog without hiding undated records', () => {
    const items = createProjectCreativeCatalogItems(
      creativeWorkspaceProjection(),
      projectContentResult().projection,
      'en',
    );
    expect(
      filterAndSortProjectCreativeCatalog(items, {
        query: '',
        kind: 'all',
        scope: 'all',
        sort: 'recent',
      }).map((item) => item.label),
    ).toEqual(['Rain Market', 'Dockmaster', 'Rin', 'Story', 'Global Archive City', 'Global Rin']);
    expect(
      filterAndSortProjectCreativeCatalog(items, {
        query: 'dock',
        kind: 'all',
        scope: 'all',
        sort: 'name',
      }).map((item) => item.label),
    ).toEqual(['Dockmaster']);
    expect(
      filterAndSortProjectCreativeCatalog(items, {
        query: '',
        kind: 'character',
        scope: 'global-reference',
        sort: 'type',
      }).map((item) => item.label),
    ).toEqual(['Global Rin']);
    expect(
      filterAndSortProjectCreativeCatalog(
        [...items, { identity: 'invalid', kind: 'world', scope: 'workspace', label: 'Broken' }],
        { query: '', kind: 'all', scope: 'all', sort: 'recent' },
      ).at(-1)?.label,
    ).toBe('Broken');
    expect(projectCreativeCatalogKinds(items.filter((item) => item.kind !== 'candidate'))).toEqual([
      'content',
      'character',
      'world',
      'entity',
    ]);
  });

  it('shows local objects and read-only global references without publication controls', async () => {
    const onOpenTarget = vi.fn(async () => undefined);
    const getCreativeWorkspace = vi.fn(async () => ({
      requestId: 'request-workspace',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      projectId: 'project-1',
      projection: creativeWorkspaceProjection(),
    }));
    const mutateCreativeWorkspaceReference = vi.fn(async () => ({
      requestId: 'request-mutation',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      projectId: 'project-1',
      projection: creativeWorkspaceProjection(),
    }));
    const mutateCreativeWorkspaceObject = vi.fn(async (..._args: unknown[]) => ({
      requestId: 'request-object-mutation',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      projectId: 'project-1',
      projection: creativeWorkspaceProjection(),
    }));

    render(
      <ProjectWorkspaceRoot
        experimentalCreativeCapabilitiesReady
        binding={{
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          projectId: 'project-1',
        }}
        host={{
          getCreativeWorkspace,
          getContent: vi.fn(async () => projectContentResult()),
          mutateCreativeWorkspaceReference,
          mutateCreativeWorkspaceObject,
        }}
        locale="en"
        onOpenTarget={onOpenTarget}
        windowId="window-1"
      />,
    );

    expect(await screen.findByText('Story')).toBeTruthy();
    expect(screen.getByText('Rin')).toBeTruthy();
    expect(screen.getByText('Global Rin')).toBeTruthy();
    expect(screen.getByText('Global Archive City')).toBeTruthy();
    expect(screen.queryByText('Publish')).toBeNull();
    expect(screen.queryByText('Project dependencies')).toBeNull();

    expect(screen.getByText('Rain Market')).toBeTruthy();
    expect(screen.getByText('Dockmaster')).toBeTruthy();

    const globalCharacterCard = document.querySelector(
      '[data-owner-identity="character-version:global-character-rin:character-version-rin"]',
    );
    expect(globalCharacterCard).toBeTruthy();
    fireEvent.click(
      within(globalCharacterCard as HTMLElement).getByRole('button', { name: 'View details' }),
    );
    const globalDetails = screen.getByRole('region', { name: 'Global Rin details' });
    expect(globalDetails.textContent).toContain('First edition');
    expect(globalDetails.textContent).toContain(
      'character-version:global-character-rin:character-version-rin',
    );
    expect(globalDetails.textContent).toContain('Copy it to the Workspace before editing');
    fireEvent.click(
      within(globalCharacterCard as HTMLElement).getByRole('button', { name: 'Hide details' }),
    );
    expect(screen.queryByRole('region', { name: 'Global Rin details' })).toBeNull();

    const entityCard = document.querySelector(
      '[data-owner-identity="project-entity:entity-rain-market"]',
    );
    expect(entityCard).toBeTruthy();
    fireEvent.click(
      within(entityCard as HTMLElement).getByRole('button', { name: 'View details' }),
    );
    const entityDetails = screen.getByRole('region', { name: 'Rain Market details' });
    expect(entityDetails.textContent).toContain('Location');
    expect(entityDetails.textContent).toContain('project-entity:entity-rain-market');
    expect(entityDetails.textContent).toContain('editing remains Entity-owned');

    fireEvent.click(screen.getByTitle('Rin'));
    expect(onOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ identity: 'character-project:character-rin' }),
    );

    const showAddReference = screen.getByTitle('Add global reference') as HTMLButtonElement;
    await waitFor(() => expect(showAddReference.disabled).toBe(false));
    fireEvent.click(showAddReference);
    const addReference = screen.getByTitle('Add exact version reference') as HTMLButtonElement;
    await waitFor(() => expect(addReference.disabled).toBe(false));
    fireEvent.click(addReference);
    await waitFor(() =>
      expect(mutateCreativeWorkspaceReference).toHaveBeenCalledWith(
        'window-1',
        expect.objectContaining({ projectId: 'project-1' }),
        {
          kind: 'add',
          reference: {
            kind: 'character-version',
            globalCharacterId: 'global-character-mio',
            characterVersionId: 'character-version-mio',
          },
        },
      ),
    );

    fireEvent.click(within(globalCharacterCard as HTMLElement).getByTitle('Copy to Workspace'));
    await waitFor(() =>
      expect(mutateCreativeWorkspaceObject).toHaveBeenCalledWith(
        'window-1',
        expect.objectContaining({ projectId: 'project-1' }),
        expect.objectContaining({
          kind: 'copy-character-reference',
          reference: {
            kind: 'character-version',
            globalCharacterId: 'global-character-rin',
            characterVersionId: 'character-version-rin',
          },
          characterProjectId: expect.stringMatching(/^character-project:/u),
          entity: expect.objectContaining({
            kind: 'create',
            entityId: expect.stringMatching(/^entity:/u),
            name: 'Global Rin',
          }),
        }),
      ),
    );

    fireEvent.click(screen.getByTitle('Synchronize to global'));
    await waitFor(() =>
      expect(mutateCreativeWorkspaceObject).toHaveBeenCalledWith(
        'window-1',
        expect.objectContaining({ projectId: 'project-1' }),
        expect.objectContaining({
          kind: 'synchronize-character',
          characterProjectId: 'character-rin',
          globalCharacterId: expect.stringMatching(/^global-character:/u),
          characterVersionId: expect.stringMatching(/^character-version:/u),
          label: 'Rin',
        }),
      ),
    );
  });

  it('contains stale Project failures inside the Workspace', async () => {
    const getCreativeWorkspace = vi.fn(async () => ({
      requestId: 'request-other',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      projectId: 'project-other',
      projection: {
        ...creativeWorkspaceProjection(),
        composition: { ...creativeWorkspaceProjection().composition, projectId: 'project-other' },
      },
    }));
    render(
      <ProjectWorkspaceRoot
        experimentalCreativeCapabilitiesReady
        binding={{
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          projectId: 'project-1',
        }}
        host={{
          getCreativeWorkspace,
          getContent: vi.fn(async () => projectContentResult()),
          mutateCreativeWorkspaceReference: vi.fn(),
          mutateCreativeWorkspaceObject: vi.fn(),
        }}
        locale="en"
        onOpenTarget={vi.fn()}
        windowId="window-1"
      />,
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'The Workspace returned data for another Project.',
    );
    expect(screen.queryByText('Rin')).toBeNull();
  });

  it('keeps Character and World records read-only while hiding Release capability controls', async () => {
    const onOpenTarget = vi.fn();
    const mutateCreativeWorkspaceReference = vi.fn();
    const mutateCreativeWorkspaceObject = vi.fn();
    render(
      <ProjectWorkspaceRoot
        experimentalCreativeCapabilitiesReady={false}
        binding={{
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          projectId: 'project-1',
        }}
        host={{
          getCreativeWorkspace: vi.fn(async () => ({
            requestId: 'request-workspace',
            workspaceId: 'workspace-1',
            workspaceGrantId: 'grant-1',
            projectId: 'project-1',
            projection: creativeWorkspaceProjection(),
          })),
          getContent: vi.fn(async () => projectContentResult()),
          mutateCreativeWorkspaceReference,
          mutateCreativeWorkspaceObject,
        }}
        locale="en"
        onOpenTarget={onOpenTarget}
        windowId="window-1"
      />,
    );

    expect(await screen.findByText('Rin')).toBeTruthy();
    expect(screen.getByText('Global Archive City')).toBeTruthy();
    expect(screen.queryByTitle('Add global reference')).toBeNull();
    expect(screen.queryByTitle('Copy to Workspace')).toBeNull();
    expect(screen.queryByTitle('Synchronize to global')).toBeNull();
    const characterCard = document.querySelector(
      '[data-owner-identity="character-project:character-rin"]',
    );
    expect(characterCard).toBeTruthy();
    fireEvent.click(within(characterCard as HTMLElement).getByRole('button', { name: /Rin/u }));
    expect(screen.getByRole('region', { name: 'Rin details' }).textContent).toContain(
      'hidden in Release',
    );
    expect(onOpenTarget).not.toHaveBeenCalled();
    expect(mutateCreativeWorkspaceReference).not.toHaveBeenCalled();
    expect(mutateCreativeWorkspaceObject).not.toHaveBeenCalled();
  });

  it('requires an explicit choice when a Workspace object has a stale global base', async () => {
    const projection = creativeWorkspaceProjection();
    const staleProjection = {
      ...projection,
      composition: {
        ...projection.composition,
        characters: projection.composition.characters.map((item) => ({
          ...item,
          synchronization: {
            kind: 'character' as const,
            globalObjectId: 'global-character-rin',
            lastSyncedVersionId: 'character-version-rin',
            currentVersionId: 'character-version-rin-next',
          },
        })),
      },
    };
    const mutateCreativeWorkspaceObject = vi.fn(async (..._args: unknown[]) => ({
      requestId: 'request-object-mutation',
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      projectId: 'project-1',
      projection: staleProjection,
    }));
    render(
      <ProjectWorkspaceRoot
        experimentalCreativeCapabilitiesReady
        binding={{
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          projectId: 'project-1',
        }}
        host={{
          getCreativeWorkspace: vi.fn(async () => ({
            requestId: 'request-workspace',
            workspaceId: 'workspace-1',
            workspaceGrantId: 'grant-1',
            projectId: 'project-1',
            projection: staleProjection,
          })),
          getContent: vi.fn(async () => projectContentResult()),
          mutateCreativeWorkspaceReference: vi.fn(),
          mutateCreativeWorkspaceObject,
        }}
        locale="en"
        onOpenTarget={vi.fn()}
        windowId="window-1"
      />,
    );

    fireEvent.click(await screen.findByTitle('Synchronize based on current global version'));
    await waitFor(() =>
      expect(mutateCreativeWorkspaceObject).toHaveBeenCalledWith(
        'window-1',
        expect.objectContaining({ projectId: 'project-1' }),
        expect.objectContaining({
          kind: 'synchronize-character',
          globalCharacterId: 'global-character-rin',
          lastSyncedCharacterVersionId: 'character-version-rin',
          conflictChoice: 'base-on-current',
        }),
      ),
    );

    fireEvent.click(screen.getByTitle('Save as new global object'));
    await waitFor(() =>
      expect(mutateCreativeWorkspaceObject).toHaveBeenLastCalledWith(
        'window-1',
        expect.objectContaining({ projectId: 'project-1' }),
        expect.not.objectContaining({ lastSyncedCharacterVersionId: expect.anything() }),
      ),
    );
    const saveAsNew = mutateCreativeWorkspaceObject.mock.calls.at(-1)?.[2];
    expect(saveAsNew).toMatchObject({
      kind: 'synchronize-character',
      globalCharacterId: expect.stringMatching(/^global-character:/u),
    });
    expect(saveAsNew).not.toHaveProperty('conflictChoice');
  });
});

function creativeWorkspaceProjection() {
  return {
    composition: {
      projectId: 'project-1',
      content: [
        {
          target: { kind: 'content-document' as const, documentId: 'notes/story.md' },
          identity: 'content-document:notes/story.md',
          label: 'Story',
          updatedAt: '2026-08-20T00:00:00.000Z',
        },
      ],
      characters: [
        {
          target: {
            kind: 'character-project' as const,
            characterProjectId: 'character-rin',
          },
          identity: 'character-project:character-rin',
          label: 'Rin',
          summary: 'A precise harbor investigator.',
          updatedAt: '2026-08-21T00:00:00.000Z',
        },
      ],
      worlds: [],
      globalCharacters: [
        {
          reference: {
            kind: 'character-version' as const,
            globalCharacterId: 'global-character-rin',
            characterVersionId: 'character-version-rin',
          },
          identity: 'character-version:global-character-rin:character-version-rin',
          label: 'Global Rin',
          versionLabel: 'First edition',
          updatedAt: '2026-08-18T00:00:00.000Z',
        },
      ],
      globalWorlds: [
        {
          reference: {
            kind: 'world-version' as const,
            globalWorldId: 'global-world-archive',
            worldVersionId: 'world-version-archive',
          },
          identity: 'world-version:global-world-archive:world-version-archive',
          label: 'Global Archive City',
          versionLabel: 'Second edition',
          updatedAt: '2026-08-19T00:00:00.000Z',
        },
      ],
      availableGlobalCharacters: [
        {
          reference: {
            kind: 'character-version' as const,
            globalCharacterId: 'global-character-rin',
            characterVersionId: 'character-version-rin',
          },
          identity: 'character-version:global-character-rin:character-version-rin',
          label: 'Global Rin',
          versionLabel: 'First edition',
          updatedAt: '2026-08-18T00:00:00.000Z',
        },
        {
          reference: {
            kind: 'character-version' as const,
            globalCharacterId: 'global-character-mio',
            characterVersionId: 'character-version-mio',
          },
          identity: 'character-version:global-character-mio:character-version-mio',
          label: 'Global Mio',
          versionLabel: 'Third edition',
          updatedAt: '2026-08-22T00:00:00.000Z',
        },
      ],
      availableGlobalWorlds: [
        {
          reference: {
            kind: 'world-version' as const,
            globalWorldId: 'global-world-archive',
            worldVersionId: 'world-version-archive',
          },
          identity: 'world-version:global-world-archive:world-version-archive',
          label: 'Global Archive City',
          versionLabel: 'Second edition',
          updatedAt: '2026-08-19T00:00:00.000Z',
        },
      ],
      diagnostics: [],
    },
  };
}

function projectContentResult() {
  return {
    requestId: 'request-content',
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    projection: {
      projectId: 'project-1',
      characters: [
        {
          owner: 'character' as const,
          characterProjectId: 'character-rin',
          label: 'Rin',
          availability: 'available' as const,
        },
      ],
      worlds: [],
      elements: [
        {
          owner: 'project-entity' as const,
          entityId: 'entity-rain-market',
          entityKind: 'location' as const,
          label: 'Rain Market',
          updatedAt: '2026-08-23T00:00:00.000Z',
          availability: 'available' as const,
        },
      ],
      candidates: [
        {
          owner: 'entity-candidate' as const,
          candidateId: 'candidate-dockmaster',
          entityKind: 'character' as const,
          label: 'Dockmaster',
          freshness: 'fresh' as const,
          confidence: 0.82,
          evidenceCount: 2,
          updatedAt: '2026-08-22T12:00:00.000Z',
        },
      ],
      diagnostics: [],
    },
  };
}
