import { describe, expect, it, vi } from 'vitest';
import type { AutomationTarget } from '@neko/automation-contracts';
import {
  BROWSER_USE_OBSERVE_PROFILE,
  BROWSER_USE_OBSERVE_TOOL_NAMES,
  browserUseMcpResultProjector,
} from './browser-use';
import { createReviewedMcpAutomationProvider, type AutomationMcpRuntimePort } from './mcp-provider';
import { digestAutomationInputSchema } from './schema-digest';

const target: AutomationTarget = {
  kind: 'browser',
  targetKey: 'browser-target',
  browserProfileId: 'profile-a',
  browserSessionId: 'upstream-session',
  tabId: 'tab-1234',
  origin: 'https://example.test',
  allowedDomains: ['example.test'],
  label: 'Example',
};

describe('reviewed MCP Automation provider', () => {
  it('pins the Browser Use 0.13.7 observe allowlist and canonical schema digests', () => {
    expect(BROWSER_USE_OBSERVE_PROFILE.provider).toMatchObject({
      upstreamRelease: '0.13.7',
      kind: 'browser',
    });
    expect(BROWSER_USE_OBSERVE_TOOL_NAMES).toEqual([
      'browser_get_state',
      'browser_get_html',
      'browser_screenshot',
      'browser_list_tabs',
      'browser_list_sessions',
    ]);
    expect(
      BROWSER_USE_OBSERVE_PROFILE.operations.every(
        (operation) => operation.modes.length === 1 && operation.modes[0] === 'observe',
      ),
    ).toBe(true);
    expect(BROWSER_USE_OBSERVE_TOOL_NAMES).not.toEqual(
      expect.arrayContaining([
        'browser_navigate',
        'browser_go_back',
        'browser_scroll',
        'browser_switch_tab',
        'browser_click',
        'browser_type',
      ]),
    );
    expect(
      digestAutomationInputSchema({
        type: 'object',
        properties: {
          full_page: {
            type: 'boolean',
            description: 'Whether to capture the full scrollable page or just the visible viewport',
            default: false,
          },
        },
      }),
    ).toBe('sha256:3b661d759f56b59d15377c68ec7316d16084eb3ef35182cf2e29ec7f6fb23693');
  });

  it('discovers all upstream tools but executes only the exact reviewed allowlist', async () => {
    const runtime = createRuntime();
    const provider = createProvider(runtime);

    await expect(provider.inspect()).resolves.toMatchObject({
      operations: [
        { name: 'browser_screenshot', annotations: {} },
        { name: 'browser_exec', annotations: { readOnlyHint: false } },
      ],
    });
    await expect(
      provider.execute({
        providerSessionId: 'provider-session',
        operation: 'browser_exec',
        arguments: {},
      }),
    ).rejects.toThrow("operation 'browser_exec' is not reviewed");
    expect(runtime.callTool).not.toHaveBeenCalled();
  });

  it('passes cancellation and projects structured text plus transient PNG bytes', async () => {
    const runtime = createRuntime();
    const provider = createProvider(runtime);
    const opened = await provider.openSession({
      sessionId: 'session-cancel',
      target,
      mode: 'observe',
      timeoutMs: 30_000,
    });
    const controller = new AbortController();
    const result = await provider.execute({
      providerSessionId: opened.providerSessionId,
      operation: 'browser_screenshot',
      arguments: { full_page: false },
      signal: controller.signal,
    });

    expect(runtime.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        providerSessionId: opened.providerSessionId,
        signal: controller.signal,
        name: 'browser_screenshot',
      }),
    );
    expect(result).toMatchObject({
      text: '{"viewport":{"width":800,"height":600}}',
      structuredContent: { source: 'browser-use' },
      observation: { mimeType: 'image/png', width: 2, height: 3 },
    });
    expect(result.observation?.data).toBeInstanceOf(Uint8Array);
  });

  it('rejects an upstream Tool error and malformed image content visibly', () => {
    expect(() =>
      browserUseMcpResultProjector.project({
        operation: 'browser_get_html',
        result: { content: [{ type: 'text', text: 'Error: no active page' }] },
      }),
    ).toThrow('failed');
    expect(() =>
      browserUseMcpResultProjector.project({
        operation: 'browser_screenshot',
        result: {
          content: [
            { type: 'image', mimeType: 'image/png', data: Buffer.from('bad').toString('base64') },
          ],
        },
      }),
    ).toThrow('PNG header is invalid');
  });

  it('routes concurrent Agent sessions through distinct upstream MCP process owners', async () => {
    const runtime = createRuntime();
    const provider = createProvider(runtime);

    const first = await provider.openSession({
      sessionId: 'session-a',
      target,
      mode: 'observe',
      timeoutMs: 30_000,
    });
    const second = await provider.openSession({
      sessionId: 'session-b',
      target,
      mode: 'observe',
      timeoutMs: 30_000,
    });

    await provider.execute({
      providerSessionId: first.providerSessionId,
      operation: 'browser_screenshot',
      arguments: {},
    });
    await provider.execute({
      providerSessionId: second.providerSessionId,
      operation: 'browser_screenshot',
      arguments: {},
    });

    expect(runtime.callTool.mock.calls.map(([input]) => input.providerSessionId)).toEqual([
      'provider:session-a',
      'provider:session-b',
    ]);
  });
});

function createProvider(runtime: AutomationMcpRuntimePort) {
  return createReviewedMcpAutomationProvider({
    identity: BROWSER_USE_OBSERVE_PROFILE.provider,
    allowedOperations: BROWSER_USE_OBSERVE_TOOL_NAMES,
    runtime,
    resultProjector: browserUseMcpResultProjector,
  });
}

function createRuntime(): AutomationMcpRuntimePort & {
  readonly callTool: ReturnType<typeof vi.fn>;
} {
  return {
    inspectTools: vi.fn(async () => [
      {
        name: 'browser_screenshot',
        inputSchema: {
          type: 'object',
          properties: {
            full_page: {
              type: 'boolean',
              description:
                'Whether to capture the full scrollable page or just the visible viewport',
              default: false,
            },
          },
        },
      },
      {
        name: 'browser_exec',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: false },
      },
    ]),
    openSession: vi.fn(async ({ sessionId }) => ({ providerSessionId: `provider:${sessionId}` })),
    revalidateTarget: vi.fn(async () => target),
    callTool: vi.fn(async () => ({
      content: [
        { type: 'text' as const, text: '{"viewport":{"width":800,"height":600}}' },
        { type: 'image' as const, mimeType: 'image/png', data: pngHeader(2, 3).toString('base64') },
      ],
      structuredContent: { source: 'browser-use' },
    })),
    closeSession: vi.fn(async () => undefined),
  };
}

function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(bytes, 0);
  Buffer.from('IHDR').copy(bytes, 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}
