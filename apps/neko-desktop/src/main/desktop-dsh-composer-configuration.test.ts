import { describe, expect, it, vi } from 'vitest';
import type {
  AgentModelPurpose,
  AssistantConfigState,
  AssistantSettingsSnapshot,
  ConfigManager,
} from '@neko/host/settings';
import {
  createDefaultCanvasWorkspaceTarget,
  createCanvasWorkspaceContextCatalog,
  createCanvasWorkspaceTarget,
} from '@neko/canvas-domain';

import { createDesktopDshComposerConfiguration } from './desktop-dsh-composer-configuration';

describe('Desktop DSH composer configuration', () => {
  it('projects workspace models and DSH permission presets through their canonical owners', async () => {
    const workspaceConfig = createConfig();
    const applicationConfig = createConfig();
    const setSessionConfigOption = vi.fn(async () => ({ configOptions: [] }));
    const readConversationInputCatalog = vi.fn(async () => ({
      commands: [],
      skills: [],
      skillsComplete: true,
    }));
    const restoreWorkspace = vi.fn(async () => ({
      workspace: {
        workspaceId: 'workspace-1',
        workspacePath: '${WORKSPACE}/one',
        displayName: 'Workspace One',
      },
    }));
    const setPermissionPreset = vi.fn(async (_conversationId: string, permissionPresetId: string) =>
      permissionPresets(permissionPresetId),
    );
    const service = createDesktopDshComposerConfiguration({
      resolveSurface: vi.fn(async () => ({
        windowId: 'window-1',
        binding: {
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        },
        conversationId: 'conversation-1',
      })),
      contexts: {
        readContext: vi.fn(async () => ({
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        })),
      },
      canvas: canvasIndex(),
      workspaceGrants: {
        restore: restoreWorkspace,
      },
      configuration: {
        getApplicationConfig: () => applicationConfig,
        getWorkspaceConfig: vi.fn(() => workspaceConfig),
      },
      sessions: {
        setSessionConfigOption,
        readInputCatalog: readConversationInputCatalog,
      },
      preTurnInputCatalog: emptyInputCatalogReader(),
      lookupCwd: fixedCwdLookup(),
      executionCatalog: createExecutionCatalog(),
      resourceBrowser: unavailableResourceBrowser(),
      assets: unavailableAssets(),
      entities: unavailableEntities(),
      permissions: {
        read: vi.fn(async () => permissionPresets('workspace-write')),
        set: setPermissionPreset,
      },
    });

    await expect(
      service.project({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
      }),
    ).resolves.toMatchObject({
      selectedModelOptionId: 'deepseek-official:deepseek-v4',
      selectedMediaModelOptionIds: { image: 'nekoapi-media:gpt-image-2' },
      permissionPresetId: 'workspace-write',
      permissionPresets: [
        { id: 'read-only', label: 'read-only', selectable: true },
        { id: 'workspace-write', label: 'workspace-write', selectable: true },
        { id: 'danger-full-access', label: 'danger-full-access', selectable: true },
      ],
    });
    expect(restoreWorkspace).toHaveBeenCalledWith('window-1', 'grant-1', 'workspace-1');
    expect(readConversationInputCatalog).toHaveBeenCalledWith('conversation-1');
    await expect(
      service.project({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
      }),
    ).resolves.toMatchObject({
      context: {
        canvas: {
          workspaceId: 'workspace-1',
          options: [
            {
              target: {
                workspaceId: 'workspace-1',
                canvasId: 'neko/boards/workspace.nkc',
              },
            },
            {
              target: {
                workspaceId: 'workspace-1',
                canvasId: 'neko/boards/story.nkc',
              },
            },
          ],
        },
      },
    });

    await service.selectModel({
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
      modelOptionId: 'openai:gpt-5',
    });
    expect(workspaceConfig.setAssistantSettings).toHaveBeenCalledWith({
      selectedProviderId: 'openai',
      selectedModelId: 'gpt-5',
    });
    expect(setSessionConfigOption).not.toHaveBeenCalled();
    expect(applicationConfig.setAssistantSettings).not.toHaveBeenCalled();

    await expect(
      service.selectPermissionPreset({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        permissionPresetId: 'danger-full-access',
      }),
    ).resolves.toMatchObject({ permissionPresetId: 'danger-full-access' });
    expect(setPermissionPreset).not.toHaveBeenCalled();

    await expect(
      service.bindTurnConfiguration('conversation-1', 'window-1', true),
    ).resolves.toEqual({
      supportsImageInput: false,
      configuration: {
        model: '["openai","gpt-5-api",8192]',
        permissionPresetId: 'danger-full-access',
      },
    });
    expect(setSessionConfigOption).not.toHaveBeenCalled();
    expect(setPermissionPreset).not.toHaveBeenCalled();

    await service.bindTurnConfiguration('conversation-1', 'window-1', false);
    expect(setSessionConfigOption).toHaveBeenCalledWith(
      'conversation-1',
      'model',
      '["openai","gpt-5-api",8192]',
    );
    expect(setPermissionPreset).toHaveBeenCalledWith('conversation-1', 'danger-full-access');

    await service.selectMediaModel({
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
      category: 'image',
      modelOptionId: 'nekoapi-media:gpt-image-2',
    });
    expect(workspaceConfig.setDefaultModelPurposeRefs).toHaveBeenCalledWith({
      'image.generate': { providerId: 'nekoapi-media', modelId: 'gpt-image-2' },
    });
    await expect(
      service.selectMediaModel({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        category: 'video',
        modelOptionId: 'nekoapi-media:gpt-image-2',
      }),
    ).rejects.toThrow(/Composer video model/u);
  });

  it('reads the DSH pre-turn catalog for a Draft without requiring a Conversation', async () => {
    const config = createConfig();
    const readPreTurnInputCatalog = vi.fn(async () => ({
      commands: [{ name: 'permission', description: 'Switch permissions.' }],
      skills: [
        {
          name: 'storyboard',
          description: 'Create a storyboard.',
          source: 'bundled',
          provider: 'openneko-builtin',
        },
      ],
      skillsComplete: true,
    }));
    const readConversationInputCatalog = vi.fn(async () => {
      throw new Error('A Draft must not resolve a Conversation-bound catalog.');
    });
    const service = createDesktopDshComposerConfiguration({
      resolveSurface: vi.fn(async () => ({
        windowId: 'window-1',
        binding: { kind: 'assistant' as const, assistantSpaceId: 'assistant-1', baseGrantIds: [] },
      })),
      contexts: { readContext: vi.fn(async () => undefined) },
      canvas: canvasIndex(),
      workspaceGrants: {
        restore: vi.fn(async () => {
          throw new Error('Workspace resolution must not run.');
        }),
      },
      configuration: { getApplicationConfig: () => config, getWorkspaceConfig: () => config },
      sessions: {
        setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
        readInputCatalog: readConversationInputCatalog,
      },
      preTurnInputCatalog: { readInputCatalog: readPreTurnInputCatalog },
      lookupCwd: fixedCwdLookup('/workspace/draft'),
      executionCatalog: createExecutionCatalog(),
      resourceBrowser: unavailableResourceBrowser(),
      assets: unavailableAssets(),
      entities: unavailableEntities(),
      permissions: {
        read: vi.fn(async () => permissionPresets('workspace-write')),
        set: vi.fn(async () => permissionPresets('workspace-write')),
      },
    });

    await expect(
      service.project({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
      }),
    ).resolves.toMatchObject({
      inputCatalog: {
        commands: [{ name: 'permission' }],
        skills: [{ name: 'storyboard' }],
        skillsComplete: true,
      },
    });
    expect(readPreTurnInputCatalog).toHaveBeenCalledTimes(1);
    expect(readPreTurnInputCatalog).toHaveBeenCalledWith({ cwd: '/workspace/draft' });
    expect(readConversationInputCatalog).not.toHaveBeenCalled();

    readPreTurnInputCatalog.mockRejectedValueOnce(new Error('DSH preset composition failed.'));
    await expect(
      service.project({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
      }),
    ).rejects.toThrow('DSH preset composition failed.');
    expect(readConversationInputCatalog).not.toHaveBeenCalled();
  });

  it('uses the exact Workspace cwd for a Workspace Draft Skill catalog', async () => {
    const config = createConfig();
    const binding = {
      kind: 'workspace' as const,
      workspaceId: 'workspace-1',
      workspaceGrantId: 'grant-1',
    };
    const readPreTurnInputCatalog = vi.fn(async () => ({
      commands: [],
      skills: [
        {
          name: 'project-storyboard',
          description: 'Create the project storyboard.',
          source: 'project-agents',
          provider: 'local',
        },
      ],
      skillsComplete: true,
    }));
    const resolveCwd = vi.fn(async () => '/workspace/one');
    const service = createDesktopDshComposerConfiguration({
      resolveSurface: vi.fn(async () => ({ windowId: 'window-1', binding })),
      contexts: { readContext: vi.fn(async () => undefined) },
      canvas: canvasIndex(),
      workspaceGrants: {
        restore: vi.fn(async () => ({
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath: '/workspace/one',
            displayName: 'Workspace One',
          },
        })),
      },
      configuration: { getApplicationConfig: () => config, getWorkspaceConfig: () => config },
      sessions: {
        setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
        readInputCatalog: vi.fn(async () => {
          throw new Error('A Workspace Draft must not use a bound Conversation catalog.');
        }),
      },
      preTurnInputCatalog: { readInputCatalog: readPreTurnInputCatalog },
      lookupCwd: { resolve: resolveCwd },
      executionCatalog: createExecutionCatalog(),
      resourceBrowser: unavailableResourceBrowser(),
      assets: unavailableAssets(),
      entities: unavailableEntities(),
      permissions: {
        read: vi.fn(async () => permissionPresets('workspace-write')),
        set: vi.fn(async () => permissionPresets('workspace-write')),
      },
    });

    await expect(
      service.project({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
      }),
    ).resolves.toMatchObject({
      context: { kind: 'workspace', workspaceId: 'workspace-1' },
      inputCatalog: { skills: [{ name: 'project-storyboard', source: 'project-agents' }] },
    });
    expect(resolveCwd).toHaveBeenCalledWith(binding);
    expect(readPreTurnInputCatalog).toHaveBeenCalledWith({ cwd: '/workspace/one' });
  });

  it('does not block an executable model on a recoverable config diagnostic', async () => {
    const config = createConfig();
    config.getAssistantConfigState.mockReturnValue({
      ...createState(),
      configDiagnostic: {
        code: 'invalidConfigField',
        filePath: '/tmp/.neko/config.toml',
        path: 'mcp_servers',
        message: 'Retired MCP field.',
      },
    });
    const service = createDesktopDshComposerConfiguration({
      resolveSurface: vi.fn(async () => ({
        windowId: 'window-1',
        binding: { kind: 'assistant' as const, assistantSpaceId: 'assistant-1', baseGrantIds: [] },
      })),
      contexts: { readContext: vi.fn(async () => undefined) },
      canvas: canvasIndex(),
      workspaceGrants: {
        restore: vi.fn(async () => {
          throw new Error('Workspace resolution must not run.');
        }),
      },
      configuration: {
        getApplicationConfig: () => config,
        getWorkspaceConfig: () => config,
      },
      sessions: {
        setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
        readInputCatalog: vi.fn(async () => ({ commands: [], skills: [], skillsComplete: true })),
      },
      preTurnInputCatalog: emptyInputCatalogReader(),
      lookupCwd: fixedCwdLookup(),
      executionCatalog: createExecutionCatalog(),
      resourceBrowser: unavailableResourceBrowser(),
      assets: unavailableAssets(),
      entities: unavailableEntities(),
      permissions: {
        read: vi.fn(async () => permissionPresets('workspace-write')),
        set: vi.fn(async () => permissionPresets('workspace-write')),
      },
    });

    const projection = await service.project({
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
    });
    expect(projection).toMatchObject({
      selectedModelOptionId: 'deepseek-official:deepseek-v4',
    });
    expect(projection).not.toHaveProperty('diagnostic');
  });

  it('rejects unadvertised presets and a missing authoritative Conversation context visibly', async () => {
    const config = createConfig();
    const service = createDesktopDshComposerConfiguration({
      resolveSurface: vi.fn(async () => ({
        windowId: 'window-1',
        binding: { kind: 'assistant' as const, assistantSpaceId: 'assistant-1', baseGrantIds: [] },
      })),
      contexts: { readContext: vi.fn(async () => undefined) },
      canvas: canvasIndex(),
      workspaceGrants: {
        restore: vi.fn(async () => {
          throw new Error('Workspace resolution must not run.');
        }),
      },
      configuration: {
        getApplicationConfig: () => config,
        getWorkspaceConfig: () => config,
      },
      sessions: {
        setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
        readInputCatalog: vi.fn(async () => ({ commands: [], skills: [], skillsComplete: true })),
      },
      preTurnInputCatalog: emptyInputCatalogReader(),
      lookupCwd: fixedCwdLookup(),
      executionCatalog: createExecutionCatalog(),
      resourceBrowser: unavailableResourceBrowser(),
      assets: unavailableAssets(),
      entities: unavailableEntities(),
      permissions: {
        read: vi.fn(async () => permissionPresets('workspace-write')),
        set: vi.fn(async () => permissionPresets('workspace-write')),
      },
    });

    await expect(
      service.selectPermissionPreset({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        permissionPresetId: 'auto',
      }),
    ).rejects.toThrow(/not advertised by the runtime/u);
    await expect(service.applyConversation('conversation-missing', 'window-1')).rejects.toThrow(
      /no authoritative domain context/u,
    );
    await expect(
      service.materializeAsset({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        assetId: 'asset-forged',
      }),
    ).rejects.toThrow(/Workspace-bound Agent Surface/u);
  });

  it('projects exact Workspace file, media, and Asset mentions through read-only Resource queries', async () => {
    const config = createConfig();
    const mentionIdentity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'view-1',
      viewInstanceId: 'view-instance-1',
      rendererSessionId: 'renderer-1',
    };
    const query = vi.fn(async (_windowId: string, request: unknown) => {
      const source = (request as { readonly source: 'files' | 'media' | 'assets' }).source;
      if (source === 'assets') {
        return {
          identity: mentionIdentity,
          source,
          query: 'scene',
          items: [
            {
              resourceId: 'scene-lighting',
              source,
              kind: 'asset' as const,
              label: 'Scene lighting',
              description: 'Lighting reference',
              capabilities: [],
              role: 'asset' as const,
              depth: 0,
              assetRef: { assetId: 'global-asset-library:scene-lighting' },
              availability: 'available' as const,
            },
          ],
        };
      }
      return {
        identity: mentionIdentity,
        source,
        query: 'scene',
        items: [
          {
            resourceId: source === 'files' ? 'scene-file' : 'scene-image',
            source,
            kind: source === 'files' ? ('file' as const) : ('image' as const),
            label: source === 'files' ? 'scene.md' : 'scene.png',
            capabilities: [],
            role: 'content' as const,
            depth: 0,
            locator:
              source === 'files'
                ? { file: { authority: 'workspace' as const, path: 'notes/scene.md' } }
                : { file: { authority: 'workspace' as const, path: 'media/scene.png' } },
          },
        ],
      };
    });
    const character = {
      entityId: 'entity-hero',
      kind: 'character' as const,
      names: { canonical: 'Hero', display: 'Scene hero', aliases: ['lead'] },
      representations: [],
      lifecycle: { state: 'active' as const },
      createdAt: '2026-08-19T00:00:00.000Z',
      updatedAt: '2026-08-19T00:00:00.000Z',
    };
    const materialize = vi.fn(async () => ({
      status: 'materialized' as const,
      assetId: 'global-asset-library:scene-lighting',
      label: 'Scene lighting.png',
      contentLocator: {
        file: { authority: 'workspace' as const, path: 'assets/Scene lighting.png' },
      },
    }));
    const service = createDesktopDshComposerConfiguration({
      resolveSurface: vi.fn(async () => ({
        windowId: 'window-1',
        binding: {
          kind: 'workspace' as const,
          workspaceId: 'workspace-1',
          workspaceGrantId: 'grant-1',
        },
        mentionIdentity,
      })),
      contexts: { readContext: vi.fn(async () => undefined) },
      canvas: canvasIndex(),
      workspaceGrants: {
        restore: vi.fn(async () => ({
          workspace: {
            workspaceId: 'workspace-1',
            workspacePath: '${WORKSPACE}/one',
            displayName: 'Workspace One',
          },
        })),
      },
      configuration: { getApplicationConfig: () => config, getWorkspaceConfig: () => config },
      sessions: {
        setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
        readInputCatalog: vi.fn(async () => ({ commands: [], skills: [], skillsComplete: true })),
      },
      preTurnInputCatalog: emptyInputCatalogReader(),
      lookupCwd: fixedCwdLookup(),
      executionCatalog: createExecutionCatalog(),
      resourceBrowser: { query },
      assets: { materialize },
      entities: { search: vi.fn(async () => [character]) },
      permissions: {
        read: vi.fn(async () => permissionPresets('workspace-write')),
        set: vi.fn(async () => permissionPresets('workspace-write')),
      },
    });

    await expect(
      service.searchMentions({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        filter: ' scene ',
      }),
    ).resolves.toEqual([
      {
        id: 'files:scene-file',
        kind: 'file',
        label: 'scene.md',
        contentLocator: { file: { authority: 'workspace', path: 'notes/scene.md' } },
        source: 'workspace',
        mediaType: 'text',
      },
      {
        id: 'media:scene-image',
        kind: 'media',
        label: 'scene.png',
        contentLocator: { file: { authority: 'workspace', path: 'media/scene.png' } },
        source: 'media-library',
        mediaType: 'image',
      },
      {
        id: 'assets:scene-lighting',
        kind: 'asset',
        label: 'Scene lighting',
        description: 'Lighting reference',
        assetId: 'global-asset-library:scene-lighting',
        source: 'asset-library',
      },
      {
        id: 'entity:entity-hero',
        kind: 'character',
        label: 'Scene hero',
        description: 'character',
        contextPayload: {
          type: 'character',
          id: 'entity-hero',
          label: 'Scene hero',
          summary: 'character: Scene hero',
          data: {
            kind: 'resolved-entity-context',
            entityRef: { entityId: 'entity-hero', entityKind: 'character' },
            entity: character,
          },
        },
        source: 'entity-graph',
      },
    ]);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenNthCalledWith(
      1,
      'window-1',
      expect.objectContaining({ identity: mentionIdentity, source: 'files', query: 'scene' }),
    );
    expect(materialize).not.toHaveBeenCalled();
    await expect(
      service.materializeAsset({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        assetId: 'global-asset-library:scene-lighting',
      }),
    ).resolves.toEqual({
      assetId: 'global-asset-library:scene-lighting',
      label: 'Scene lighting.png',
      contentLocator: {
        file: { authority: 'workspace', path: 'assets/Scene lighting.png' },
      },
      source: 'asset-library',
    });
    expect(materialize).toHaveBeenCalledWith({
      assetId: 'global-asset-library:scene-lighting',
      workspaceRoot: '${WORKSPACE}/one',
    });
    expect(query).toHaveBeenNthCalledWith(
      2,
      'window-1',
      expect.objectContaining({ identity: mentionIdentity, source: 'media', query: 'scene' }),
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      'window-1',
      expect.objectContaining({ identity: mentionIdentity, source: 'assets', query: 'scene' }),
    );
  });

  it('hides non-executable LLMs without removing media models and rejects their selection', async () => {
    const config = createConfig();
    const executionCatalog = createExecutionCatalog({ includeDeepSeek: false });
    const service = createDesktopDshComposerConfiguration({
      resolveSurface: vi.fn(async () => ({
        windowId: 'window-1',
        binding: { kind: 'assistant' as const, assistantSpaceId: 'assistant-1', baseGrantIds: [] },
      })),
      contexts: { readContext: vi.fn(async () => undefined) },
      canvas: canvasIndex(),
      workspaceGrants: {
        restore: vi.fn(async () => {
          throw new Error('Workspace resolution must not run.');
        }),
      },
      configuration: {
        getApplicationConfig: () => config,
        getWorkspaceConfig: () => config,
      },
      sessions: {
        setSessionConfigOption: vi.fn(async () => ({ configOptions: [] })),
        readInputCatalog: vi.fn(async () => ({ commands: [], skills: [], skillsComplete: true })),
      },
      preTurnInputCatalog: emptyInputCatalogReader(),
      lookupCwd: fixedCwdLookup(),
      executionCatalog,
      resourceBrowser: unavailableResourceBrowser(),
      assets: unavailableAssets(),
      entities: unavailableEntities(),
      permissions: {
        read: vi.fn(async () => permissionPresets('workspace-write')),
        set: vi.fn(async () => permissionPresets('workspace-write')),
      },
    });

    const projected = await service.project({
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'surface-1',
    });
    expect(projected.models.map((model) => model.id)).toEqual([
      'openai:gpt-5',
      'nekoapi-media:gpt-image-2',
    ]);
    expect(projected.selectedModelOptionId).toBeUndefined();
    expect(projected.diagnostic).toBe('The selected chat model is not executable by DSH.');

    await expect(
      service.selectModel({
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'surface-1',
        modelOptionId: 'deepseek-official:deepseek-v4',
      }),
    ).rejects.toThrow(/not executable by the current DSH runtime/u);
    expect(config.setAssistantSettings).not.toHaveBeenCalled();
  });

  it('retains the exact open-Session model binding until the DSH runtime is reset', async () => {
    const config = createConfig();
    const setSessionConfigOption = vi.fn(async () => ({ configOptions: [] }));
    const service = createDesktopDshComposerConfiguration({
      resolveSurface: vi.fn(async () => ({
        windowId: 'window-1',
        binding: { kind: 'assistant' as const, assistantSpaceId: 'assistant-1', baseGrantIds: [] },
        conversationId: 'conversation-1',
      })),
      contexts: {
        readContext: vi.fn(async () => ({
          kind: 'assistant' as const,
          assistantSpaceId: 'assistant-1',
          baseGrantIds: [],
        })),
      },
      canvas: canvasIndex(),
      workspaceGrants: {
        restore: vi.fn(async () => {
          throw new Error('Workspace resolution must not run.');
        }),
      },
      configuration: { getApplicationConfig: () => config, getWorkspaceConfig: () => config },
      sessions: {
        setSessionConfigOption,
        readInputCatalog: vi.fn(async () => ({ commands: [], skills: [], skillsComplete: true })),
      },
      preTurnInputCatalog: emptyInputCatalogReader(),
      lookupCwd: fixedCwdLookup(),
      executionCatalog: createExecutionCatalog(),
      resourceBrowser: unavailableResourceBrowser(),
      assets: unavailableAssets(),
      entities: unavailableEntities(),
      permissions: {
        read: vi.fn(async () => permissionPresets('workspace-write')),
        set: vi.fn(async () => permissionPresets('workspace-write')),
      },
    });

    await expect(service.applyConversation('conversation-1', 'window-1')).resolves.toEqual({
      supportsImageInput: false,
    });
    expect(setSessionConfigOption).toHaveBeenCalledOnce();

    config.getEffectiveAgentWorkspaceConfigSnapshot.mockReturnValue({
      blockingDiagnostic: { message: 'Selected model was removed.' },
    });
    await expect(service.applyConversation('conversation-1', 'window-1')).resolves.toEqual({
      supportsImageInput: false,
    });
    expect(setSessionConfigOption).toHaveBeenCalledOnce();

    service.resetSessionExecutions();
    await expect(service.applyConversation('conversation-1', 'window-1')).rejects.toThrow(
      'Selected model was removed.',
    );
  });
});

