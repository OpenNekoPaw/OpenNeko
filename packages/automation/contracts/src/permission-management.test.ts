import { describe, expect, it } from 'vitest';
import {
  parseAutomationPermissionManagementHostRequest,
  parseAutomationPermissionManagementHostResult,
  parseAutomationPermissionManagementProjection,
} from './permission-management';

const identity = { windowId: 'window-1' };

describe('Automation permission management contract', () => {
  it('parses the exact sender-owned request and permission projection', () => {
    const request = parseAutomationPermissionManagementHostRequest({
      requestId: 'request-1',
      identity,
      route: 'permission.request',
      permission: 'screen-recording',
    });
    const projection = parseAutomationPermissionManagementProjection({
      identity,
      permissions: [
        {
          permission: 'screen-recording',
          status: 'not-determined',
          requestAction: 'open-system-settings',
          diagnostics: [],
        },
      ],
    });

    expect(
      parseAutomationPermissionManagementHostResult(
        { requestId: 'request-1', route: request.route, projection },
        request,
      ),
    ).toEqual({ requestId: 'request-1', route: 'permission.request', projection });
  });

  it('rejects unsupported permissions and stale result identity', () => {
    expect(() =>
      parseAutomationPermissionManagementHostRequest({
        requestId: 'request-1',
        identity,
        route: 'permission.request',
        permission: 'camera',
      }),
    ).toThrow('Automation permission is invalid');
    const request = parseAutomationPermissionManagementHostRequest({
      requestId: 'request-1',
      identity,
      route: 'snapshot.get',
    });
    expect(() =>
      parseAutomationPermissionManagementHostResult(
        { requestId: 'request-stale', route: request.route, projection: {} },
        request,
      ),
    ).toThrow('result identity is stale');
  });

  it('requires query failure to remain visible and isolates duplicate permissions', () => {
    expect(() =>
      parseAutomationPermissionManagementProjection({
        identity,
        permissions: [
          {
            permission: 'accessibility',
            status: 'error',
            requestAction: 'prompt',
            diagnostics: [],
          },
        ],
      }),
    ).toThrow('diagnostic state is inconsistent');
    expect(() =>
      parseAutomationPermissionManagementProjection({
        identity,
        permissions: [
          {
            permission: 'input-control',
            status: 'unsupported',
            requestAction: 'unsupported',
            diagnostics: [],
          },
          {
            permission: 'input-control',
            status: 'unsupported',
            requestAction: 'unsupported',
            diagnostics: [],
          },
        ],
      }),
    ).toThrow('duplicate permissions');
  });
});
