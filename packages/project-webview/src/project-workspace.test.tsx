// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectWorkspaceRoot } from './project-workspace';

afterEach(cleanup);

describe('ProjectWorkspaceRoot', () => {
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
        binding={{
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          projectId: 'project-1',
        }}
        host={{
          getCreativeWorkspace,
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

    fireEvent.click(screen.getByRole('button', { name: 'Rin' }));
    expect(onOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ identity: 'character-project:character-rin' }),
    );

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

    fireEvent.click(screen.getAllByTitle('Copy to Workspace')[0]!);
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
        binding={{
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          projectId: 'project-1',
        }}
        host={{
          getCreativeWorkspace,
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
        },
        {
          reference: {
            kind: 'character-version' as const,
            globalCharacterId: 'global-character-mio',
            characterVersionId: 'character-version-mio',
          },
          identity: 'character-version:global-character-mio:character-version-mio',
          label: 'Global Mio',
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
        },
      ],
      diagnostics: [],
    },
  };
}