function createExecutionCatalog(options: { readonly includeDeepSeek?: boolean } = {}) {
  const models = new Map<string, Map<string, string>>([
    ['openai', new Map([['gpt-5', 'gpt-5-api']])],
  ]);
  if (options.includeDeepSeek !== false) {
    models.set('deepseek-official', new Map([['deepseek-v4', 'deepseek-v4-api']]));
  }
  return {
    resolve(providerId: string, productModelId: string) {
      const apiModelName = models.get(providerId)?.get(productModelId);
      return apiModelName === undefined
        ? undefined
        : { providerId, productModelId, apiModelName, input: ['text'] as const };
    },
  };
}

function emptyInputCatalogReader() {
  return {
    readInputCatalog: vi.fn(async () => ({ commands: [], skills: [], skillsComplete: true })),
  };
}

function fixedCwdLookup(cwd = '/virtual/workspace') {
  return { resolve: vi.fn(async () => cwd) };
}

function canvasIndex() {
  return {
    readCatalog: vi.fn(async (workspaceId: string) =>
      createCanvasWorkspaceContextCatalog({
        workspaceId,
        options: [
          {
            target: createDefaultCanvasWorkspaceTarget(workspaceId),
            label: 'workspace.nkc',
          },
          {
            target: createCanvasWorkspaceTarget(workspaceId, 'neko/boards/story.nkc'),
            label: 'story.nkc',
            index: {
              canvasId: 'neko/boards/story.nkc',
              name: 'story.nkc',
              scopeKind: 'generic',
              relatedBoardCount: 0,
            },
            summary: {
              canvasId: 'neko/boards/story.nkc',
              name: 'story.nkc',
              nodeTypeSummary: { text: 1 },
            },
          },
        ],
      }),
    ),
  };
}

