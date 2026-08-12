import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthoringTargetSelector } from './AuthoringTargetSelector';
import type { AgentComposerAuthoringTargetOption } from '../ComposerWorkspaceContext';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('AuthoringTargetSelector', () => {
  it('renders exact owner-qualified targets directly without a category submenu', async () => {
    const selected = {
      label: 'Characters / Aster',
      context: {
        kind: 'workspace' as const,
        workspaceId: 'character-library',
        workspaceGrantId: 'grant-character',
      },
      target: { kind: 'character-project' as const, characterProjectId: 'character-1' },
    };
    const characterOption = {
      optionId: 'standalone-character:character-1',
      label: 'Aster',
      workspaceLabel: 'Characters',
      target: selected.target,
      placement: { kind: 'standalone-library' as const, library: 'character' as const },
    };
    const contentOption = {
      optionId: 'content-project:project-1',
      label: 'Novel',
      workspaceLabel: 'Projects',
      target: { kind: 'content-project' as const, contentProjectId: 'project-1' },
      placement: { kind: 'content-project' as const, contentProjectId: 'project-1' },
    };
    const worldOption = {
      optionId: 'project-1:world-project:world-1',
      label: 'Cinder Sea',
      workspaceLabel: 'Novel',
      target: { kind: 'world-project' as const, worldProjectId: 'world-1' },
      placement: { kind: 'project-local' as const, contentProjectId: 'project-1' },
    };
    const onSelectAuthoringTarget = vi.fn(async (option: AgentComposerAuthoringTargetOption) =>
      option === characterOption
        ? selected
        : {
            ...selected,
            label: 'Projects / Novel',
            target: contentOption.target,
          },
    );
    const onChange = vi.fn(async () => undefined);
    const loadAuthoringCatalog = vi.fn(async () => ({
      targets: [contentOption, characterOption, worldOption],
      creationContexts: [],
      diagnostics: [],
    }));

    render(
      <AuthoringTargetSelector
        presentation={{
          kind: 'entry',
          projects: [],
          onChooseDirectory: vi.fn(async () => selected),
          onSelectProject: vi.fn(async () => undefined),
          loadAuthoringCatalog,
          onSelectAuthoringTarget,
        }}
        selected={selected}
        pending={false}
        onChange={onChange}
      />,
    );

    expect(loadAuthoringCatalog).toHaveBeenCalledOnce();
    expect(await screen.findByText('Cinder Sea')).toBeTruthy();
    const resources = screen.getByLabelText('chat.entryAction.label');
    expect(resources.querySelector('[data-entry-resource-kind="project"]')?.textContent).toContain(
      'Novel',
    );
    expect(screen.getByRole('button', { name: /Aster/u })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cinder Sea/u })).toBeTruthy();
    expect(resources.querySelectorAll('[data-entry-resource-kind="project"]')).toHaveLength(1);
    expect(resources.querySelectorAll('[data-entry-resource-kind="character"]')).toHaveLength(1);
    expect(resources.querySelectorAll('[data-entry-resource-kind="world"]')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /chat.entryAction.chooseProject/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /chat.entryAction.chooseCharacter/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /chat.entryAction.chooseWorld/u })).toBeNull();
    expect(screen.queryByLabelText('chat.input.workspace.createTarget')).toBeNull();
    expect(screen.queryByText('chat.entryContext.currentTarget')).toBeNull();
    expect(screen.queryByRole('button', { name: /chat.entryContext.clearTarget/u })).toBeNull();
    expect(screen.getByRole('button', { name: /Aster/u }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /Aster/u }));
    await waitFor(() => expect(onSelectAuthoringTarget).toHaveBeenCalledWith(characterOption));
    expect(onChange).toHaveBeenCalledWith(selected);
  });

  it('does not load an owner catalog while the selector body is unmounted', () => {
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
    expect(loadAuthoringCatalog).toHaveBeenCalledOnce();
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
      target: { kind: 'content-project' as const, contentProjectId: 'project-1' },
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
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('chat.input.workspace.loadingTargets')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Blame/u }));
    await waitFor(() => expect(onSelectProject).toHaveBeenCalledWith('project-1'));
    expect(onChange).toHaveBeenCalledWith(selectedProject);
  });

  it('creates a fresh Character target in an explicit standalone or project-local destination', async () => {
    const standalone = {
      creationId: 'standalone-character',
      label: 'Characters / New',
      targetKind: 'character-project' as const,
      placement: { kind: 'standalone-library' as const, library: 'character' as const },
    };
    const projectLocal = {
      creationId: 'project-1-character',
      label: 'Blame / Character',
      targetKind: 'character-project' as const,
      placement: { kind: 'project-local' as const, contentProjectId: 'project-1' },
    };
    const created = {
      label: 'Characters / Aster',
      context: {
        kind: 'workspace' as const,
        workspaceId: 'character-library',
        workspaceGrantId: 'grant-character',
      },
      target: { kind: 'character-project' as const, characterProjectId: 'character-1' },
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
            creationContexts: [
              standalone,
              projectLocal,
              {
                creationId: 'standalone-world',
                label: 'Worlds / New',
                targetKind: 'world-project' as const,
                placement: { kind: 'standalone-library' as const, library: 'world' as const },
              },
            ],
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
    expect(await screen.findByRole('button', { name: /Characters \/ New/u })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.queryByText('Worlds / New')).toBeNull();

    fireEvent.change(name, { target: { value: 'Aster' } });
    fireEvent.click(screen.getByRole('button', { name: /Characters \/ New/u }));

    await waitFor(() => expect(onCreateAuthoringTarget).toHaveBeenCalledWith(standalone, 'Aster'));
    expect(onChange).toHaveBeenCalledWith(created);
  });

  it('keeps an incomplete Character visible and retries only its supplied repair action', async () => {
    const context = {
      creationId: 'project-1-character',
      label: 'Blame / Character',
      targetKind: 'character-project' as const,
      placement: { kind: 'project-local' as const, contentProjectId: 'project-1' },
    };
    const created = {
      label: 'Blame / Aster',
      context: {
        kind: 'workspace' as const,
        workspaceId: 'workspace-1',
        workspaceGrantId: 'grant-1',
      },
      target: { kind: 'character-project' as const, characterProjectId: 'character-1' },
    };
    const retry = vi.fn(async () => ({ status: 'created' as const, target: created }));
    const onCreateAuthoringTarget = vi.fn(async () => ({
      status: 'incomplete' as const,
      retry,
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
            creationContexts: [context],
            diagnostics: [],
          })),
          onCreateAuthoringTarget,
        }}
        pending={false}
        creationOnlyKind="character-project"
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Aster' } });
    fireEvent.click(await screen.findByRole('button', { name: /Blame \/ Character/u }));
    expect((await screen.findByRole('alert', { name: '' })).textContent).toBe(
      'chat.entryAuthoring.creationIncomplete',
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Blame \/ Character/u })).toHaveProperty(
      'disabled',
      true,
    );

    fireEvent.click(screen.getByRole('button', { name: 'chat.entryAuthoring.retryMissingStep' }));
    await waitFor(() => expect(retry).toHaveBeenCalledOnce());
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
