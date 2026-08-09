// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { AgentHostToWebviewMessage } from '@neko/agent-contracts';
import { createElectronAgentLaunchHostRuntimeAdapter } from './desktop-agent-launch-host-runtime-adapter';
import type { DesktopAgentPresentationStorage } from './desktop-agent-host-runtime-adapter';

describe('Electron Agent launch Host runtime adapter', () => {
  it('projects secret-free launch catalogs and denies Workspace routes in Assistant scope', () => {
    const adapter = createElectronAgentLaunchHostRuntimeAdapter({
      bridge: createBridge(),
      catalog: createCatalog(),
      draftId: 'draft:entry',
    });
    const messages: AgentHostToWebviewMessage[] = [];
    adapter.subscribe((message) => messages.push(message));

    adapter.send({ type: 'refreshConfigSnapshot' });
    adapter.send({ type: 'getSkills' });
    adapter.send({ type: 'searchProjectFiles', filter: 'secret', purpose: 'entry' });

    expect(messages[0]).toMatchObject({
      type: 'configState',
      config: {
        selectedProviderId: 'openai',
        selectedModelId: 'gpt-5',
      },
    });
    expect(JSON.stringify(messages[0])).not.toContain('apiKey');
    expect(messages[1]).toMatchObject({
      type: 'skillsList',
      skills: [expect.objectContaining({ name: 'general-help' })],
    });
    expect(messages[2]).toEqual({
      type: 'globalError',
      message:
        "Agent route 'searchProjectFiles' requires an explicitly authorized Workspace scope.",
    });
  });

  it('fails visibly for session-only routes and detaches once', async () => {
    const bridge = createBridge();
    const adapter = createElectronAgentLaunchHostRuntimeAdapter({
      bridge,
      catalog: createCatalog(),
      draftId: 'draft:entry',
    });
    const messages: AgentHostToWebviewMessage[] = [];
    adapter.subscribe((message) => messages.push(message));

    adapter.send({ type: 'newConversation' });
    expect(messages).toEqual([
      {
        type: 'globalError',
        message: "Agent route 'newConversation' requires a committed conversation session.",
      },
    ]);
    await adapter.dispose();
    await adapter.dispose();
    expect(bridge.agentLaunch.detach).toHaveBeenCalledOnce();
  });

  it('restores the one Window entry draft across scope and connection replacement', () => {
    const storage = createStorage();
    const first = createElectronAgentLaunchHostRuntimeAdapter({
      bridge: createBridge(),
      catalog: createCatalog(),
      draftId: 'draft:entry',
      storage,
    });
    const replacement = createElectronAgentLaunchHostRuntimeAdapter({
      bridge: createBridge(),
      catalog: {
        ...createCatalog(),
        connection: {
          ...createCatalog().connection,
          connectionId: 'launch-replacement',
        },
      },
      draftId: 'draft:entry',
      storage,
    });
    const workspaceReplacement = createElectronAgentLaunchHostRuntimeAdapter({
      bridge: createBridge(),
      catalog: {
        ...createCatalog(),
        connection: {
          ...createCatalog().connection,
          connectionId: 'launch-workspace-replacement',
          scope: {
            kind: 'workspace' as const,
            workspaceId: 'workspace:1',
            workspaceGrantId: 'workspace-grant:1',
          },
        },
      },
      draftId: 'draft:entry',
      storage,
    });

    first.setState({ drafts: [{ tabId: 'tab-1' }] });

    expect(replacement.getState()).toEqual({ drafts: [{ tabId: 'tab-1' }] });
    expect(workspaceReplacement.getState()).toEqual({ drafts: [{ tabId: 'tab-1' }] });
    expect([...storage.values.keys()]).toEqual([
      'openneko:agent:presentation:window:window-1:draft:draft:entry:agent-view:window-1',
    ]);
  });

  it('authorizes a file into an opaque context payload without projecting its Host path', async () => {
    const bridge = createBridge();
    bridge.agentLaunch.authorizeResource.mockResolvedValueOnce({
      ...createCatalog(),
      resources: [
        {
          kind: 'resource',
          id: 'resource:grant-1',
          label: 'notes.txt',
          scopeRequirement: 'assistant',
          resourceGrantId: 'grant-1',
          resourceKind: 'file',
        },
      ],
    });
    const adapter = createElectronAgentLaunchHostRuntimeAdapter({
      bridge,
      catalog: createCatalog(),
      draftId: 'draft:entry',
    });

    const payload = await adapter.authorizeResource('file');

    expect(payload).toEqual({
      type: 'file',
      id: 'grant-1',
      label: 'notes.txt',
      summary: 'Authorized file: notes.txt',
      data: { resourceGrantId: 'grant-1', resourceKind: 'file' },
    });
    expect(JSON.stringify(payload)).not.toContain('/');
  });
});

function createBridge() {
  return {
    agentLaunch: {
      attach: vi.fn(),
      authorizeResource: vi.fn(),
      submitDraft: vi.fn(),
      detach: vi.fn(async () => undefined),
    },
  };
}

function createCatalog() {
  return {
    connection: {
      applicationInstanceId: 'app-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view:window-1',
      connectionId: 'launch-1',
      scope: { kind: 'assistant' as const, assistantSpaceId: 'assistant:1' },
    },
    models: [
      {
        kind: 'model' as const,
        id: 'openai:gpt-5',
        label: 'GPT-5',
        scopeRequirement: 'any' as const,
        providerId: 'openai',
        modelId: 'gpt-5',
        modelType: 'llm' as const,
      },
    ],
    commands: [],
    skills: [
      {
        kind: 'skill' as const,
        id: 'skill:personal:general-help',
        label: 'general-help',
        scopeRequirement: 'any' as const,
        name: 'general-help',
        description: 'Help with general tasks.',
        source: 'personal' as const,
      },
      {
        kind: 'skill' as const,
        id: 'skill:project:workspace-only',
        label: 'workspace-only',
        scopeRequirement: 'workspace' as const,
        name: 'workspace-only',
        description: 'Mutate Workspace facts.',
        source: 'project' as const,
      },
    ],
    characters: [],
    resources: [],
  };
}

function createStorage(): DesktopAgentPresentationStorage & {
  readonly values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
