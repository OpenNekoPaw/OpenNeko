import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityProvider, PromptFragment, Tool } from '@neko/agent-contracts';
import { ToolRegistry } from '../../tools';
import { CapabilityRegistryRuntime } from '../capability/capability-registry-runtime';

function createTool(name: string): Tool {
  return {
    name,
    description: `${name} description`,
    category: 'system',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ success: true }),
  };
}

function createProvider(id: string, tools: Tool[]): AgentCapabilityProvider {
  return {
    id,
    getTools: () => tools,
  };
}

describe('CapabilityRegistryRuntime', () => {
  it('projects localized provider prompt fragments from the registered capability context', () => {
    const toolRegistry = new ToolRegistry();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });
    const fragment = {
      id: 'neko.canvas:markdown',
      content: 'Canvas Markdown guidance.',
      priority: 72,
      toolNames: ['CanvasMarkdown'],
      locales: {
        zh: {
          content: 'Canvas Markdown 中文指导。',
        },
      },
    } satisfies PromptFragment & {
      readonly locales: {
        readonly zh: {
          readonly content: string;
        };
      };
    };

    runtime.registerProvider(
      {
        ...createProvider('neko.canvas', [createTool('CanvasMarkdown')]),
        getPromptFragments: () => [fragment],
      },
      { hostContext: {}, locale: 'zh' },
    );

    expect(runtime.getAllPromptFragments()).toEqual([
      expect.objectContaining({
        id: 'neko.canvas:markdown',
        content: 'Canvas Markdown 中文指导。',
        providerId: 'neko.canvas',
      }),
    ]);
  });

  it('sorts prompt fragments by priority and rejects duplicate identities', () => {
    const runtime = new CapabilityRegistryRuntime({ toolRegistry: new ToolRegistry() });
    runtime.registerProvider(
      {
        ...createProvider('neko.first', [createTool('FirstTool')]),
        getPromptFragments: () => [
          {
            id: 'shared:guide',
            content: 'First guide.',
            priority: 71,
            toolNames: ['FirstTool'],
          },
        ],
      },
      { hostContext: {} },
    );
    runtime.registerProvider(
      {
        ...createProvider('neko.second', [createTool('SecondTool')]),
        getPromptFragments: () => [
          {
            id: 'second:guide',
            content: 'Second guide.',
            priority: 72,
            toolNames: ['SecondTool'],
          },
        ],
      },
      { hostContext: {} },
    );

    expect(runtime.getAllPromptFragments().map((fragment) => fragment.id)).toEqual([
      'second:guide',
      'shared:guide',
    ]);

    runtime.registerProvider(
      {
        ...createProvider('neko.conflict', [createTool('ConflictTool')]),
        getPromptFragments: () => [
          {
            id: 'shared:guide',
            content: 'Conflicting guide.',
            toolNames: ['ConflictTool'],
          },
        ],
      },
      { hostContext: {} },
    );
    expect(() => runtime.getAllPromptFragments()).toThrow(
      "Prompt fragment 'shared:guide' is already owned by provider 'neko.first'.",
    );
  });

  it('cleans registered providers that no longer have installed manifests', () => {
    const toolRegistry = new ToolRegistry();
    const disposed = vi.fn();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });
    const installedTool = createTool('InstalledTool');
    const removedTool = createTool('RemovedTool');

    runtime.registerProvider(createProvider('neko.installed', [installedTool]), {
      hostContext: {},
    });
    runtime.registerProvider(
      {
        ...createProvider('neko.removed', [removedTool]),
        dispose: disposed,
      },
      { hostContext: {} },
    );
    runtime.replaceManifests([
      {
        id: 'neko.installed',
        displayName: 'Installed',
        capabilities: [],
      },
    ]);

    expect(runtime.cleanupProvidersWithoutManifests()).toEqual(['neko.removed']);
    expect(runtime.hasProvider('neko.installed')).toBe(true);
    expect(runtime.hasProvider('neko.removed')).toBe(false);
    expect(toolRegistry.get('InstalledTool')).toBe(installedTool);
    expect(toolRegistry.get('RemovedTool')).toBeUndefined();
    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it('records duplicate provider id diagnostics before replacing the provider', () => {
    const toolRegistry = new ToolRegistry();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });

    runtime.registerProvider(createProvider('neko.duplicate', [createTool('FirstTool')]), {
      hostContext: {},
    });
    runtime.registerProvider(createProvider('neko.duplicate', [createTool('SecondTool')]), {
      hostContext: {},
    });

    expect(runtime.getDiagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'extension.capability.provider.duplicate-id',
          reason: 'duplicate-provider-id',
          context: expect.objectContaining({
            providerId: 'neko.duplicate',
            existingProviderId: 'neko.duplicate',
            conflictingProviderId: 'neko.duplicate',
          }),
        }),
      ]),
    );
    expect(toolRegistry.get('FirstTool')).toBeUndefined();
    expect(toolRegistry.get('SecondTool')).toBeDefined();
  });

  it('records duplicate canonical tool diagnostics with both conflicting providers', () => {
    const toolRegistry = new ToolRegistry();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });

    runtime.registerProvider(createProvider('neko.story', [createTool('GenerateScene')]), {
      hostContext: {},
    });
    runtime.registerProvider(createProvider('neko.canvas', [createTool('GenerateScene')]), {
      hostContext: {},
    });

    expect(runtime.getDiagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'extension.capability.tool.name-collision',
          reason: 'provider-name-collision',
          context: expect.objectContaining({
            capabilityKind: 'tool',
            name: 'GenerateScene',
            providerId: 'neko.canvas',
            existingOwner: 'neko.story',
          }),
        }),
      ]),
    );
  });

  it('records conflicting short names across provider namespaces', () => {
    const toolRegistry = new ToolRegistry();
    const runtime = new CapabilityRegistryRuntime({ toolRegistry });

    runtime.registerProvider(createProvider('neko.story', [createTool('story.GenerateScene')]), {
      hostContext: {},
    });
    runtime.registerProvider(createProvider('neko.canvas', [createTool('canvas.GenerateScene')]), {
      hostContext: {},
    });

    expect(runtime.getDiagnostics()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'extension.capability.tool.short-name-collision',
          reason: 'conflicting-short-name',
          context: expect.objectContaining({
            name: 'canvas.GenerateScene',
            shortName: 'generatescene',
            providerId: 'neko.canvas',
            existingOwner: 'neko.story',
            existingToolName: 'story.GenerateScene',
          }),
        }),
      ]),
    );
  });
});
