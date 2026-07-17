import { createMCPTools, type MCPManager, type ToolRegistry } from '@neko/agent';
import type { TuiMcpServerSnapshot } from './tui-command-router';

export function createTuiMcpServerSnapshots(
  manager: MCPManager | null | undefined,
  registry: ToolRegistry | null | undefined,
): TuiMcpServerSnapshot[] {
  if (!manager) {
    return [];
  }
  return manager.listServers().map((server) => ({
    id: server.id,
    name: server.name,
    enabled: server.enabled,
    connected: manager.getClient(server.id)?.isConnected() ?? false,
    transport: server.transport,
    toolCount: listRegisteredTuiMcpTools(registry, server.id).length,
  }));
}

export function listRegisteredTuiMcpTools(
  registry: ToolRegistry | null | undefined,
  serverId?: string,
): readonly string[] {
  if (!registry) {
    return [];
  }
  const prefix = serverId ? `mcp__${serverId}__` : 'mcp__';
  return registry
    .list()
    .map((tool) => tool.name)
    .filter((name) => name.startsWith(prefix))
    .sort();
}

export async function connectTuiMcpServer(
  manager: MCPManager,
  registry: ToolRegistry,
  serverId: string,
): Promise<void> {
  await manager.connect(serverId);
  registry.registerMany(await createMCPTools(manager, serverId));
}

export async function disconnectTuiMcpServer(
  manager: MCPManager,
  registry: ToolRegistry,
  serverId: string,
): Promise<void> {
  await manager.disconnect(serverId);
  unregisterTuiMcpTools(registry, serverId);
}

export async function reconnectTuiMcpServer(
  manager: MCPManager,
  registry: ToolRegistry,
  serverId: string,
): Promise<void> {
  await manager.disconnect(serverId);
  unregisterTuiMcpTools(registry, serverId);
  await manager.connect(serverId);
  registry.registerMany(await createMCPTools(manager, serverId));
}

function unregisterTuiMcpTools(registry: ToolRegistry, serverId: string): void {
  for (const name of listRegisteredTuiMcpTools(registry, serverId)) {
    registry.unregister(name);
  }
}
