import { describe, expect, it, vi } from 'vitest';
import { DesktopWorkspaceGrantAuthority } from './desktop-workspace-grant-authority';

describe('DesktopWorkspaceGrantAuthority', () => {
  it('resolves an opaque Window-bound grant through its private host resource', async () => {
    const resolve = vi.fn(async (hostResource: string) => ({
      workspaceId: 'workspace-1',
      workspacePath: hostResource,
      displayName: 'demo',
      locator: { kind: 'variable' as const, value: '${HOME}/demo' },
    }));
    const authority = new DesktopWorkspaceGrantAuthority({
      resolver: { resolve },
      createIdentity: () => 'grant-1',
    });
    const grant = authority.authorize({
      windowId: 'window-1',
      label: 'demo',
      hostResource: '/Users/fixture/demo',
    });

    expect(JSON.stringify(grant)).not.toContain('/Users/fixture');
    await expect(authority.resolve('window-1', grant.workspaceGrantId)).resolves.toMatchObject({
      workspaceGrantId: 'workspace-grant:grant-1',
      windowId: 'window-1',
      workspace: { workspaceId: 'workspace-1' },
    });
    expect(resolve).toHaveBeenCalledWith('/Users/fixture/demo');
    await expect(authority.resolve('window-2', grant.workspaceGrantId)).rejects.toMatchObject({
      code: 'desktop-workspace-grant-window-mismatch',
    });
    await expect(
      authority.resolveAuthorizedWorkspace(grant.workspaceGrantId, 'workspace-1'),
    ).resolves.toMatchObject({
      workspaceGrantId: 'workspace-grant:grant-1',
      windowId: 'window-1',
      workspace: { workspaceId: 'workspace-1' },
    });
    await expect(
      authority.resolveAuthorizedWorkspace(grant.workspaceGrantId, 'workspace-other'),
    ).rejects.toMatchObject({ code: 'desktop-workspace-grant-not-found' });
  });

  it('rejects revoked and released grants without resolving a fallback Workspace', async () => {
    const resolve = vi.fn();
    const authority = new DesktopWorkspaceGrantAuthority({
      resolver: { resolve },
      createIdentity: () => 'grant-1',
    });
    const revoked = authority.authorize({
      windowId: 'window-1',
      label: 'demo',
      hostResource: '/Users/fixture/demo',
    });
    authority.revoke(revoked.workspaceGrantId);
    await expect(authority.resolve('window-1', revoked.workspaceGrantId)).rejects.toMatchObject({
      code: 'desktop-workspace-grant-revoked',
    });
    await expect(
      authority.resolveAuthorizedWorkspace(revoked.workspaceGrantId, 'workspace-1'),
    ).rejects.toMatchObject({ code: 'desktop-workspace-grant-revoked' });
    authority.releaseWindow('window-1');
    await expect(authority.resolve('window-1', revoked.workspaceGrantId)).rejects.toMatchObject({
      code: 'desktop-workspace-grant-not-found',
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('rehydrates a persisted Conversation grant only from its exact Workspace identity', async () => {
    const restore = vi.fn(async (workspaceId: string) => ({
      workspaceId,
      workspacePath: '/Users/fixture/demo',
      displayName: 'demo',
      locator: { kind: 'variable' as const, value: '${HOME}/demo' },
    }));
    const authority = new DesktopWorkspaceGrantAuthority({
      resolver: { resolve: vi.fn(), restore },
    });

    await expect(
      authority.restore('window-2', 'workspace-grant:persisted', 'workspace-1'),
    ).resolves.toMatchObject({
      workspaceGrantId: 'workspace-grant:persisted',
      windowId: 'window-2',
      workspace: { workspaceId: 'workspace-1' },
    });
    expect(restore).toHaveBeenCalledWith('workspace-1');
    await expect(
      authority.restore('window-3', 'workspace-grant:persisted', 'workspace-1'),
    ).rejects.toMatchObject({ code: 'desktop-workspace-grant-window-mismatch' });
  });

  it('preserves the concrete resolver receiver while restoring a Workspace', async () => {
    const resolver = {
      active: true,
      async resolve() {
        throw new Error('Restore path must not resolve a new host resource.');
      },
      async restore(workspaceId: string) {
        if (!this.active) throw new Error('Workspace resolver is inactive.');
        return {
          workspaceId,
          workspacePath: '/Users/fixture/demo',
          displayName: 'demo',
          locator: { kind: 'variable' as const, value: '${HOME}/demo' },
        };
      },
    };
    const authority = new DesktopWorkspaceGrantAuthority({ resolver });

    await expect(
      authority.restore('window-1', 'workspace-grant:restored', 'workspace-1'),
    ).resolves.toMatchObject({ workspace: { workspaceId: 'workspace-1' } });
  });
});
