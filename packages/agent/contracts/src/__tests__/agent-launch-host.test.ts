import { describe, expect, it } from 'vitest';
import { parseAgentLaunchHostRequest, parseAgentLaunchHostResult } from '../agent-launch-host';

describe('Agent launch Host contract', () => {
  it('parses exact attach and authorization requests without Window or path authority', () => {
    const attach = parseAgentLaunchHostRequest({
      requestId: 'attach-1',
      operation: 'attach',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view:window-1',
      draft: {
        phase: 'draft',
        draftId: 'draft-1',
        binding: { kind: 'assistant', assistantSpaceId: 'assistant:1', baseGrantIds: [] },
        bindingReceipt: null,
      },
    });
    expect(attach).toMatchObject({
      operation: 'attach',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'agent-view:window-1',
    });
    expect(JSON.stringify(attach)).not.toContain('windowId');
    expect(() =>
      parseAgentLaunchHostRequest({
        ...attach,
        absolutePath: '/Users/private',
      }),
    ).toThrow('unsupported fields');
  });

  it('fences responses by request identity and parses cancellation explicitly', () => {
    expect(
      parseAgentLaunchHostResult(
        {
          requestId: 'authorize-1',
          status: 'cancelled',
        },
        'authorize-1',
      ),
    ).toEqual({ requestId: 'authorize-1', status: 'cancelled' });
    expect(() =>
      parseAgentLaunchHostResult({ requestId: 'stale', status: 'detached' }, 'current'),
    ).toThrow('request identity mismatch');
  });

  it('parses an owner-qualified unavailable attach result without transport details', () => {
    expect(
      parseAgentLaunchHostResult(
        {
          requestId: 'attach-unavailable-1',
          status: 'unavailable',
          diagnostic: {
            code: 'agent-workspace-binding-unavailable',
            owner: 'workspace',
            message: 'The exact Workspace access for this Agent draft is unavailable.',
          },
        },
        'attach-unavailable-1',
      ),
    ).toEqual({
      requestId: 'attach-unavailable-1',
      status: 'unavailable',
      diagnostic: {
        code: 'agent-workspace-binding-unavailable',
        owner: 'workspace',
        message: 'The exact Workspace access for this Agent draft is unavailable.',
      },
    });
  });

  it('parses an exact target binding without accepting renderer authority fields', () => {
    const request = parseAgentLaunchHostRequest({
      requestId: 'bind-1',
      operation: 'bind-target',
      connection: {
        applicationInstanceId: 'application-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'agent-surface-1',
        viewId: 'view-1',
        draftId: 'draft-1',
        connectionId: 'connection-1',
      },
      binding: {
        kind: 'workspace',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant-1',
      },
    });
    expect(request).toMatchObject({
      operation: 'bind-target',
      binding: { kind: 'workspace', workspaceId: 'workspace-1' },
    });
    expect(() =>
      parseAgentLaunchHostRequest({ ...request, projectPath: '/Users/private/project' }),
    ).toThrow('unsupported fields');
  });

  it('parses an exact owner-qualified Entry target without raw path authority', () => {
    const request = parseAgentLaunchHostRequest({
      requestId: 'entry-target-1',
      operation: 'configure-entry-target',
      connection: {
        applicationInstanceId: 'application-1',
        windowId: 'window-1',
        workbenchInstanceId: 'workbench-1',
        agentSurfaceId: 'agent-surface-1',
        viewId: 'view-1',
        draftId: 'draft-1',
        connectionId: 'connection-1',
      },
      mode: 'authoring',
      binding: {
        kind: 'authoring',
        workspaceId: 'workspace-1',
        workspaceGrantId: 'grant-1',
        authority: { kind: 'project', projectId: 'project-1' },
        target: { kind: 'world-project', worldProjectId: 'world-1' },
      },
    });
    expect(request).toMatchObject({
      operation: 'configure-entry-target',
      mode: 'authoring',
      binding: { target: { kind: 'world-project', worldProjectId: 'world-1' } },
    });
    expect(() =>
      parseAgentLaunchHostRequest({ ...request, workspacePath: '/Users/private/world' }),
    ).toThrow('unsupported fields');
  });

  it('rejects the removed assistant-only binding operation', () => {
    expect(() =>
      parseAgentLaunchHostRequest({
        requestId: 'bind-assistant-1',
        operation: 'bind-assistant',
        connection: {
          applicationInstanceId: 'application-1',
          windowId: 'window-1',
          workbenchInstanceId: 'workbench-1',
          agentSurfaceId: 'agent-surface-1',
          viewId: 'view-1',
          draftId: 'draft-1',
          connectionId: 'connection-1',
        },
      }),
    ).toThrow("Unknown Agent launch Host operation 'bind-assistant'.");
  });

  it('parses exact Workspace mention requests and receipt-fenced results', () => {
    const connection = {
      applicationInstanceId: 'application-1',
      windowId: 'window-1',
      workbenchInstanceId: 'workbench-1',
      agentSurfaceId: 'agent-surface-1',
      viewId: 'view-1',
      draftId: 'draft-1',
      connectionId: 'connection-1',
    };
    expect(
      parseAgentLaunchHostRequest({
        requestId: 'search-1',
        operation: 'search-workspace-mentions',
        connection,
        bindingReceiptId: 'binding-1',
        filter: 'hero',
      }),
    ).toEqual({
      requestId: 'search-1',
      operation: 'search-workspace-mentions',
      connection,
      bindingReceiptId: 'binding-1',
      filter: 'hero',
    });
    expect(
      parseAgentLaunchHostResult(
        {
          requestId: 'search-1',
          status: 'mentions',
          projection: {
            bindingReceiptId: 'binding-1',
            filter: 'hero',
            files: [
              {
                locator: { kind: 'workspace-file', path: 'hero.md' },
                name: 'hero.md',
                type: 'file',
                referenceReceipt: {
                  catalogEntryId: 'mention:hero',
                  referenceId: 'workspace-reference:hero',
                  ownerKind: 'workspace',
                  ownerId: 'workspace-1',
                  bindingReceiptId: 'binding-1',
                },
              },
            ],
            mentionExtras: [],
          },
        },
        'search-1',
      ),
    ).toMatchObject({ status: 'mentions', projection: { bindingReceiptId: 'binding-1' } });
    expect(() =>
      parseAgentLaunchHostRequest({
        requestId: 'search-2',
        operation: 'search-workspace-mentions',
        connection,
        bindingReceiptId: 'binding-1',
        filter: 'hero',
        workspacePath: '/private/project',
      }),
    ).toThrow('unsupported fields');
  });
});
