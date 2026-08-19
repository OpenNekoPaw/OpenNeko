import { describe, expect, it, vi } from 'vitest';
import type { AutomationMcpRuntimePort } from './mcp-provider';
import {
  CUA_DRIVER_OBSERVE_PROFILE,
  CUA_DRIVER_OBSERVE_TOOL_NAMES,
  cuaDriverArgumentProjector,
  cuaDriverResultProjector,
} from './computer-use';
import { createReviewedMcpAutomationProvider } from './mcp-provider';

describe('Cua Driver Computer Use profile', () => {
  it('pins the exact release and one target-window observe operation', () => {
    expect(CUA_DRIVER_OBSERVE_PROFILE).toMatchObject({
      id: 'computer-use.observe.macos',
      provider: {
        kind: 'computer',
        deliverySource: { kind: 'bundled-adapter' },
      },
      requiredPermissions: { observe: ['screen-recording'] },
    });
    expect(CUA_DRIVER_OBSERVE_TOOL_NAMES).toEqual(['verify_state']);
  });

  it('injects the authorized pid/window/session and rejects model-authored routing fields', async () => {
    const runtime = createRuntime();
    const provider = createReviewedMcpAutomationProvider({
      identity: CUA_DRIVER_OBSERVE_PROFILE.provider,
      allowedOperations: CUA_DRIVER_OBSERVE_TOOL_NAMES,
      runtime,
      argumentProjector: cuaDriverArgumentProjector,
      resultProjector: cuaDriverResultProjector,
    });
    const opened = await provider.openSession({
      sessionId: 'session-1',
      target,
      mode: 'observe',
      timeoutMs: 5_000,
    });

    await provider.execute({
      providerSessionId: opened.providerSessionId,
      operation: 'verify_state',
      arguments: {
        expect: [{ window: { exists: true } }],
        include_screenshot: true,
      },
    });
    expect(runtime.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: {
          expect: [{ window: { exists: true } }],
          include_screenshot: true,
          pid: 42,
          window_id: 701,
          session: 'provider:session-1',
        },
      }),
    );
    await expect(
      provider.execute({
        providerSessionId: opened.providerSessionId,
        operation: 'verify_state',
        arguments: { pid: 99, expect: [{}] },
      }),
    ).rejects.toThrow('unowned fields: pid');
    expect(runtime.callTool).toHaveBeenCalledTimes(1);
  });

  it('rejects non-numeric native window identities before calling upstream', async () => {
    const runtime = createRuntime();
    const provider = createReviewedMcpAutomationProvider({
      identity: CUA_DRIVER_OBSERVE_PROFILE.provider,
      allowedOperations: CUA_DRIVER_OBSERVE_TOOL_NAMES,
      runtime,
      argumentProjector: cuaDriverArgumentProjector,
      resultProjector: cuaDriverResultProjector,
    });
    const opened = await provider.openSession({
      sessionId: 'session-opaque',
      target: { ...target, windowId: 'active-window' },
      mode: 'observe',
      timeoutMs: 5_000,
    });
    await expect(
      provider.execute({
        providerSessionId: opened.providerSessionId,
        operation: 'verify_state',
        arguments: { expect: [{}] },
      }),
    ).rejects.toThrow('positive numeric native window identity');
    expect(runtime.callTool).not.toHaveBeenCalled();
  });
});

const target = {
  kind: 'computer' as const,
  targetKey: 'app:42:701',
  applicationId: 'com.openneko.fixture',
  processId: 42,
  windowId: '701',
  label: 'OpenNeko Fixture',
  region: { x: 10, y: 20, width: 800, height: 600 },
};

function createRuntime(): AutomationMcpRuntimePort & {
  readonly callTool: ReturnType<typeof vi.fn>;
} {
  return {
    inspectTools: vi.fn(async () => []),
    openSession: vi.fn(async ({ sessionId }) => ({ providerSessionId: `provider:${sessionId}` })),
    revalidateTarget: vi.fn(async ({ expected }) => expected),
    callTool: vi.fn(async () => ({
      content: [{ type: 'text' as const, text: '{"status":"satisfied"}' }],
      structuredContent: { status: 'satisfied' },
    })),
    closeSession: vi.fn(async () => undefined),
  };
}
