// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProjectAuthoringTargetSwitchRoot,
  ProjectCatalogRoot,
  ProjectContentRoot,
  filterAndSortProjectCatalog,
  type ProjectWritableNavigationItem,
} from './root';

vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ locale: 'en', t: (key: string) => key }),
}));

afterEach(cleanup);

describe('ProjectContentRoot', () => {
  it('renders the four owner-qualified groups and keeps an associated Character out of elements', async () => {
    const getContent = vi.fn(async () => ({
      requestId: 'request-content',
      workspaceId: 'workspace-1',
      contentProjectId: 'project-1',
      projection: {
        contentProjectId: 'project-1',
        characters: [
          {
            owner: 'character' as const,
            characterProjectId: 'character-rin',
            entityId: 'entity-rin',
            label: 'Rin',
            availability: 'available' as const,
          },
        ],
        worlds: [
          {
            owner: 'world' as const,
            worldProjectId: 'world-home',
            label: 'Home',
            availability: 'available' as const,
          },
        ],
        elements: [
          {
            owner: 'project-entity' as const,
            entityId: 'entity-station',
            entityKind: 'scene' as const,
            label: 'Station',
            availability: 'available' as const,
          },
        ],
        candidates: [
          {
            owner: 'entity-candidate' as const,
            candidateId: 'candidate-shopkeeper',
            entityKind: 'character' as const,
            label: 'Shopkeeper',
            freshness: 'fresh' as const,
          },
        ],
        diagnostics: [],
      },
    }));
    render(
      <ProjectContentRoot
        binding={{
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          contentProjectId: 'project-1',
        }}
        host={{ getCatalog: vi.fn(), getNavigation: vi.fn(), getContent }}
        windowId="window-1"
      />,
    );
    await waitFor(() => expect(screen.getByText('Rin')).toBeTruthy());
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Station')).toBeTruthy();
    expect(screen.getByText('Shopkeeper')).toBeTruthy();
    expect(document.querySelector('[data-owner-identity="character:character-rin"]')).toBeTruthy();
    expect(document.querySelector('[data-owner-identity="project-entity:entity-rin"]')).toBeNull();
    expect(document.querySelectorAll('[data-project-content-group]')).toHaveLength(4);
  });

  it('shows empty groups and isolates group diagnostics', () => {
    render(
      <ProjectContentRoot
        binding={{
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          contentProjectId: 'project-1',
        }}
        host={{ getCatalog: vi.fn(), getNavigation: vi.fn(), getContent: vi.fn() }}
        initialProjection={{
          contentProjectId: 'project-1',
          characters: [],
          worlds: [],
          elements: [],
          candidates: [],
          diagnostics: [
            {
              owner: 'world',
              group: 'worlds',
              recordId: 'world-bad',
              message: 'World record is invalid.',
            },
          ],
        }}
        windowId="window-1"
      />,
    );
    expect(screen.getAllByText(/^projectContent\.empty\./u)).toHaveLength(4);
    expect(screen.getByText('World record is invalid.')).toBeTruthy();
  });

  it('never renders an initial projection from another Content Project', async () => {
    const getContent = vi.fn(async () => ({
      requestId: 'request-target-content',
      workspaceId: 'workspace-1',
      contentProjectId: 'project-target',
      projection: {
        contentProjectId: 'project-target',
        characters: [],
        worlds: [],
        elements: [],
        candidates: [],
        diagnostics: [],
      },
    }));
    render(
      <ProjectContentRoot
        binding={{
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
          contentProjectId: 'project-target',
        }}
        host={{ getCatalog: vi.fn(), getNavigation: vi.fn(), getContent }}
        initialProjection={{
          contentProjectId: 'project-other',
          characters: [
            {
              owner: 'character',
              characterProjectId: 'character-other',
              entityId: 'entity-other',
              label: 'Other Project Character',
              availability: 'available',
            },
          ],
          worlds: [],
          elements: [],
          candidates: [],
          diagnostics: [],
        }}
        windowId="window-1"
      />,
    );
    expect(screen.queryByText('Other Project Character')).toBeNull();
    await waitFor(() => expect(getContent).toHaveBeenCalledTimes(1));
    expect(getContent).toHaveBeenCalledWith('window-1', {
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
      contentProjectId: 'project-target',
    });
    expect(screen.queryByText('Other Project Character')).toBeNull();
  });
});

