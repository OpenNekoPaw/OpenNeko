import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({ name: 'openneko-sdk-fixture', version: '3.2.1' });

server.registerTool(
  'mixed_result',
  {
    title: 'Mixed result',
    description: 'Returns ordered multimodal and structured content.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => ({
    content: [
      { type: 'text', text: 'before' },
      { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
      { type: 'text', text: 'after' },
    ],
    structuredContent: { answer: 42 },
  }),
);

server.registerTool('malformed_result', { description: 'Returns an invalid result block.' }, async () => ({
  content: [{ type: 'unsupported', value: true }],
}));

server.registerTool('wait_for_cancel', { description: 'Waits until the request is cancelled.' }, async (extra) => {
  await new Promise((resolve, reject) => {
    extra.signal.addEventListener('abort', () => reject(extra.signal.reason), { once: true });
  });
  return { content: [{ type: 'text', text: 'unexpected completion' }] };
});

await server.connect(new StdioServerTransport());
