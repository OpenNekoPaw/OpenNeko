import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { AssetLibraryMembershipRepository } from '@neko/assets-domain/global-library/membership';
import { resolveGlobalAssetItemPath } from '@neko/assets-node';
import {
  CharacterAvatarAuthorityService,
  CharacterPresentationError,
} from '@neko/chara/application';
import {
  type CharacterAvatarHostDiagnosticCode,
  type CharacterAvatarHostResult,
  type CharacterAvatarHostRequest,
} from '@neko/chara/contracts';
import type { DesktopResourceLease, DesktopResourceRegistry } from './desktop-resource-registry';

type CharacterAvatarOpenRequest = Extract<
  CharacterAvatarHostRequest,
  { readonly operation: 'open' }
>;

export type DesktopCharacterAvatarSceneOwner =
  | { readonly kind: 'character'; readonly characterRunId: string }
  | { readonly kind: 'room'; readonly roomRunId: string };

interface StoredAvatarLease {
  readonly windowId: string;
  readonly rendererSessionId: string;
  readonly lease: DesktopResourceLease;
}

export class DesktopCharacterAvatarRuntime {
  private readonly leases = new Map<string, StoredAvatarLease>();
  private disposed = false;

  constructor(
    private readonly options: {
      readonly globalAssetRoot: string;
      readonly assetLibraryMemberships: AssetLibraryMembershipRepository;
      readonly resources: DesktopResourceRegistry;
      readonly authority: CharacterAvatarAuthorityService;
    },
  ) {}

  async open(input: {
    readonly windowId: string;
    readonly request: CharacterAvatarOpenRequest;
    readonly owner: DesktopCharacterAvatarSceneOwner;
  }): Promise<CharacterAvatarHostResult> {
    this.requireActive();
    const { request } = input;
    if (!(await this.ownerContainsRun(input.owner, request.characterRunId))) {
      return unavailable(
        request.requestId,
        'character-avatar-scene-mismatch',
        'The active Character Scene does not own the requested CharacterRun.',
      );
    }
    let representation;
    try {
      ({ representation } = await this.options.authority.resolveSelectedRepresentation({
        characterRunId: request.characterRunId,
        representationId: request.representationId,
        surface: request.surface,
      }));
    } catch (error) {
      if (
        error instanceof CharacterPresentationError &&
        error.code === 'character-avatar-representation-unavailable'
      ) {
        return unavailable(
          request.requestId,
          'character-avatar-representation-unavailable',
          error.message,
        );
      }
      return unavailable(
        request.requestId,
        'character-avatar-run-unavailable',
        `CharacterRun '${request.characterRunId}' or its publication is unavailable.`,
      );
    }
    if (
      (request.surface === 'avatar' && representation.kind !== 'vrm') ||
      (request.surface === 'portrait' && representation.kind !== 'portrait')
    ) {
      return unavailable(
        request.requestId,
        'character-avatar-renderer-unavailable',
        `The exact '${representation.kind}' representation cannot render the ${request.surface} surface.`,
      );
    }
    if (!representation.resourceRef.startsWith('global-asset-library:')) {
      return unavailable(
        request.requestId,
        'character-avatar-resource-unavailable',
        'The selected VRM does not reference an authorized Global Asset identity.',
      );
    }

    let absolutePath: string;
    try {
      absolutePath = await resolveGlobalAssetItemPath({
        globalAssetRoot: this.options.globalAssetRoot,
        memberships: this.options.assetLibraryMemberships,
        itemId: representation.resourceRef,
      });
    } catch {
      return unavailable(
        request.requestId,
        'character-avatar-resource-unavailable',
        'The selected VRM Global Asset is stale or unavailable.',
      );
    }
    const mediaType = resolveCharacterVisualMediaType(request.surface, absolutePath);
    if (!mediaType) {
      return unavailable(
        request.requestId,
        'character-avatar-resource-unavailable',
        `The selected ${request.surface} resource has an unsupported file type.`,
      );
    }

    try {
      const source = await stat(absolutePath);
      if (!source.isFile()) throw new Error('not a file');
      const lease = await this.options.resources.registerFile(
        {
          windowId: input.windowId,
          viewId: request.workbenchInstanceId,
          sessionId: `character-avatar:${request.characterRunId}`,
          rendererSessionId: request.rendererSessionId,
        },
        { absolutePath, mediaType },
      );
      const avatarResourceLeaseId = `character-avatar-lease:${randomUUID()}`;
      this.leases.set(avatarResourceLeaseId, {
        windowId: input.windowId,
        rendererSessionId: request.rendererSessionId,
        lease,
      });
      const descriptor =
        request.surface === 'avatar'
          ? {
              avatarResourceLeaseId,
              characterRunId: request.characterRunId,
              representationId: request.representationId,
              kind: 'vrm' as const,
              url: lease.url,
              displayName: path.basename(absolutePath),
              mediaType: 'model/gltf-binary' as const,
              byteLength: source.size,
              sourceFingerprint: `${source.mtimeMs}:${source.size}`,
            }
          : {
              avatarResourceLeaseId,
              characterRunId: request.characterRunId,
              representationId: request.representationId,
              kind: 'portrait' as const,
              url: lease.url,
              displayName: path.basename(absolutePath),
              mediaType: requirePortraitMediaType(mediaType),
              byteLength: source.size,
              sourceFingerprint: `${source.mtimeMs}:${source.size}`,
            };
      return {
        requestId: request.requestId,
        status: 'ready',
        descriptor,
      };
    } catch {
      return unavailable(
        request.requestId,
        'character-avatar-resource-unavailable',
        'The selected VRM could not be authorized for this Character Scene.',
      );
    }
  }

