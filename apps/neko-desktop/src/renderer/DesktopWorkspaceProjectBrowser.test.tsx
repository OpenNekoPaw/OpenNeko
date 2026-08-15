// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DesktopWorkspaceProjectBrowser } from './DesktopWorkspaceProjectBrowser';

afterEach(cleanup);

describe('DesktopWorkspaceProjectBrowser', () => {
  it('mounts only the selected owner Root', () => {
    render(
      <DesktopWorkspaceProjectBrowser
        locale="en"
        resources={<div data-testid="resources-root">Files</div>}
        workspace={<div data-testid="workspace-root">Characters</div>}
      />,
    );

    expect(screen.getByTestId('resources-root')).toBeTruthy();
    expect(screen.queryByTestId('workspace-root')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Creation' }));
    expect(screen.queryByTestId('resources-root')).toBeNull();
    expect(screen.getByTestId('workspace-root')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Resources' }));
    expect(screen.getByTestId('resources-root')).toBeTruthy();
    expect(screen.queryByTestId('workspace-root')).toBeNull();
  });

  it('keeps the sibling view reachable when Project Content reports a local failure', () => {
    render(
      <DesktopWorkspaceProjectBrowser
        locale="en"
        resources={<div data-testid="resources-root">Files</div>}
        workspace={<div role="alert">Workspace unavailable</div>}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Creation' }));
    expect(screen.getByRole('alert').textContent).toBe('Workspace unavailable');
    fireEvent.click(screen.getByRole('tab', { name: 'Resources' }));
    expect(screen.getByTestId('resources-root')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
