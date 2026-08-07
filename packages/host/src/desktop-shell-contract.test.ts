import { describe, expect, it } from 'vitest';
import {
  createDesktopConversationDeleteRequest,
  createDesktopProfileRequest,
  createDesktopProjectDeleteRequest,
  createDesktopProjectOpenRequest,
  createDesktopTabMutationRequest,
  DesktopShellContractError,
  parseDesktopProjectDeleteRequest,
  parseDesktopShellProjection,
  parseDesktopShellProjectionEvent,
  projectDesktopConversationNavigation,
} from './desktop-shell-contract';
import { createDefaultDesktopWorkbenchLayout } from './desktop-workbench-contract';
import {
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
} from './desktop-scene-contract';
import { createDesktopWindowComposition } from './desktop-window-composition-contract';

describe('Desktop Shell contract', () => {
  it('groups Workspace conversations under exact Projects and Assistant conversations standalone', () => {
    const catalog = validProjection().catalog;
    const workspaceConversation = conversation('workspace-conversation', {
      kind: 'workspace',
      workspaceId: 'workspace-1',
    });
    const assistantConversation = conversation('assistant-conversation', {
      kind: 'assistant',
      assistantSpaceId: 'assistant-space:local-user',
    });
    const navigation = projectDesktopConversationNavigation(catalog, {
      conversations: [assistantConversation, workspaceConversation],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    });

    expect(navigation.groups).toEqual([
      expect.objectContaining({
        kind: 'project',
        projectId: 'content:workspace-1',
        conversations: [workspaceConversation],
      }),
      expect.objectContaining({
        kind: 'assistant',
        assistantSpaceId: 'assistant-space:local-user',
        conversations: [assistantConversation],
      }),
    ]);
  });

  it('places an explicitly grouped Assistant conversation without changing its owner', () => {
    const catalog = validProjection().catalog;
    const assistantConversation = {
      ...conversation('assistant-conversation', {
        kind: 'assistant' as const,
        assistantSpaceId: 'assistant-space:local-user',
      }),
      groupedProjectId: 'content:workspace-1',
    };

    const navigation = projectDesktopConversationNavigation(catalog, {
      conversations: [assistantConversation],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    });

    expect(navigation.groups[0]).toMatchObject({
      kind: 'project',
      conversations: [
        {
          groupedProjectId: 'content:workspace-1',
          navigation: {
            owner: { kind: 'assistant', assistantSpaceId: 'assistant-space:local-user' },
          },
        },
      ],
    });
  });

  it('retains unavailable Workspace conversations and rejects unknown explicit associations', () => {
    expect(
      projectDesktopConversationNavigation(
        { projects: [] },
        {
          conversations: [
            conversation('workspace-conversation', {
              kind: 'workspace',
              workspaceId: 'workspace-missing',
            }),
          ],
          attention: { needsInput: 0, needsReview: 0, running: 0 },
        },
      ).groups,
    ).toEqual([
      expect.objectContaining({
        kind: 'workspace',
        workspaceId: 'workspace-missing',
        fieldNames: ['workspaceId'],
        conversations: [expect.objectContaining({ title: 'workspace-conversation' })],
      }),
    ]);
    expect(() =>
      projectDesktopConversationNavigation(validProjection().catalog, {
        conversations: [
          {
            ...conversation('assistant-conversation', {
              kind: 'assistant',
              assistantSpaceId: 'assistant-space:local-user',
            }),
            groupedProjectId: 'project-missing',
          },
        ],
        attention: { needsInput: 0, needsReview: 0, running: 0 },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DesktopShellContractError>>({
        code: 'desktop-shell-project-identity-mismatch',
      }),
    );
  });

  it('creates fixed profile and sender-bound mutation requests', () => {
    expect(createDesktopProfileRequest('request-1', 'character')).toEqual({
      requestId: 'request-1',
      profile: 'character',
    });
    expect(createDesktopTabMutationRequest('request-2', 'tab-1', 'renderer-session-1')).toEqual({
      requestId: 'request-2',
      rendererSessionId: 'renderer-session-1',
      tabId: 'tab-1',
    });
    expect(
      createDesktopProjectOpenRequest('request-3', 'content:workspace-1', 'renderer-session-1'),
    ).toEqual({
      requestId: 'request-3',
      rendererSessionId: 'renderer-session-1',
      projectId: 'content:workspace-1',
    });
    expect(
      createDesktopProjectDeleteRequest(
        'request-4',
        ['content:workspace-1', 'content:workspace-2'],
        'renderer-session-1',
      ),
    ).toEqual({
      requestId: 'request-4',
      rendererSessionId: 'renderer-session-1',
      projectIds: ['content:workspace-1', 'content:workspace-2'],
    });
    expect(
      createDesktopConversationDeleteRequest(
        'request-5',
        {
          conversationId: 'conversation-1',
          owner: { kind: 'workspace', workspaceId: 'workspace-1' },
        },
        'renderer-session-1',
      ),
    ).toEqual({
      requestId: 'request-5',
      rendererSessionId: 'renderer-session-1',
      navigation: {
        conversationId: 'conversation-1',
        owner: { kind: 'workspace', workspaceId: 'workspace-1' },
      },
    });
  });

  it('strictly rejects invalid Project delete payloads', () => {
    expect(() =>
      parseDesktopProjectDeleteRequest({
        requestId: 'request-1',
        rendererSessionId: 'renderer-session-1',
        projectId: 'content:workspace-1',
      }),
    ).toThrowError(DesktopShellContractError);
    expect(() =>
      createDesktopProjectDeleteRequest('request-2', [], 'renderer-session-1'),
    ).toThrowError('At least one Desktop Project identity is required.');
    expect(() =>
      createDesktopProjectDeleteRequest(
        'request-3',
        ['content:workspace-1', 'content:workspace-1'],
        'renderer-session-1',
      ),
    ).toThrowError('Desktop Project identities must be unique.');
  });

  it('rejects an active Tab that is not in the Window projection', () => {
    expect(() =>
      parseDesktopShellProjection({
        ...validProjection(),
        window: {
          ...validProjection().window,
          activeTarget: { kind: 'project', tabId: 'missing-tab' },
        },
      }),
    ).toThrowError(DesktopShellContractError);
  });

  it('isolates an invalid Project catalog while preserving sibling Shell components', () => {
    const canonical = validProjection();
    const parsedCanonical = parseDesktopShellProjection(canonical);
    const parsed = parseDesktopShellProjection({
      ...canonical,
      catalog: {
        ...canonical.catalog,
        unexpectedField: 1,
      },
    });

    expect(parsed.catalog.projects).toEqual([]);
    expect(parsed.window).toEqual(parsedCanonical.window);
    expect(parsed.agentHome).toEqual(parsedCanonical.agentHome);
    expect(parsed.domains).toEqual(parsedCanonical.domains);
    expect(parsed.stateDiagnostics).toEqual([
      expect.objectContaining({
        code: 'desktop-shell-component-invalid',
        component: 'project-catalog',
        severity: 'error',
      }),
    ]);
    expect(parsed.stateDiagnostics?.[0]?.message).toContain(
      "contains unknown field 'unexpectedField'",
    );
    expect(parsedCanonical.catalog.projects).toHaveLength(1);
  });

  it('rejects absolute path leakage by projecting only known Project fields', () => {
    const projection = parseDesktopShellProjection({
      ...validProjection(),
      catalog: {
        projects: [
          {
            ...validProjection().catalog.projects[0],
            workspacePath: '/Users/private/workspace',
          },
        ],
      },
    });

    expect(projection.catalog.projects[0]).not.toHaveProperty('workspacePath');
    expect(JSON.stringify(projection)).not.toContain('/Users/private');
  });

  it('rejects projection events whose Window identity does not match', () => {
    expect(() =>
      parseDesktopShellProjectionEvent({
        applicationInstanceId: 'app-1',
        windowId: 'window-2',
        rendererSessionId: 'renderer-session-1',
        sequence: 1,
        projection: validProjection(),
      }),
    ).toThrowError(DesktopShellContractError);
  });

  it('rejects removed or unknown Shell projection fields', () => {
    expect(() =>
      parseDesktopShellProjection({
        ...validProjection(),
        removedTechnicalField: 1,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DesktopShellContractError>>({
        code: 'invalid-desktop-shell-payload',
      }),
    );
  });

  it('parses an exact rejected Shell authority diagnostic', () => {
    expect(
      parseDesktopShellProjection({
        ...validProjection(),
        stateDiagnostics: [
          {
            code: 'desktop-stored-state-invalid',
            severity: 'error',
            authorityKey: 'desktop.shell',
            rejectionId: 12,
            message: 'Stored Shell authority was rejected.',
          },
        ],
      }).stateDiagnostics,
    ).toEqual([
      {
        code: 'desktop-stored-state-invalid',
        severity: 'error',
        authorityKey: 'desktop.shell',
        rejectionId: 12,
        message: 'Stored Shell authority was rejected.',
      },
    ]);
    expect(
      parseDesktopShellProjection({
        ...validProjection(),
        stateDiagnostics: [
          {
            code: 'desktop-stored-state-invalid',
            severity: 'error',
            authorityKey: 'desktop.application-settings',
            rejectionId: 13,
            message: 'Stored Application Settings authority was rejected.',
          },
        ],
      }).stateDiagnostics,
    ).toEqual([
      {
        code: 'desktop-stored-state-invalid',
        severity: 'error',
        authorityKey: 'desktop.application-settings',
        rejectionId: 13,
        message: 'Stored Application Settings authority was rejected.',
      },
    ]);
    expect(() =>
      parseDesktopShellProjection({
        ...validProjection(),
        stateDiagnostics: [
          {
            code: 'desktop-stored-state-invalid',
            severity: 'error',
            authorityKey: 'desktop.shell',
            rejectionId: 0,
            message: 'Invalid rejection identity.',
          },
        ],
      }),
    ).toThrowError(DesktopShellContractError);
  });

  it('parses exact retained Shell metadata without changing sibling projections', () => {
    const canonical = validProjection();
    const parsed = parseDesktopShellProjection({
      ...canonical,
      stateDiagnostics: [
        {
          code: 'desktop-stored-state-metadata-retained',
          severity: 'warning',
          authorityKey: 'desktop.shell',
          fieldNames: ['opaqueSourceMarker'],
          message: 'Desktop Shell root metadata was preserved without interpretation.',
        },
      ],
    });

    expect(parsed.catalog).toEqual(canonical.catalog);
    expect(parsed.window).toEqual(canonical.window);
    expect(parsed.stateDiagnostics).toEqual([
      {
        code: 'desktop-stored-state-metadata-retained',
        severity: 'warning',
        authorityKey: 'desktop.shell',
        fieldNames: ['opaqueSourceMarker'],
        message: 'Desktop Shell root metadata was preserved without interpretation.',
      },
    ]);
  });

  it('accepts ready domains only in their owning Phase 1 slices', () => {
    expect(
      parseDesktopShellProjection({
        ...validProjection(),
        domains: [
          {
            surface: 'agent',
            status: 'ready',
            ownerSlice: 'P1.3',
          },
        ],
      }).domains,
    ).toEqual([{ surface: 'agent', status: 'ready', ownerSlice: 'P1.3' }]);
    expect(
      parseDesktopShellProjection({
        ...validProjection(),
        domains: [
          {
            surface: 'media-library',
            status: 'ready',
            ownerSlice: 'P1.4',
          },
        ],
      }).domains,
    ).toEqual([{ surface: 'media-library', status: 'ready', ownerSlice: 'P1.4' }]);
    expect(
      parseDesktopShellProjection({
        ...validProjection(),
        domains: [
          {
            surface: 'canvas',
            status: 'ready',
            ownerSlice: 'P1.4',
          },
        ],
      }).domains,
    ).toEqual([{ surface: 'canvas', status: 'ready', ownerSlice: 'P1.4' }]);
    expect(
      parseDesktopShellProjection({
        ...validProjection(),
        domains: [
          {
            surface: 'cut',
            status: 'ready',
            ownerSlice: 'P1.5',
          },
          {
            surface: 'preview',
            status: 'ready',
            ownerSlice: 'P1.5',
          },
        ],
      }).domains,
    ).toEqual([
      { surface: 'cut', status: 'ready', ownerSlice: 'P1.5' },
      { surface: 'preview', status: 'ready', ownerSlice: 'P1.5' },
    ]);
  });
});

function validProjection() {
  const scene = createDefaultDesktopAgentScene('window-1', 'draft:test');
  const workbench = createDesktopWindowComposition({
    workbenchInstanceId: 'workbench:window-1:entry',
    layout: createDefaultDesktopWorkbenchLayout('window-1'),
    scene,
  });
  return {
    applicationInstanceId: 'app-1',
    rendererSessionId: 'renderer-session-1',
    catalog: {
      projects: [
        {
          projectId: 'content:workspace-1',
          workspaceId: 'workspace-1',
          profile: 'content' as const,
          displayName: 'Fixture',
          createdAt: '2026-07-27T00:00:00.000Z',
          updatedAt: '2026-07-27T00:00:00.000Z',
        },
      ],
    },
    window: {
      windowId: 'window-1',
      activeTarget: { kind: 'project' as const, tabId: 'tab-1' },
      tabs: [
        {
          tabId: 'tab-1',
          projectId: 'content:workspace-1',
          viewId: 'view-1',
          viewInstanceId: 'view-instance-1',
        },
      ],
      workbench,
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
    agentHome: {
      conversations: [],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    },
    conversationNavigation: {
      groups: [
        {
          kind: 'project' as const,
          projectId: 'content:workspace-1',
          workspaceId: 'workspace-1',
          displayName: 'Fixture',
          conversations: [],
        },
      ],
    },
    domains: [
      {
        surface: 'agent' as const,
        status: 'unavailable' as const,
        ownerSlice: 'P1.3' as const,
        diagnosticCode: 'desktop-domain-surface-unavailable' as const,
      },
    ],
  };
}

function conversation(
  conversationId: string,
  owner:
    | { readonly kind: 'assistant'; readonly assistantSpaceId: string }
    | { readonly kind: 'workspace'; readonly workspaceId: string },
) {
  return {
    navigation: { conversationId, owner },
    title: conversationId,
    updatedAt: '2026-08-04T00:00:00.000Z',
    attention: 'none' as const,
    lastActivity: {
      kind: 'conversation-updated' as const,
      occurredAt: '2026-08-04T00:00:00.000Z',
    },
  };
}