  release(input: {
    readonly windowId: string;
    readonly rendererSessionId: string;
    readonly avatarResourceLeaseId: string;
  }): void {
    this.requireActive();
    const stored = this.leases.get(input.avatarResourceLeaseId);
    if (!stored) return;
    if (
      stored.windowId !== input.windowId ||
      stored.rendererSessionId !== input.rendererSessionId
    ) {
      throw new Error('Character Avatar resource lease belongs to another Renderer.');
    }
    this.leases.delete(input.avatarResourceLeaseId);
    stored.lease.release();
  }

  detachWindow(windowId: string): void {
    for (const [leaseId, stored] of this.leases) {
      if (stored.windowId !== windowId) continue;
      this.leases.delete(leaseId);
      stored.lease.release();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const stored of this.leases.values()) stored.lease.release();
    this.leases.clear();
  }

  private async ownerContainsRun(
    owner: DesktopCharacterAvatarSceneOwner,
    characterRunId: string,
  ): Promise<boolean> {
    if (owner.kind === 'character') return owner.characterRunId === characterRunId;
    try {
      await this.options.authority.assertRoomContainsRun(owner.roomRunId, characterRunId);
      return true;
    } catch {
      return false;
    }
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop Character Avatar runtime is disposed.');
  }
}

function requirePortraitMediaType(
  mediaType: 'model/gltf-binary' | 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
  if (mediaType === 'model/gltf-binary') {
    throw new Error('Character portrait resource resolved to a VRM media type.');
  }
  return mediaType;
}

function resolveCharacterVisualMediaType(
  surface: CharacterAvatarOpenRequest['surface'],
  absolutePath: string,
): 'model/gltf-binary' | 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | undefined {
  const extension = path.extname(absolutePath).toLocaleLowerCase();
  if (surface === 'avatar') return extension === '.vrm' ? 'model/gltf-binary' : undefined;
  switch (extension) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return undefined;
  }
}

function unavailable(
  requestId: string,
  code: CharacterAvatarHostDiagnosticCode,
  message: string,
): CharacterAvatarHostResult {
  return { requestId, status: 'unavailable', diagnostic: { code, message } };
}
