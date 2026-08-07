import { describe, expect, it, vi } from 'vitest';
import { createAgentLaunchApplicationService } from './agent-launch-service';

describe('Agent launch application service', () => {
  it('owns exact connection identities, scope-qualified catalogs and opaque grants', async () => {
    const releaseConnection = vi.fn(async () => undefined);
    let identity = 0;
    const service = createAgentLaunchApplicationService({
      createIdentity: () => `launch-${++identity}`,
      catalog: {
        readCatalog: vi.fn(async () => ({
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
          skills: [],
        })),
      },
      authorization: {
        authorize: vi.fn(async ({ resourceKind }) => ({
          status: 'authorized' as const,
          resource: {
            kind: 'resource' as const,
            id: `resource:${resourceKind}`,
            label: 'reference.png',
            scopeRequirement: 'assistant' as const,
            resourceGrantId: 'resource-grant-1',
            resourceKind,
          },
        })),
        releaseConnection,
      },
    });
    const attach = {
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view-1',
      scope: { kind: 'assistant' as const, assistantSpaceId: 'assistant:1' },
    };

    const first = await service.attach(attach);
    expect(first.connection.connectionId).toBe('launch-1');
    expect(await service.attach(attach)).toEqual(first);
    const authorized = await service.authorizeResource(first.connection, 'file');
    expect(authorized?.resources).toEqual([
      expect.objectContaining({ resourceGrantId: 'resource-grant-1' }),
    ]);
    expect(JSON.stringify(authorized)).not.toContain('/Users/');

    const replacement = await service.attach({
      ...attach,
      scope: { kind: 'assistant', assistantSpaceId: 'assistant:2' },
    });
    expect(replacement.connection.connectionId).toBe('launch-2');
    expect(releaseConnection).toHaveBeenCalledWith(first.connection);
    expect(() => service.readCatalog(first.connection)).toThrow('Stale Agent launch connection');
    await expect(service.detach(first.connection)).resolves.toBeUndefined();
    await service.dispose();
    expect(releaseConnection).toHaveBeenLastCalledWith(replacement.connection);
  });

  it('preserves the connection and catalog when native authorization is cancelled', async () => {
    const service = createAgentLaunchApplicationService({
      createIdentity: () => 'launch-1',
      catalog: { readCatalog: async () => ({ models: [], commands: [], skills: [] }) },
      authorization: {
        authorize: async () => ({ status: 'cancelled' }),
        releaseConnection: async () => undefined,
      },
    });
    const catalog = await service.attach({
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view-1',
      scope: { kind: 'assistant', assistantSpaceId: 'assistant:1' },
    });

    await expect(
      service.authorizeResource(catalog.connection, 'directory'),
    ).resolves.toBeUndefined();
    expect(service.readCatalog(catalog.connection)).toEqual(catalog);
  });

  it('keeps same-View launch connections isolated by exact Agent Surface', async () => {
    let identity = 0;
    const releaseConnection = vi.fn(async () => undefined);
    const service = createAgentLaunchApplicationService({
      createIdentity: () => `launch-${++identity}`,
      catalog: { readCatalog: async () => ({ models: [], commands: [], skills: [] }) },
      authorization: {
        authorize: async () => ({ status: 'cancelled' }),
        releaseConnection,
      },
    });
    const base = {
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      viewId: 'agent-view-1',
      scope: { kind: 'assistant' as const, assistantSpaceId: 'assistant:1' },
    };

    const first = await service.attach({ ...base, agentSurfaceId: 'agent-surface-1' });
    const second = await service.attach({ ...base, agentSurfaceId: 'agent-surface-2' });

    expect(first.connection.connectionId).toBe('launch-1');
    expect(second.connection.connectionId).toBe('launch-2');
    expect(service.readCatalog(first.connection)).toEqual(first);
    expect(service.readCatalog(second.connection)).toEqual(second);
    expect(releaseConnection).not.toHaveBeenCalled();

    await service.dispose();
  });

  it('keeps a shared StrictMode launch connection until its final attachment detaches', async () => {
    const releaseConnection = vi.fn(async () => undefined);
    let resolveCatalog: ((value: { models: []; commands: []; skills: [] }) => void) | undefined;
    const catalog = new Promise<{ models: []; commands: []; skills: [] }>((resolve) => {
      resolveCatalog = resolve;
    });
    const service = createAgentLaunchApplicationService({
      createIdentity: () => 'launch-strict',
      catalog: { readCatalog: () => catalog },
      authorization: {
        authorize: async () => ({ status: 'cancelled' }),
        releaseConnection,
      },
    });
    const input = {
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view-1',
      scope: { kind: 'assistant' as const, assistantSpaceId: 'assistant:1' },
    };

    const firstAttach = service.attach(input);
    const secondAttach = service.attach(input);
    resolveCatalog?.({ models: [], commands: [], skills: [] });
    const [first, second] = await Promise.all([firstAttach, secondAttach]);
    expect(second.connection).toEqual(first.connection);

    await service.detach(first.connection);
    expect(service.readCatalog(second.connection)).toEqual(second);
    expect(releaseConnection).not.toHaveBeenCalled();
    await service.detach(second.connection);
    expect(releaseConnection).toHaveBeenCalledOnce();
    await expect(service.detach(second.connection)).resolves.toBeUndefined();
  });
});
