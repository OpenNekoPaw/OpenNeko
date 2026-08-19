import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthoringTargetSelector } from './AuthoringTargetSelector';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('AuthoringTargetSelector', () => {
  it('renders only Workspace Projects and never promotes installed targets into Projects', async () => {
    const selected = {
      label: 'Novel',
      context: {
        kind: 'workspace' as const,
        workspaceId: 'project-1',
        workspaceGrantId: 'grant-project-1',
      },
    };
    const onSelectProject = vi.fn(async () => selected);
    const onChange = vi.fn(async () => undefined);
    const loadAuthoringCatalog = vi.fn(async () => ({
      targets: [
        {
          optionId: 'installed-world-1',
          label: 'Cinder Sea',
          workspaceLabel: 'Installed Worlds',
          target: { kind: 'world-project' as const, worldProjectId: 'world-1' },
          placement: { kind: 'project' as const, projectId: 'project-1' },
        },
      ],
      creationContexts: [],
      diagnostics: [],
    }));

    render(
      <AuthoringTargetSelector
        presentation={{
          kind: 'entry',
          projects: [{ projectId: 'project-1', label: 'Novel' }],
          onChooseDirectory: vi.fn(async () => selected),
          onSelectProject,
          loadAuthoringCatalog,
        }}
        selected={selected}
        pending={false}
        onChange={onChange}
      />,
    );

    expect(loadAuthoringCatalog).not.toHaveBeenCalled();
    const resources = screen.getByLabelText('chat.entryAction.label');
    expect(resources.querySelectorAll('[data-entry-resource-kind="project"]')).toHaveLength(1);
    expect(resources.querySelectorAll('[data-entry-resource-kind="character"]')).toHaveLength(0);
    expect(resources.querySelectorAll('[data-entry-resource-kind="world"]')).toHaveLength(0);
    expect(screen.queryByText('Cinder Sea')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Novel/u }));
    await waitFor(() => expect(onSelectProject).toHaveBeenCalledWith('project-1'));
    expect(onChange).toHaveBeenCalledWith(selected);
  });

  it('does not load an owner catalog for the Project-only selector', () => {
    const loadAuthoringCatalog = vi.fn(async () => ({
      targets: [],
      creationContexts: [],
      diagnostics: [],
    }));
    const { rerender } = render(<div />);
    expect(loadAuthoringCatalog).not.toHaveBeenCalled();

    rerender(
      <AuthoringTargetSelector
        presentation={{
          kind: 'entry',
          projects: [],
          onChooseDirectory: vi.fn(async () => undefined),
          onSelectProject: vi.fn(async () => undefined),
          loadAuthoringCatalog,
        }}
        pending={false}
        onChange={vi.fn(async () => undefined)}
      />,
    );
    expect(loadAuthoringCatalog).not.toHaveBeenCalled();
  });

  it('keeps existing projects directly selectable without loading copy while the catalog resolves', async () => {
    const loadAuthoringCatalog = vi.fn(
      () =>
        new Promise<{
          targets: readonly [];
          creationContexts: readonly [];
          diagnostics: readonly [];
        }>(() => undefined),
    );

    const selectedProject = {
      label: 'Blame',
      context: {
        kind: 'workspace' as const,
        workspaceId: 'project-1',
        workspaceGrantId: 'grant-project-1',
      },
    };
    const onSelectProject = vi.fn(async () => selectedProject);
    const onChange = vi.fn(async () => undefined);

    render(
      <AuthoringTargetSelector
        presentation={{
          kind: 'entry',
          projects: [
            { projectId: 'project-1', label: 'Blame' },
            { projectId: 'project-2', label: '灯神' },
            { projectId: 'project-3', label: 'neko-test' },
          ],
          onChooseDirectory: vi.fn(async () => undefined),
          onSelectProject,
          loadAuthoringCatalog,
        }}
        pending={false}
        onChange={onChange}
      />,
    );

    const resources = screen.getByLabelText('chat.entryAction.label');
    expect(resources.querySelectorAll('[data-entry-resource-kind="project"]')).toHaveLength(3);
    expect(loadAuthoringCatalog).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('chat.input.workspace.loadingTargets')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Blame/u }));
    await waitFor(() => expect(onSelectProject).toHaveBeenCalledWith('project-1'));
    expect(onChange).toHaveBeenCalledWith(selectedProject);
  });

  it('creates a fresh Character target only in an explicit project-local destination', async () => {
    const projectLocal = {
      creationId: 'project-1-character',
      label: 'Blame / Character',
      targetKind: 'character-project' as const,
      placement: { kind: 'project' as const, projectId: 'project-1' },
    };
    const created = {
      label: 'Blame / Aster',
      context: {
        kind: 'workspace' as const,
        workspaceId: 'project-1',
        workspaceGrantId: 'grant-project-1',
      },
      target: { kind: 'character-project' as const, characterProjectId: 'character-1' },
      authority: { kind: 'project' as const, projectId: 'project-1' },
    };
    const onCreateAuthoringTarget = vi.fn(async () => ({
      status: 'created' as const,
      target: created,
    }));
    const onChange = vi.fn(async () => undefined);

    render(
      <AuthoringTargetSelector
        presentation={{
          kind: 'entry',
          projects: [],
          onChooseDirectory: vi.fn(async () => undefined),
          onSelectProject: vi.fn(async () => undefined),
          loadAuthoringCatalog: vi.fn(async () => ({
            targets: [],
            creationContexts: [projectLocal],
            diagnostics: [],
          })),
          onCreateAuthoringTarget,
        }}
        pending={false}
        creationOnlyKind="character-project"
        onChange={onChange}
      />,
    );

    const name = screen.getByRole('textbox', { name: 'chat.entryAuthoring.nameLabel' });
    expect(await screen.findByRole('button', { name: /Blame \/ Character/u })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.change(name, { target: { value: 'Aster' } });
    fireEvent.click(screen.getByRole('button', { name: /Blame \/ Character/u }));

    await waitFor(() =>
      expect(onCreateAuthoringTarget).toHaveBeenCalledWith(projectLocal, 'Aster'),
    );
    expect(onChange).toHaveBeenCalledWith(created);
  });

  it('cancels destination selection without creating a Character target', async () => {
    const onCreateAuthoringTarget = vi.fn();
    const onCancelCreation = vi.fn();

    render(
      <AuthoringTargetSelector
        presentation={{
          kind: 'entry',
          projects: [],
          onChooseDirectory: vi.fn(async () => undefined),
          onSelectProject: vi.fn(async () => undefined),
          loadAuthoringCatalog: vi.fn(async () => ({
            targets: [],
            creationContexts: [],
            diagnostics: [],
          })),
          onCreateAuthoringTarget,
        }}
        pending={false}
        creationOnlyKind="character-project"
        onCancelCreation={onCancelCreation}
        onChange={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'chat.entryAuthoring.cancel' }));
    expect(onCancelCreation).toHaveBeenCalledOnce();
    expect(onCreateAuthoringTarget).not.toHaveBeenCalled();
  });
});
