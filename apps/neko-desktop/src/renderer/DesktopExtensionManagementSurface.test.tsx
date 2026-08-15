// @vitest-environment jsdom

import { act, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { AgentExtensionManagementRuntime } from '@neko/agent-contracts/extension-management';
import type { AutomationLocalRuntimeManagementRuntime } from '@neko/automation-contracts/local-runtime-management';
import type { AutomationPermissionManagementRuntime } from '@neko/automation-contracts/permission-management';
import { DesktopExtensionManagementSurface } from './DesktopExtensionManagementSurface';

let capturedLocalRuntime: AutomationLocalRuntimeManagementRuntime | undefined;
let capturedSourceId: string | undefined;
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
      const [selectedItemId, setSelectedItemId] = useState<string>();
      useEffect(() => {
        onDetailVisibilityChange(selectedItemId !== undefined);
        return () => onDetailVisibilityChange(false);
      }, [onDetailVisibilityChange, selectedItemId]);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setTab('skills');
              setSelectedItemId('skill:test');
            }}
          >
            Show skill
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('extensions');
              setSelectedItemId('computer-use');
            }}
          >
            Show computer
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('extensions');
              setSelectedItemId('browser-use');
            }}
          >
            Show browser
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('extensions');
              setSelectedItemId('other@third-party');
            }}
          >
            Show ordinary
          </button>
          {selectedItemId
            ? renderDetail({
                content: null,
                selectedItemId,
                tab,
              })
            : null}
        </>
      );
    },
  };
});

vi.mock('@neko/automation-webview/local-runtime-management/root', () => ({
  AutomationLocalRuntimeManagementRoot: ({
    runtime,
    sourceId,
  }: {
    readonly runtime: AutomationLocalRuntimeManagementRuntime;
    readonly sourceId: string;
  }) => {
    capturedLocalRuntime = runtime;
    capturedSourceId = sourceId;
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
  it('shows only the selected bundled adapter local-runtime controls', async () => {
    Object.defineProperty(window, 'openNekoDesktop', {
      configurable: true,
      value: {
        automationLocalRuntimes: {
          execute: vi.fn(async (request) => ({
            requestId: request.requestId,
            route: request.route,
            projection: { identity: request.identity, runtimes: [] },
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

    expect(capturedPermissionRuntime).toBeUndefined();
    expect(detailTarget.querySelector('[data-workbench-main-panel="extension-detail"]')).toBeNull();
    expect(onDetailVisibilityChange).toHaveBeenLastCalledWith(false);
    const skillButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Show skill',
    );
    await act(async () => skillButton?.click());
    expect(detailTarget.querySelector('[data-workbench-main-panel="extension-detail"]')).not.toBeNull();
    expect(capturedPermissionRuntime).toBeUndefined();
    expect(onDetailVisibilityChange).toHaveBeenLastCalledWith(true);
    const browserButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Show browser',
    );
    await act(async () => browserButton?.click());

    expect(capturedLocalRuntime).toBeDefined();
    expect(capturedSourceId).toBe('browser-use.observe.local');
    expect(capturedPermissionRuntime).toBeUndefined();

    const computerButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Show computer',
    );
    await act(async () => computerButton?.click());
    expect(capturedSourceId).toBe('computer-use.observe.local');
    expect(capturedPermissionRuntime).toBeDefined();
    await expect(capturedPermissionRuntime?.getSnapshot()).resolves.toMatchObject({
      identity: { windowId: 'window-1' },
      permissions: [],
    });

    capturedLocalRuntime = undefined;
    capturedSourceId = undefined;
    capturedPermissionRuntime = undefined;
    const ordinaryButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Show ordinary',
    );
    await act(async () => ordinaryButton?.click());
    expect(capturedLocalRuntime).toBeUndefined();
    expect(capturedPermissionRuntime).toBeUndefined();
    act(() => root.unmount());
  });
});