describe('ProjectCatalogRoot', () => {
  it('renders invalid records visibly and disables only their open action', () => {
    render(
      <ProjectCatalogRoot
        associatedConversationCounts={{}}
        interactive
        onDeleteAssociatedConversations={vi.fn()}
        onOpen={vi.fn()}
        onOpenDirectory={vi.fn()}
        onRemove={vi.fn()}
        projects={[
          {
            projectId: 'project-1',
            workspaceId: 'workspace-1',
            profile: 'content',
            displayName: 'Broken Project',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            unavailable: { fieldNames: ['workspace'], message: 'Workspace unavailable' },
          },
        ]}
      />,
    );
    expect(screen.getByText('Workspace unavailable')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /Broken Project/u }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('sorts exact Project records without changing the input', () => {
    const projects = [
      {
        projectId: 'project-b',
        workspaceId: 'workspace-b',
        profile: 'content',
        displayName: 'Beta',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
      {
        projectId: 'project-a',
        workspaceId: 'workspace-a',
        profile: 'content',
        displayName: 'Alpha',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ] as const;
    expect(
      filterAndSortProjectCatalog(projects, '', 'name-ascending').map((x) => x.projectId),
    ).toEqual(['project-a', 'project-b']);
    expect(projects[0].projectId).toBe('project-b');
  });

  it('commits, unmounts, validates, and then mounts when switching targets', async () => {
    const events: string[] = [];
    const content = writableNavigationItems()[0]!;
    const character = writableNavigationItems()[1]!;
    const validate = vi.fn(async (item: ProjectWritableNavigationItem) => {
      events.push(`validate:${item.identity}`);
    });
    const commit = vi.fn(async (item: ProjectWritableNavigationItem) => {
      events.push(`commit:${item.identity}`);
      return {
        owner: 'content' as const,
        targetIdentity: item.identity,
        snapshotId: `snapshot:${item.identity}`,
      };
    });
    const { rerender } = render(
      <ProjectAuthoringTargetSwitchRoot
        commitOutgoingSnapshot={commit}
        requested={content}
        validateIncomingAuthority={validate}
        renderTarget={(item) => <LifecycleSurface events={events} identity={item.identity} />}
      />,
    );
    await waitFor(() => expect(screen.getByText(content.identity)).toBeTruthy());
    events.length = 0;

    rerender(
      <ProjectAuthoringTargetSwitchRoot
        commitOutgoingSnapshot={commit}
        requested={character}
        validateIncomingAuthority={validate}
        renderTarget={(item) => <LifecycleSurface events={events} identity={item.identity} />}
      />,
    );
    await waitFor(() => expect(screen.getByText(character.identity)).toBeTruthy());
    expect(events).toEqual([
      `commit:${content.identity}`,
      `unmount:${content.identity}`,
      `validate:${character.identity}`,
      `mount:${character.identity}`,
    ]);
    expect(screen.queryByText(content.identity)).toBeNull();
  });

  it('does not retain the outgoing Root when incoming authority validation fails', async () => {
    const content = writableNavigationItems()[0]!;
    const character = writableNavigationItems()[1]!;
    const validate = vi.fn(async (item: ProjectWritableNavigationItem) => {
      if (item.identity === character.identity) throw new Error('Character authority unavailable');
    });
    const { rerender } = render(
      <ProjectAuthoringTargetSwitchRoot
        commitOutgoingSnapshot={async () => undefined}
        requested={content}
        validateIncomingAuthority={validate}
        renderTarget={(item) => <span>{item.identity}</span>}
      />,
    );
    await waitFor(() => expect(screen.getByText(content.identity)).toBeTruthy());
    rerender(
      <ProjectAuthoringTargetSwitchRoot
        commitOutgoingSnapshot={async () => undefined}
        requested={character}
        validateIncomingAuthority={validate}
        renderTarget={(item) => <span>{item.identity}</span>}
      />,
    );
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('unavailable'));
    expect(screen.queryByText(content.identity)).toBeNull();
    expect(screen.queryByText(character.identity)).toBeNull();
  });

  it('releases outgoing presentation resources without releasing a protected runtime owner', async () => {
    const content = writableNavigationItems()[0]!;
    const character = writableNavigationItems()[1]!;
    const resources = { roots: 0, subscriptions: 0, providers: 0, mediaHandles: 0, runtime: 1 };
    const { rerender } = render(
      <ProjectAuthoringTargetSwitchRoot
        commitOutgoingSnapshot={async () => undefined}
        requested={content}
        validateIncomingAuthority={async () => undefined}
        renderTarget={(item) => (
          <ResourceLifecycleSurface identity={item.identity} resources={resources} />
        )}
      />,
    );
    await waitFor(() => expect(screen.getByText(content.identity)).toBeTruthy());
    expect(resources).toEqual({
      roots: 1,
      subscriptions: 1,
      providers: 1,
      mediaHandles: 1,
      runtime: 1,
    });
    rerender(
      <ProjectAuthoringTargetSwitchRoot
        commitOutgoingSnapshot={async () => undefined}
        requested={character}
        validateIncomingAuthority={async () => undefined}
        renderTarget={(item) => (
          <ResourceLifecycleSurface identity={item.identity} resources={resources} />
        )}
      />,
    );
    await waitFor(() => expect(screen.getByText(character.identity)).toBeTruthy());
    expect(resources).toEqual({
      roots: 1,
      subscriptions: 1,
      providers: 1,
      mediaHandles: 1,
      runtime: 1,
    });
  });
});

function writableNavigationItems(): readonly ProjectWritableNavigationItem[] {
  return [
    {
      kind: 'authoring-target',
      target: { kind: 'content-project', contentProjectId: 'project-1' },
      identity: 'content-project:project-1',
      label: 'Story',
    },
    {
      kind: 'authoring-target',
      target: { kind: 'character-project', characterProjectId: 'character-1' },
      identity: 'character-project:character-1',
      label: 'Lead',
    },
  ];
}

function LifecycleSurface({
  events,
  identity,
}: {
  events: string[];
  identity: string;
}): JSX.Element {
  useEffect(() => {
    events.push(`mount:${identity}`);
    return () => {
      events.push(`unmount:${identity}`);
    };
  }, [events, identity]);
  return <span>{identity}</span>;
}

function ResourceLifecycleSurface({
  identity,
  resources,
}: {
  readonly identity: string;
  readonly resources: {
    roots: number;
    subscriptions: number;
    providers: number;
    mediaHandles: number;
    runtime: number;
  };
}): JSX.Element {
  useEffect(() => {
    resources.roots += 1;
    resources.subscriptions += 1;
    resources.providers += 1;
    resources.mediaHandles += 1;
    return () => {
      resources.roots -= 1;
      resources.subscriptions -= 1;
      resources.providers -= 1;
      resources.mediaHandles -= 1;
    };
  }, [resources]);
  return <span>{identity}</span>;
}
