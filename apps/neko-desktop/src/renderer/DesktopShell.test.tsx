import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DesktopShellProjection } from '../shared/shell-contract';
import { DesktopShellView } from './DesktopShell';

describe('DesktopShellView', () => {
  it('renders Home from the authoritative catalog without inventing domain success', () => {
    const markup = renderToStaticMarkup(<DesktopShellView projection={homeProjection()} />);

    expect(markup).toContain('Recent content projects');
    expect(markup).toContain('Demo Project');
    expect(markup).toContain('Character');
    expect(markup).toContain('Unavailable');
    expect(markup).not.toContain('/Users/private');
  });

  it('renders a Content Project shell with explicit unavailable domain state', () => {
    const projection = homeProjection();
    const markup = renderToStaticMarkup(
      <DesktopShellView
        projection={{
          ...projection,
          window: {
            ...projection.window,
            activeTarget: { kind: 'project', tabId: 'tab-1' },
            tabs: [
              {
                tabId: 'tab-1',
                projectId: 'content:workspace-1',
                viewId: 'view-1',
                viewEpoch: 1,
              },
            ],
          },
        }}
      />,
    );

    expect(markup).toContain('Content project');
    expect(markup).toContain('Creative surface unavailable');
    expect(markup).toContain('desktop-domain-surface-unavailable');
    expect(markup).toContain('Context');
  });
});

function homeProjection(): DesktopShellProjection {
  return {
    schemaVersion: 1,
    applicationInstanceId: 'app-1',
    endpointEpoch: 'app-1:window-1:1',
    projectionRevision: 2,
    catalog: {
      revision: 1,
      projects: [
        {
          projectId: 'content:workspace-1',
          workspaceId: 'workspace-1',
          profile: 'content',
          displayName: 'Demo Project',
          createdAt: '2026-07-27T00:00:00.000Z',
          updatedAt: '2026-07-27T00:00:00.000Z',
        },
      ],
    },
    window: {
      windowId: 'window-1',
      revision: 1,
      activeTarget: { kind: 'home' },
      tabs: [],
    },
    attention: { needsInput: 0, needsReview: 0, running: 0 },
    domains: [
      unavailable('agent', 'P1.3'),
      unavailable('media-library', 'P1.4'),
      unavailable('canvas', 'P1.4'),
      unavailable('cut', 'P1.5'),
      unavailable('preview', 'P1.5'),
      unavailable('generation', 'P1.6'),
      unavailable('quality', 'P1.6'),
      unavailable('character', 'P1.6'),
      unavailable('world', 'P1.6'),
      unavailable('tools', 'P1.6'),
    ],
  };
}

function unavailable(
  surface: DesktopShellProjection['domains'][number]['surface'],
  ownerSlice: DesktopShellProjection['domains'][number]['ownerSlice'],
): DesktopShellProjection['domains'][number] {
  return {
    surface,
    ownerSlice,
    status: 'unavailable',
    diagnosticCode: 'desktop-domain-surface-unavailable',
  };
}
