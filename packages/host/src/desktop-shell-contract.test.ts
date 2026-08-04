import { describe, expect, it } from 'vitest';
import { AGENT_HOME_PROJECTION_VERSION } from '@neko/agent-contracts';
import {
  DESKTOP_CONVERSATION_NAVIGATION_VERSION,
  DESKTOP_SHELL_CONTRACT_VERSION,
  createDesktopConversationDeleteRequest,
  createDesktopProfileRequest,
  createDesktopProjectOpenRequest,
  createDesktopProjectRemoveRecentRequest,
  createDesktopTabMutationRequest,
  DesktopShellContractError,
  parseDesktopShellProjection,
  parseDesktopShellProjectionEvent,
  projectDesktopConversationNavigation,
} from './desktop-shell-contract';
import { createDefaultDesktopWorkbenchLayout } from './desktop-workbench-contract';
import {
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
} from './desktop-scene-contract';

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
      schemaVersion: AGENT_HOME_PROJECTION_VERSION,
      revision: 3,
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
      schemaVersion: AGENT_HOME_PROJECTION_VERSION,
      revision: 3,
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

  it('rejects Workspace conversations without one exact Project and unknown associations', () => {
    expect(() =>
      projectDesktopConversationNavigation(
        { revision: 1, projects: [] },
        {
          schemaVersion: AGENT_HOME_PROJECTION_VERSION,
          revision: 1,
          conversations: [
            conversation('workspace-conversation', {
              kind: 'workspace',
              workspaceId: 'workspace-missing',
            }),
          ],
          attention: { needsInput: 0, needsReview: 0, running: 0 },
        },
      ),
    ).toThrowError(
      expect.objectContaining<Partial<DesktopShellContractError>>({
        code: 'desktop-shell-project-identity-mismatch',
      }),
    );
    expect(() =>
      projectDesktopConversationNavigation(validProjection().catalog, {
        schemaVersion: AGENT_HOME_PROJECTION_VERSION,
        revision: 1,
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

  it('creates fixed profile and revision-bound Tab requests', () => {
    expect(createDesktopProfileRequest('request-1', 'character')).toEqual({
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: 'request-1',
      profile: 'character',
    });
    expect(createDesktopTabMutationRequest('request-2', 'tab-1', 'app-1:window-1:1', 4)).toEqual({
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: 'request-2',
      expectedEndpointEpoch: 'app-1:window-1:1',
      tabId: 'tab-1',
      expectedWindowRevision: 4,
    });
    expect(
      createDesktopProjectOpenRequest('request-3', 'content:workspace-1', 'app-1:window-1:1', 5),
    ).toEqual({
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: 'request-3',
      expectedEndpointEpoch: 'app-1:window-1:1',
      expectedWindowRevision: 5,
      projectId: 'content:workspace-1',
    });
    expect(
      createDesktopProjectRemoveRecentRequest(
        'request-4',
        'content:workspace-1',
        'app-1:window-1:1',
        5,
        3,
      ),
    ).toEqual({
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: 'request-4',
      expectedEndpointEpoch: 'app-1:window-1:1',
      expectedWindowRevision: 5,
      expectedCatalogRevision: 3,
      projectId: 'content:workspace-1',
    });
    expect(
      createDesktopConversationDeleteRequest(
        'request-5',
        {
          conversationId: 'conversation-1',
          owner: { kind: 'workspace', workspaceId: 'workspace-1' },
        },
        'app-1:window-1:1',
        5,
        7,
      ),
    ).toEqual({
      schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
      requestId: 'request-5',
      expectedEndpointEpoch: 'app-1:window-1:1',
      expectedWindowRevision: 5,
      expectedAgentHomeRevision: 7,
      navigation: {
        conversationId: 'conversation-1',
        owner: { kind: 'workspace', workspaceId: 'workspace-1' },
      },
    });
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

  it('rejects absolute path leakage by projecting only known Project fields', () => {
    const projection = parseDesktopShellProjection({
      ...validProjection(),
      catalog: {
        revision: 1,
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
        schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
        applicationInstanceId: 'app-1',
        windowId: 'window-2',
        rendererEpoch: 1,
        sequence: 1,
        projection: validProjection(),
      }),
    ).toThrowError(DesktopShellContractError);
  });

  it('rejects the pre-Scene Shell wire version', () => {
    expect(() =>
      parseDesktopShellProjection({
        ...validProjection(),
        schemaVersion: 1,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DesktopShellContractError>>({
        code: 'unsupported-desktop-shell-version',
      }),
    );
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
  return {
    schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
    applicationInstanceId: 'app-1',
    endpointEpoch: 'app-1:window-1:1',
    projectionRevision: 2,
    catalog: {
      revision: 1,
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
      revision: 1,
      activeTarget: { kind: 'project' as const, tabId: 'tab-1' },
      tabs: [
        {
          tabId: 'tab-1',
          projectId: 'content:workspace-1',
          viewId: 'view-1',
          viewEpoch: 1,
        },
      ],
      workbench: createDefaultDesktopWorkbenchLayout('window-1'),
      scene: createDefaultDesktopAgentScene('window-1', 'assistant-space:test'),
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
    agentHome: {
      schemaVersion: AGENT_HOME_PROJECTION_VERSION,
      revision: 0,
      conversations: [],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    },
    conversationNavigation: {
      schemaVersion: DESKTOP_CONVERSATION_NAVIGATION_VERSION,
      projectCatalogRevision: 1,
      agentHomeRevision: 0,
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
