import { describe, expect, it } from 'vitest';
import {
  AGENT_HOST_ROUTE_AUTHORITY,
  ELECTRON_AGENT_HOST_ROUTE_COVERAGE,
  ELECTRON_AGENT_HOST_UNSUPPORTED_ROUTE_OWNERS,
  classifyAgentHostRoute,
  createAgentHostRouteCoverageDiagnostics,
  createAgentHostRouteUnavailableDiagnostic,
  createAgentHostWorkspaceScopeRequiredDiagnostic,
  createElectronAgentHostRouteUnavailableDiagnostic,
} from '../agent-host-runtime-adapter';
import { AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES } from '../webview-protocol';

describe('Agent host runtime adapter contracts', () => {
  it('classifies every route by connection and authority scope', () => {
    expect(Object.keys(AGENT_HOST_ROUTE_AUTHORITY).sort()).toEqual(
      [...AGENT_WEBVIEW_TO_HOST_MESSAGE_TYPES].sort(),
    );
    expect(classifyAgentHostRoute('refreshConfigSnapshot')).toEqual({
      connection: 'launch-or-session',
      scope: 'any',
    });
    expect(classifyAgentHostRoute('searchProjectFiles')).toEqual({
      connection: 'launch-or-session',
      scope: 'any',
    });
    expect(classifyAgentHostRoute('requestCanvasAuthoringHandoff')).toEqual({
      connection: 'session',
      scope: 'workspace',
    });
  });

  it('creates a fail-closed Workspace scope diagnostic for Assistant connections', () => {
    expect(createAgentHostWorkspaceScopeRequiredDiagnostic('searchProjectFiles')).toEqual({
      code: 'workspace-scope-required',
      severity: 'error',
      hostKind: 'electron',
      messageType: 'searchProjectFiles',
      requiredScope: 'workspace',
      actualScope: 'assistant',
      message:
        "Agent route 'searchProjectFiles' requires an explicitly authorized Workspace scope.",
    });
  });

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
    expect(
      createAgentHostRouteCoverageDiagnostics({
        hostKind: 'electron',
        routes: ELECTRON_AGENT_HOST_ROUTE_COVERAGE,
      }),
    ).toEqual([]);
  });

  it('freezes the P1.3 Electron route support matrix', () => {
    const supportCounts = Object.values(ELECTRON_AGENT_HOST_ROUTE_COVERAGE).reduce(
      (counts, support) => ({ ...counts, [support]: counts[support] + 1 }),
      {
        implemented: 0,
        unsupported: 0,
        'host-inapplicable': 0,
      },
    );

    expect(supportCounts).toEqual({
      implemented: 39,
      unsupported: 5,
      'host-inapplicable': 3,
    });
    expect(ELECTRON_AGENT_HOST_UNSUPPORTED_ROUTE_OWNERS).toEqual({
      sendToPlugin: 'Phase 3',
      invokeAgentCapabilityLifecycle: 'P1.4',
      requestCanvasAuthoringHandoff: 'P1.4',
      exitCharacterDialogueSession: 'P1.6',
      exitEmbodyCharacterSession: 'P1.6',
    });
  });

  it('builds typed unavailable diagnostics with future ownership', () => {
    expect(
      createAgentHostRouteUnavailableDiagnostic({
        hostKind: 'electron',
        messageType: 'requestCanvasAuthoringHandoff',
        support: 'unsupported',
        owner: ELECTRON_AGENT_HOST_UNSUPPORTED_ROUTE_OWNERS.requestCanvasAuthoringHandoff,
      }),
    ).toEqual({
      code: 'agent-host-route-unsupported',
      severity: 'error',
      hostKind: 'electron',
      messageType: 'requestCanvasAuthoringHandoff',
      support: 'unsupported',
      owner: 'P1.4',
      message:
        "Agent route 'requestCanvasAuthoringHandoff' is unsupported for host 'electron'. It is owned by P1.4.",
    });

    expect(
      createAgentHostRouteUnavailableDiagnostic({
        hostKind: 'electron',
        messageType: 'dnd:start',
        support: 'host-inapplicable',
      }),
    ).toEqual({
      code: 'agent-host-route-inapplicable',
      severity: 'error',
      hostKind: 'electron',
      messageType: 'dnd:start',
      support: 'host-inapplicable',
      message: "Agent route 'dnd:start' is host-inapplicable for host 'electron'.",
    });
  });

  it('applies the Electron unavailable-route emission policy', () => {
    expect(createElectronAgentHostRouteUnavailableDiagnostic('sendMessage')).toBeNull();
    expect(
      createElectronAgentHostRouteUnavailableDiagnostic('requestCanvasAuthoringHandoff'),
    ).toMatchObject({
      code: 'agent-host-route-unsupported',
      messageType: 'requestCanvasAuthoringHandoff',
      owner: 'P1.4',
    });
    expect(createElectronAgentHostRouteUnavailableDiagnostic('dnd:start')).toMatchObject({
      code: 'agent-host-route-inapplicable',
      messageType: 'dnd:start',
      support: 'host-inapplicable',
    });
  });
});
