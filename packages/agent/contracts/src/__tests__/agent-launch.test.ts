import { describe, expect, it } from 'vitest';
import { isAgentLaunchEntryAvailable, parseAgentLaunchCatalogProjection } from '../agent-launch';

describe('Agent launch contract', () => {
  it('parses an exact secret-free, scope-qualified launch catalog', () => {
    const projection = parseAgentLaunchCatalogProjection({
      connection: {
        applicationInstanceId: 'application-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'agent-surface-1',
        viewId: 'agent-view-1',
        connectionId: 'launch-connection-1',
        scope: { kind: 'assistant', assistantSpaceId: 'assistant:1' },
      },
      models: [
        {
          kind: 'model',
          id: 'openai:gpt-5',
          label: 'GPT-5',
          scopeRequirement: 'any',
          providerId: 'openai',
          modelId: 'gpt-5',
          modelType: 'llm',
        },
      ],
      commands: [
        {
          kind: 'command',
          id: 'command:help',
          label: 'Help',
          scopeRequirement: 'any',
          command: 'help',
          description: 'Show help.',
        },
      ],
      skills: [
        {
          kind: 'skill',
          id: 'skill:storyboard',
          label: 'Storyboard',
          scopeRequirement: 'workspace',
          name: 'storyboard',
          description: 'Create a storyboard.',
          source: 'project',
        },
      ],
      resources: [
        {
          kind: 'resource',
          id: 'resource:file-1',
          label: 'reference.png',
          scopeRequirement: 'assistant',
          resourceGrantId: 'resource-grant-1',
          resourceKind: 'file',
        },
      ],
    });

    expect(projection.connection.scope).toEqual({
      kind: 'assistant',
      assistantSpaceId: 'assistant:1',
    });
    expect(isAgentLaunchEntryAvailable(projection.models[0]!, projection.connection.scope)).toBe(
      true,
    );
    expect(isAgentLaunchEntryAvailable(projection.skills[0]!, projection.connection.scope)).toBe(
      false,
    );
  });

  it('rejects paths, secrets, unknown scopes and stale identity shapes', () => {
    const base = {
      connection: {
        applicationInstanceId: 'application-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'agent-surface-1',
        viewId: 'agent-view-1',
        connectionId: 'launch-connection-1',
        scope: { kind: 'assistant', assistantSpaceId: 'assistant:1' },
      },
      models: [],
      commands: [],
      skills: [],
      resources: [],
    };
    expect(() =>
      parseAgentLaunchCatalogProjection({ ...base, absolutePath: '/Users/private' }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseAgentLaunchCatalogProjection({
        ...base,
        resources: [
          {
            kind: 'resource',
            id: 'resource:1',
            label: 'private',
            scopeRequirement: 'home',
            resourceGrantId: 'grant-1',
            resourceKind: 'file',
          },
        ],
      }),
    ).toThrow("Unknown Agent launch scope requirement 'home'");
    expect(() =>
      parseAgentLaunchCatalogProjection({
        ...base,
        connection: { ...base.connection, rendererSessionId: 1 },
      }),
    ).toThrow('unsupported fields');
  });
});
