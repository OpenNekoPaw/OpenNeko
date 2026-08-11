// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ProjectAuthoringNavigationItem } from '@neko/project/contracts';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProjectAuthoringNavigationRoot,
  ProjectAuthoringTargetSwitchRoot,
  ProjectCatalogRoot,
  filterAndSortProjectCatalog,
  type ProjectWritableNavigationItem,
} from './root';

vi.mock('@neko/ui/i18n/react', () => ({
  useTranslation: () => ({ locale: 'en', t: (key: string) => key }),
}));

afterEach(cleanup);

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

  it('separates writable authoring targets from external read-only dependencies', () => {
    const onActivate = vi.fn();
    const onOpenSource = vi.fn();
    render(
      <ProjectAuthoringNavigationRoot
        activeIdentity="character-project:character-1"
        items={navigationItems()}
        labels={{
          authoring: 'Authoring',
          dependencies: 'Dependencies',
          openSource: 'Open source',
          readOnly: 'Read only',
        }}
        onActivate={onActivate}
        onOpenSource={onOpenSource}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lead' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open source: Published world' }));
    expect(onActivate).toHaveBeenCalledWith(
      expect.objectContaining({ identity: 'character-project:character-1' }),
    );
    expect(onOpenSource).toHaveBeenCalledWith(
      expect.objectContaining({ identity: 'world-experience-version:world-1' }),
    );
    expect(
      screen
        .getByText('Published world')
        .closest('[data-external-dependency]')
        ?.classList.contains('is-read-only'),
    ).toBe(true);
    const lead = screen.getByRole('button', { name: 'Lead' });
    lead.focus();
    expect(document.activeElement).toBe(lead);
  });

  it('disables only an invalid authoring row and preserves sibling keyboard focus', () => {
    const items: readonly ProjectAuthoringNavigationItem[] = [
      ...writableNavigationItems(),
      {
        kind: 'authoring-target',
        target: { kind: 'world-project', worldProjectId: 'world-invalid' },
        identity: 'world-project:world-invalid',
        label: 'Broken world',
        diagnostic: 'World record cannot decode.',
      },
    ];
    render(
      <ProjectAuthoringNavigationRoot
        items={items}
        labels={{
          authoring: 'Authoring',
          dependencies: 'Dependencies',
          openSource: 'Open source',
          readOnly: 'Read only',
        }}
        onActivate={vi.fn()}
        onOpenSource={vi.fn()}
      />,
    );
    const broken = screen.getByRole('button', { name: /Broken world/u }) as HTMLButtonElement;
    const story = screen.getByRole('button', { name: 'Story' }) as HTMLButtonElement;
    expect(broken.disabled).toBe(true);
    expect(broken.title).toBe('World record cannot decode.');
    expect(story.disabled).toBe(false);
    story.focus();
    expect(document.activeElement).toBe(story);
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

function navigationItems(): readonly ProjectAuthoringNavigationItem[] {
  return [
    ...writableNavigationItems(),
    {
      kind: 'external-dependency',
      dependency: {
        kind: 'world-experience-version',
        worldExperienceVersionId: 'world-1',
      },
      identity: 'world-experience-version:world-1',
      label: 'Published world',
      readOnly: true,
      sourceStudioTarget: { kind: 'world-studio', worldProjectId: 'world-project-1' },
    },
  ];
}

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
