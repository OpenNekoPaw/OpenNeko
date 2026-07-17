import type { MCPServerPreset } from '../types/config';

export const MCP_CONFIGURATION_UNAVAILABLE_MESSAGE = 'MCP configuration is unavailable.';

export interface BuildMCPStdioServerPresetInput {
  id: string;
  name?: string;
  command: string;
  argsInput?: string;
}

export interface AddMCPStdioServerInput {
  serverName?: string;
  command?: string;
  argsInput?: string;
}

export interface MCPServerConfigWriter {
  setMCPServer(server: MCPServerPreset): Promise<void>;
}

export type AddMCPStdioServerResult =
  | {
      status: 'cancelled';
      reason: 'missingName' | 'missingCommand';
    }
  | {
      status: 'unavailable';
      message: string;
    }
  | {
      status: 'added';
      server: MCPServerPreset;
      message: string;
    }
  | {
      status: 'failed';
      message: string;
    };

export function buildMCPStdioServerPreset(input: BuildMCPStdioServerPresetInput): MCPServerPreset {
  const name = input.name?.trim() || input.id;

  return {
    id: input.id,
    name,
    description: `Custom MCP server: ${name}`,
    category: 'other',
    transport: 'stdio',
    command: input.command,
    args: parseMCPArgsInput(input.argsInput),
    enabled: true,
  };
}

export async function runAddMCPStdioServerRuntime(
  input: AddMCPStdioServerInput,
  config: MCPServerConfigWriter | undefined,
): Promise<AddMCPStdioServerResult> {
  const serverName = input.serverName?.trim();
  if (!serverName) {
    return { status: 'cancelled', reason: 'missingName' };
  }

  const command = input.command?.trim();
  if (!command) {
    return { status: 'cancelled', reason: 'missingCommand' };
  }

  if (!config) {
    return {
      status: 'unavailable',
      message: MCP_CONFIGURATION_UNAVAILABLE_MESSAGE,
    };
  }

  const server = buildMCPStdioServerPreset({
    id: serverName,
    name: serverName,
    command,
    ...(input.argsInput !== undefined ? { argsInput: input.argsInput } : {}),
  });

  try {
    await config.setMCPServer(server);
    return {
      status: 'added',
      server,
      message: buildMCPServerAddedMessage(server.name),
    };
  } catch (error) {
    return {
      status: 'failed',
      message: buildMCPServerAddFailureMessage(error),
    };
  }
}

export function buildMCPServerAddedMessage(serverName: string): string {
  return `MCP Server "${serverName}" added successfully.`;
}

export function buildMCPServerAddFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Failed to add MCP server: ${message}`;
}

export function parseMCPArgsInput(argsInput: string | undefined): string[] {
  if (!argsInput) return [];
  return argsInput
    .split(',')
    .map((arg) => arg.trim())
    .filter((arg) => arg.length > 0);
}