function unavailableResourceBrowser() {
  return {
    query: vi.fn(async () => {
      throw new Error('Resource Browser search is not expected in this test.');
    }),
  };
}

function unavailableAssets() {
  return {
    materialize: vi.fn(async () => {
      throw new Error('Asset materialization is not expected in this test.');
    }),
  };
}

function unavailableEntities() {
  return {
    search: vi.fn(async () => {
      throw new Error('Project Entity search is not expected in this test.');
    }),
  };
}

function permissionPresets(currentValue: string) {
  return {
    currentValue,
    options: [
      { value: 'read-only', name: 'read-only' },
      { value: 'workspace-write', name: 'workspace-write' },
      { value: 'danger-full-access', name: 'danger-full-access' },
    ],
  };
}

function createConfig() {
  let state = createState();
  return {
    getAssistantConfigState: vi.fn(() => state),
    getEffectiveAgentWorkspaceConfigSnapshot: vi.fn(() => ({})),
    setAssistantSettings: vi.fn(async (updates: Partial<AssistantSettingsSnapshot>) => {
      state = { ...state, ...updates };
    }),
    setDefaultModelPurposeRefs: vi.fn(
      async (updates: Parameters<ConfigManager['setDefaultModelPurposeRefs']>[0]) => {
        const defaultMediaModels = { ...state.defaultMediaModels };
        for (const [purpose, ref] of Object.entries(updates) as [
          AgentModelPurpose,
          NonNullable<(typeof updates)[AgentModelPurpose]> | undefined,
        ][]) {
          if (!ref) continue;
          const category = purpose.replace('.generate', '');
          if (category !== 'image' && category !== 'video' && category !== 'audio') {
            throw new Error(`Unexpected media purpose '${purpose}'.`);
          }
          defaultMediaModels[category] = `${ref.providerId}:${ref.modelId}`;
        }
        state = { ...state, defaultMediaModels };
      },
    ),
  };
}

