import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMCPClient } from '../mcp-client';

const fixturePath = fileURLToPath(new URL('./fixtures/sdk-mcp-server.mjs', import.meta.url));

function createClient() {
  return createMCPClient({
    id: 'sdk-fixture',
    name: 'SDK fixture',
    description: 'Official SDK integration fixture',
    category: 'development',
    transport: 'stdio',
    command: process.execPath,
    args: [fixturePath],
    inheritProcessEnv: false,
    enabled: true,
    requestTimeout: 2_000,
  });
}

describe('official SDK MCP client', () => {
  it('negotiates protocol facts and preserves annotations and ordered mixed results', async () => {
    const client = createClient();
    try {
      await client.connect();

      expect(client.getConnectionInfo()).toMatchObject({
        protocolVersion: expect.any(String),
        server: { name: 'openneko-sdk-fixture', version: '3.2.1' },
      });
      const tools = await client.listTools();
      expect(tools.find((tool) => tool.name === 'mixed_result')).toMatchObject({
        title: 'Mixed result',
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      });

      await expect(client.callTool('mixed_result', {})).resolves.toEqual({
        content: [
          { type: 'text', text: 'before' },
          { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
          { type: 'text', text: 'after' },
        ],
        structuredContent: { answer: 42 },
      });
    } finally {
      await client.disconnect();
    }
  });

  it('isolates one malformed Tool result while a sibling Tool remains available', async () => {
    const client = createClient();
    try {
      await client.connect();

      await expect(client.callTool('malformed_result', {})).rejects.toThrow();
      await expect(client.callTool('mixed_result', {})).resolves.toMatchObject({
        structuredContent: { answer: 42 },
      });
    } finally {
      await client.disconnect();
    }
  });

  it('cancels an in-flight SDK Tool request through AbortSignal', async () => {
    const client = createClient();
    try {
      await client.connect();
      const controller = new AbortController();
      const pending = client.callTool('wait_for_cancel', {}, { signal: controller.signal });
      controller.abort(new Error('test cancellation'));

      await expect(pending).rejects.toThrow();
    } finally {
      await client.disconnect();
    }
  });

  it('passes cancellation through SDK connection and Tool discovery', async () => {
    const connectClient = createClient();
    const connectController = new AbortController();
    connectController.abort(new Error('cancel connection'));
    await expect(connectClient.connect({ signal: connectController.signal })).rejects.toThrow();

    const listClient = createClient();
    try {
      await listClient.connect();
      const listController = new AbortController();
      listController.abort(new Error('cancel Tool discovery'));
      await expect(listClient.listTools({ signal: listController.signal })).rejects.toThrow();
    } finally {
      await listClient.disconnect();
    }
  });
});
