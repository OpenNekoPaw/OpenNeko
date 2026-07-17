import { describe, expect, it } from 'vitest';
import {
  AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES,
  createAgentHostRouteCoverageDiagnostics,
  type AgentHostRouteSupport,
} from '../agent-host-runtime-adapter';

describe('Agent host runtime adapter contracts', () => {
  it('lists route types exactly once', () => {
    expect(new Set(AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES).size).toBe(
      AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES.length,
    );
    expect(AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES).toContain('sendMessage');
    expect(AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES).toContain('refreshConfigSnapshot');
    expect(AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES).toContain('webviewKeyboardEditable');
    expect(AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES).toContain('projectionEndpointDiscover');
  });

  it('reports missing host route classifications', () => {
    const diagnostics = createAgentHostRouteCoverageDiagnostics({
      hostKind: 'electron',
      routes: {
        sendMessage: 'unsupported',
      },
    });

    expect(diagnostics).toContainEqual({
      code: 'missing-agent-host-route-classification',
      severity: 'error',
      hostKind: 'electron',
      messageType: 'refreshConfigSnapshot',
      message: "Agent host 'electron' has no route classification for 'refreshConfigSnapshot'.",
    });
    expect(diagnostics).not.toContainEqual(expect.objectContaining({ messageType: 'sendMessage' }));
  });

  it('accepts complete route classifications', () => {
    const routes = Object.fromEntries(
      AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES.map((messageType) => [
        messageType,
        'implemented' satisfies AgentHostRouteSupport,
      ]),
    );

    expect(
      createAgentHostRouteCoverageDiagnostics({
        hostKind: 'vscode',
        routes,
      }),
    ).toEqual([]);
  });
});
