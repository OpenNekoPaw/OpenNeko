import { randomUUID } from 'node:crypto';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import {
  parseDesktopWorkspaceGrantProjection,
  type DesktopWorkspaceGrantProjection,
} from './desktop-workspace-grant-contract';

export interface DesktopWorkspaceGrantResolutionPort {
  resolve(hostResource: string): Promise<AssetWorkspaceResolution>;
  restore?(workspaceId: string): Promise<AssetWorkspaceResolution>;
}

export interface DesktopWorkspaceGrantResolution {
  readonly workspaceGrantId: string;
  readonly windowId: string;
  readonly workspace: AssetWorkspaceResolution;
}

export interface DesktopWorkspaceGrantAuthorityPort {
  resolve(windowId: string, workspaceGrantId: string): Promise<DesktopWorkspaceGrantResolution>;
  restore(
    windowId: string,
    workspaceGrantId: string,
    workspaceId: string,
  ): Promise<DesktopWorkspaceGrantResolution>;
  releaseWindow(windowId: string): void;
  dispose(): void;
}

export class DesktopWorkspaceGrantAuthorityError extends Error {
  readonly code:
    | 'desktop-workspace-grant-not-found'
    | 'desktop-workspace-grant-window-mismatch'
    | 'desktop-workspace-grant-revoked';

  constructor(code: DesktopWorkspaceGrantAuthorityError['code'], message: string) {
    super(message);
    this.name = 'DesktopWorkspaceGrantAuthorityError';
    this.code = code;
  }
}

interface StoredDesktopWorkspaceGrant {
  readonly projection: DesktopWorkspaceGrantProjection;
  readonly hostResource: string;
  revoked: boolean;
}

export class DesktopWorkspaceGrantAuthority implements DesktopWorkspaceGrantAuthorityPort {
  private readonly grants = new Map<string, StoredDesktopWorkspaceGrant>();
  private disposed = false;

  constructor(
    private readonly options: {
      readonly resolver: DesktopWorkspaceGrantResolutionPort;
      readonly createIdentity?: () => string;
    },
  ) {}

  authorize(input: {
    readonly windowId: string;
    readonly label: string;
    readonly hostResource: string;
  }): DesktopWorkspaceGrantProjection {
    this.requireActive();
    if (input.hostResource.trim().length === 0) {
      throw new Error('Desktop Workspace grant host resource is required.');
    }
    const workspaceGrantId = `workspace-grant:${(this.options.createIdentity ?? randomUUID)()}`;
    const projection = parseDesktopWorkspaceGrantProjection({
      workspaceGrantId,
      windowId: input.windowId,
      label: input.label,
    });
    this.grants.set(workspaceGrantId, {
      projection,
      hostResource: input.hostResource,
      revoked: false,
    });
    return projection;
  }

  async authorizeWorkspace(input: {
    readonly windowId: string;
    readonly workspaceId: string;
  }): Promise<{
    readonly grant: DesktopWorkspaceGrantProjection;
    readonly workspace: AssetWorkspaceResolution;
  }> {
    this.requireActive();
    if (!this.options.resolver.restore) {
      throw new DesktopWorkspaceGrantAuthorityError(
        'desktop-workspace-grant-not-found',
        `Workspace '${input.workspaceId}' cannot be restored by this Host.`,
      );
    }
    const workspace = await this.options.resolver.restore(input.workspaceId);
    if (workspace.workspaceId !== input.workspaceId) {
      throw new DesktopWorkspaceGrantAuthorityError(
        'desktop-workspace-grant-not-found',
        `Workspace '${input.workspaceId}' resolved to another Workspace.`,
      );
    }
    const grant = this.authorize({
      windowId: input.windowId,
      label: workspace.displayName,
      hostResource: workspace.workspacePath,
    });
    return { grant, workspace };
  }

  async resolve(
    windowId: string,
    workspaceGrantId: string,
  ): Promise<DesktopWorkspaceGrantResolution> {
    this.requireActive();
    const grant = this.grants.get(workspaceGrantId);
    if (!grant) {
      throw new DesktopWorkspaceGrantAuthorityError(
        'desktop-workspace-grant-not-found',
        `Desktop Workspace grant '${workspaceGrantId}' is not present.`,
      );
    }
    if (grant.revoked) {
      throw new DesktopWorkspaceGrantAuthorityError(
        'desktop-workspace-grant-revoked',
        `Desktop Workspace grant '${workspaceGrantId}' is revoked.`,
      );
    }
    if (grant.projection.windowId !== windowId) {
      throw new DesktopWorkspaceGrantAuthorityError(
        'desktop-workspace-grant-window-mismatch',
        `Desktop Workspace grant '${workspaceGrantId}' belongs to another Window.`,
      );
    }
    return {
      workspaceGrantId,
      windowId,
      workspace: await this.options.resolver.resolve(grant.hostResource),
    };
  }

  async restore(
    windowId: string,
    workspaceGrantId: string,
    workspaceId: string,
  ): Promise<DesktopWorkspaceGrantResolution> {
    this.requireActive();
    const current = this.grants.get(workspaceGrantId);
    if (current) {
      const resolution = await this.resolve(windowId, workspaceGrantId);
      if (resolution.workspace.workspaceId !== workspaceId) {
        throw new DesktopWorkspaceGrantAuthorityError(
          'desktop-workspace-grant-not-found',
          `Desktop Workspace grant '${workspaceGrantId}' resolves to another Workspace.`,
        );
      }
      return resolution;
    }
    if (!this.options.resolver.restore) {
      throw new DesktopWorkspaceGrantAuthorityError(
        'desktop-workspace-grant-not-found',
        `Desktop Workspace grant '${workspaceGrantId}' cannot be restored by this Host.`,
      );
    }
    const workspace = await this.options.resolver.restore(workspaceId);
    if (workspace.workspaceId !== workspaceId) {
      throw new DesktopWorkspaceGrantAuthorityError(
        'desktop-workspace-grant-not-found',
        `Persisted Workspace identity '${workspaceId}' resolved to another Workspace.`,
      );
    }
    const projection = parseDesktopWorkspaceGrantProjection({
      workspaceGrantId,
      windowId,
      label: workspace.displayName,
    });
    this.grants.set(workspaceGrantId, {
      projection,
      hostResource: workspace.workspacePath,
      revoked: false,
    });
    return { workspaceGrantId, windowId, workspace };
  }

  revoke(workspaceGrantId: string): void {
    this.requireActive();
    const grant = this.grants.get(workspaceGrantId);
    if (!grant) {
      throw new DesktopWorkspaceGrantAuthorityError(
        'desktop-workspace-grant-not-found',
        `Desktop Workspace grant '${workspaceGrantId}' is not present.`,
      );
    }
    grant.revoked = true;
  }

  releaseWindow(windowId: string): void {
    this.requireActive();
    for (const [workspaceGrantId, grant] of this.grants) {
      if (grant.projection.windowId === windowId) this.grants.delete(workspaceGrantId);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.grants.clear();
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Workspace grant authority is disposed.');
  }
}
