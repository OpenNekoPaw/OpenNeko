import { describe, expect, it, vi } from 'vitest';
import type {
  DesktopWorkspaceRegistry,
  DesktopWorkspaceResolution,
} from './desktop-workspace-registry';
import { DesktopShellService } from './shell-service';
import {
  DesktopShellStateRepository,
  type DesktopShellStateFilePort,
} from './shell-state-repository';

describe('DesktopShellService', () => {
  it('reuses one Project and focuses one Tab for duplicate opens', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);

    const first = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const second = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      first.endpointEpoch,
      first.window.revision,
    );

    expect(first.catalog.projects).toHaveLength(1);
    expect(second.catalog.projects).toHaveLength(1);
    expect(second.window.tabs).toHaveLength(1);
    expect(second.window.revision).toBe(first.window.revision);
    expect(fixture.registry.resolve).toHaveBeenCalledTimes(2);
  });

  it('shares a Project owner while isolating cross-window Tab and View identity', async () => {
    const fixture = createFixture();
    const firstWindow = await fixture.service.claimWindowId();
    const secondWindow = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(firstWindow, 1);
    fixture.service.setRendererEpoch(secondWindow, 1);
    const firstEvents = vi.fn();
    const secondEvents = vi.fn();
    fixture.service.subscribe(firstWindow, firstEvents);
    fixture.service.subscribe(secondWindow, secondEvents);
    const firstInitial = await fixture.service.getProjection(firstWindow);
    const secondInitial = await fixture.service.getProjection(secondWindow);

    const first = await fixture.service.openContent(
      firstWindow,
      '/workspace/demo',
      firstInitial.endpointEpoch,
      firstInitial.window.revision,
    );
    const second = await fixture.service.openContent(
      secondWindow,
      '/workspace/demo',
      secondInitial.endpointEpoch,
      secondInitial.window.revision,
    );

    expect(first.catalog.projects[0]?.projectId).toBe(second.catalog.projects[0]?.projectId);
    expect(first.window.tabs[0]?.tabId).not.toBe(second.window.tabs[0]?.tabId);
    expect(first.window.tabs[0]?.viewId).not.toBe(second.window.tabs[0]?.viewId);
    expect(firstEvents).toHaveBeenCalled();
    expect(secondEvents).toHaveBeenCalled();
  });

  it('rejects stale Window revisions without changing state', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const tabId = opened.window.tabs[0]!.tabId;
    await fixture.service.closeTab(
      windowId,
      tabId,
      opened.endpointEpoch,
      opened.window.revision,
    );

    await expect(
      fixture.service.activateTab(
        windowId,
        tabId,
        opened.endpointEpoch,
        opened.window.revision,
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-stale-revision' });
    expect((await fixture.service.getProjection(windowId)).window.tabs).toEqual([]);
  });

  it('returns unavailable profiles without persisting Project or Tab state', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const before = await fixture.service.getProjection(windowId);

    const result = await fixture.service.requestUnavailableProfile(
      windowId,
      'request-1',
      'world',
    );
    const after = await fixture.service.getProjection(windowId);

    expect(result.diagnostic.code).toBe('desktop-project-profile-unavailable');
    expect(after).toEqual(before);
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });

  it('restores the primary Window layout and advances endpoint epoch after restart', async () => {
    const file = createMemoryFile();
    const first = createFixture(file);
    const firstWindow = await first.service.claimWindowId();
    first.service.setRendererEpoch(firstWindow, 1);
    const initial = await first.service.getProjection(firstWindow);
    await first.service.openContent(
      firstWindow,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    first.service.releaseWindow(firstWindow);
    await first.service.dispose();

    const second = createFixture(file);
    const restoredWindow = await second.service.claimWindowId();
    second.service.setRendererEpoch(restoredWindow, 1);
    const restored = await second.service.getProjection(restoredWindow);

    expect(restoredWindow).toBe(firstWindow);
    expect(restored.window.tabs).toHaveLength(1);
    expect(restored.endpointEpoch).toContain('app-2');
  });

  it('rejects a mutation from a replaced renderer endpoint before workspace resolution', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const stale = await fixture.service.getProjection(windowId);
    fixture.service.setRendererEpoch(windowId, 2);

    await expect(
      fixture.service.openContent(
        windowId,
        '/workspace/demo',
        stale.endpointEpoch,
        stale.window.revision,
      ),
    ).rejects.toMatchObject({ code: 'desktop-shell-stale-revision' });
    expect(fixture.registry.resolve).not.toHaveBeenCalled();
  });

  it('creates a new View identity when a closed Project is reopened', async () => {
    const fixture = createFixture();
    const windowId = await fixture.service.claimWindowId();
    fixture.service.setRendererEpoch(windowId, 1);
    const initial = await fixture.service.getProjection(windowId);
    const opened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      initial.endpointEpoch,
      initial.window.revision,
    );
    const firstTab = opened.window.tabs[0]!;
    const closed = await fixture.service.closeTab(
      windowId,
      firstTab.tabId,
      opened.endpointEpoch,
      opened.window.revision,
    );
    const reopened = await fixture.service.openContent(
      windowId,
      '/workspace/demo',
      closed.endpointEpoch,
      closed.window.revision,
    );

    expect(reopened.window.tabs[0]?.viewId).not.toBe(firstTab.viewId);
    expect(reopened.window.tabs[0]?.viewEpoch).toBe(1);
  });
});

function createFixture(file = createMemoryFile()) {
  let identity = 0;
  const resolution: DesktopWorkspaceResolution = {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    workspacePath: '/workspace/demo',
    displayName: 'Demo',
    locator: { kind: 'variable', value: '${HOME}/workspace/demo' },
  };
  const registry: DesktopWorkspaceRegistry & {
    readonly resolve: ReturnType<typeof vi.fn>;
  } = {
    resolve: vi.fn(async () => resolution),
    dispose: vi.fn(async () => undefined),
  };
  const applicationInstanceId = file.applicationCount === 0 ? 'app-1' : 'app-2';
  file.applicationCount += 1;
  return {
    registry,
    service: new DesktopShellService({
      applicationInstanceId,
      stateRepository: new DesktopShellStateRepository(file),
      workspaceRegistry: registry,
      createIdentity: () => `identity-${(identity += 1)}`,
      now: () => '2026-07-27T00:00:00.000Z',
    }),
  };
}

interface MemoryFile extends DesktopShellStateFilePort {
  applicationCount: number;
}

function createMemoryFile(): MemoryFile {
  let content: string | null = null;
  return {
    applicationCount: 0,
    readTextIfExists: async () => content,
    writeTextAtomic: async (next) => {
      content = next;
    },
  };
}
