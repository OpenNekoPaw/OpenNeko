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