function createState(): AssistantConfigState {
  return {
    providers: [],
    configuredProviders: [],
    selectedProviderId: 'deepseek-official',
    selectedModelId: 'deepseek-v4',
    customSystemPrompt: '',
    autoExecuteTools: false,
    streamResponses: true,
    showToolCalls: true,
    temperature: 0.7,
    maxTokens: 8192,
    executionMode: 'ask',
    chatModelOptions: [
      {
        id: 'deepseek-official:deepseek-v4',
        label: 'DeepSeek V4',
        providerId: 'deepseek-official',
        modelId: 'deepseek-v4',
        providerLabel: 'DeepSeek',
        category: 'llm',
        capabilities: ['chat'],
      },
      {
        id: 'openai:gpt-5',
        label: 'GPT-5',
        providerId: 'openai',
        modelId: 'gpt-5',
        providerLabel: 'OpenAI',
        category: 'llm',
        capabilities: ['chat'],
      },
      {
        id: 'nekoapi-media:gpt-image-2',
        label: 'GPT Image 2',
        providerId: 'nekoapi-media',
        modelId: 'gpt-image-2',
        providerLabel: 'NekoAPI Media',
        category: 'image',
        capabilities: ['image.generate'],
      },
    ],
    modelGroups: [],
    defaultMediaModels: { image: 'nekoapi-media:gpt-image-2' },
  };
}
