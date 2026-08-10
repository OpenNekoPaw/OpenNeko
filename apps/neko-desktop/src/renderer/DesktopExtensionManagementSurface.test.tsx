// @vitest-environment jsdom

import { act, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { AgentExtensionManagementRuntime } from '@neko/agent-contracts/extension-management';
import type { AutomationEndpointManagementRuntime } from '@neko/automation-contracts/endpoint-management';
import type { AutomationPermissionManagementRuntime } from '@neko/automation-contracts/permission-management';
import { DesktopExtensionManagementSurface } from './DesktopExtensionManagementSurface';

let capturedEndpointRuntime: AutomationEndpointManagementRuntime | undefined;
let capturedPermissionRuntime: AutomationPermissionManagementRuntime | undefined;

vi.mock('@neko/agent-webview/extension-management/root', async () => {
  const { useEffect, useState } = await import('react');
  return {
    AgentExtensionManagementRoot: ({
      onDetailVisibilityChange,
      renderDetail,
    }: {
      readonly onDetailVisibilityChange: (visible: boolean) => void;
      readonly renderDetail: (input: {
        readonly content: null;
        readonly selectedItemId: string;
        readonly tab: 'skills' | 'extensions';
      }) => ReactNode;
    }) => {
      const [tab, setTab] = useState<'skills' | 'extensions'>('skills');
      const [selected, setSelected] = useState(false);
      useEffect(() => {
        onDetailVisibilityChange(selected);
        return () => onDetailVisibilityChange(false);
      }, [onDetailVisibilityChange, selected]);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setTab('skills');
              setSelected(true);
            }}
          >
            Show skill
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('extensions');
              setSelected(true);
            }}
          >
            Show extensions
          </button>
          {selected
            ? renderDetail({
                content: null,
                selectedItemId: tab === 'skills' ? 'skill:test' : 'computer-use@openneko',
                tab,
              })
            : null}
        </>
      );
    },
  };
});

vi.mock('@neko/automation-webview/endpoint-management/root', () => ({
  AutomationEndpointManagementRoot: ({
    runtime,
  }: {
    readonly runtime: AutomationEndpointManagementRuntime;
  }) => {
    capturedEndpointRuntime = runtime;
    return null;
  },
}));

vi.mock('@neko/automation-webview/permission-management/root', () => ({
  AutomationPermissionManagementRoot: ({
    runtime,
  }: {
    readonly runtime: AutomationPermissionManagementRuntime;
  }) => {
    capturedPermissionRuntime = runtime;
    return null;
  },
}));

describe('DesktopExtensionManagementSurface', () => {
  it('keeps the endpoint runtime usable through React StrictMode lifecycle replay', async () => {
    Object.defineProperty(window, 'openNekoDesktop', {
      configurable: true,
      value: {
        automationEndpoints: {
          execute: vi.fn(async (request) => ({
            requestId: request.requestId,
            route: request.route,
            projection: { identity: request.identity, endpoints: [] },
          })),
        },
        automationPermissions: {
          execute: vi.fn(async (request) => ({
            requestId: request.requestId,
            route: request.route,
            projection: { identity: request.identity, permissions: [] },
          })),
        },
      },
    });
    const runtime = { identity: { windowId: 'window-1' } } as AgentExtensionManagementRuntime;
    const onDetailVisibilityChange = vi.fn();

    const container = document.createElement('div');
    const detailTarget = document.createElement('div');
    container.append(detailTarget);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <StrictMode>
          <DesktopExtensionManagementSurface
            detailLabel="Configuration"
            detailTarget={detailTarget}
            interactive
            onDetailVisibilityChange={onDetailVisibilityChange}
            runtime={runtime}
          />
        </StrictMode>,
      );
    });

    expect(capturedEndpointRuntime).toBeUndefined();
    expect(capturedPermissionRuntime).toBeUndefined();
    expect(detailTarget.querySelector('[data-workbench-main-panel="extension-detail"]')).toBeNull();
    expect(onDetailVisibilityChange).toHaveBeenLastCalledWith(false);
    const skillButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Show skill',
    );
    await act(async () => skillButton?.click());
    expect(detailTarget.querySelector('[data-workbench-main-panel="extension-detail"]')).not.toBeNull();
    expect(capturedEndpointRuntime).toBeUndefined();
    expect(capturedPermissionRuntime).toBeUndefined();
    expect(onDetailVisibilityChange).toHaveBeenLastCalledWith(true);
    const extensionButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Show extensions',
    );
    await act(async () => extensionButton?.click());

    expect(capturedEndpointRuntime).toBeDefined();
    await expect(capturedEndpointRuntime?.getSnapshot()).resolves.toMatchObject({
      identity: { windowId: 'window-1' },
      endpoints: [],
    });
    expect(capturedPermissionRuntime).toBeDefined();
    await expect(capturedPermissionRuntime?.getSnapshot()).resolves.toMatchObject({
      identity: { windowId: 'window-1' },
      permissions: [],
    });
    act(() => root.unmount());
  });
});
