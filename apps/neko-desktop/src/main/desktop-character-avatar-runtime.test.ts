import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AssetLibraryMembershipRepository } from '@neko/assets-domain/global-library/membership';
import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterRun,
  type CharacterVersion as PublishedCharacter,
  type RoomRun,
} from '@neko/chara-domain/contracts';
import { CharacterAvatarAuthorityService } from '@neko/chara-domain/application';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopCharacterAvatarRuntime } from './desktop-character-avatar-runtime';
import { DesktopResourceRegistry } from './desktop-resource-registry';

describe('DesktopCharacterAvatarRuntime', () => {
  const roots: string[] = [];
  const registries: DesktopResourceRegistry[] = [];

  afterEach(async () => {
    for (const registry of registries.splice(0)) registry.dispose();
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('authorizes only the exact selected VRM and revokes its lease on release', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-character-avatar-'));
    roots.push(root);
    await writeFile(path.join(root, 'avatar.vrm'), 'vrm-fixture');
    const resources = new DesktopResourceRegistry();
    resources.bindWindow('window-a', 101);
    registries.push(resources);
    const runtime = new DesktopCharacterAvatarRuntime({
      globalAssetRoot: root,
      assetLibraryMemberships: memberships(),
      resources,
      authority: new CharacterAvatarAuthorityService(repository()),
    });
    const result = await runtime.open({
      windowId: 'window-a',
      owner: { kind: 'character', characterRunId: 'character-run-a' },
      request: {
        requestId: 'request-a',
        operation: 'open',
        rendererSessionId: 'renderer-a',
        workbenchInstanceId: 'workbench-a',
        characterRunId: 'character-run-a',
        representationId: 'avatar-a',
        surface: 'avatar',
      },
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected a ready Avatar descriptor.');
    expect(result.descriptor.url).toMatch(/^openneko:\/\/resource\//u);
    expect(result.descriptor).not.toHaveProperty('absolutePath');
    expect(resources.authorizeRequest(result.descriptor.url, 101)).toBe(true);
    runtime.release({
      windowId: 'window-a',
      rendererSessionId: 'renderer-a',
      avatarResourceLeaseId: result.descriptor.avatarResourceLeaseId,
    });
    expect((await resources.handle(new Request(result.descriptor.url))).status).toBe(404);
  });

  it('does not use a first-compatible representation or a Run outside the exact Room', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-character-avatar-'));
    roots.push(root);
    await writeFile(path.join(root, 'avatar.vrm'), 'vrm-fixture');
    const resources = new DesktopResourceRegistry();
    resources.bindWindow('window-a', 101);
    registries.push(resources);
    const runtime = new DesktopCharacterAvatarRuntime({
      globalAssetRoot: root,
      assetLibraryMemberships: memberships(),
      resources,
      authority: new CharacterAvatarAuthorityService(repository()),
    });

    await expect(
      runtime.open({
        windowId: 'window-a',
        owner: { kind: 'character', characterRunId: 'character-run-a' },
        request: {
          requestId: 'request-wrong-representation',
          operation: 'open',
          rendererSessionId: 'renderer-a',
          workbenchInstanceId: 'workbench-a',
          characterRunId: 'character-run-a',
          representationId: 'avatar-unselected',
          surface: 'avatar',
        },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'character-avatar-representation-unavailable' },
    });
    await expect(
      runtime.open({
        windowId: 'window-a',
        owner: { kind: 'room', roomRunId: 'room-run-a' },
        request: {
          requestId: 'request-wrong-room',
          operation: 'open',
          rendererSessionId: 'renderer-a',
          workbenchInstanceId: 'workbench-a',
          characterRunId: 'character-run-outside-room',
          representationId: 'avatar-a',
          surface: 'avatar',
        },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'character-avatar-scene-mismatch' },
    });
  });

  it('authorizes only the exact selected portrait as an image resource', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-character-portrait-'));
    roots.push(root);
    await writeFile(path.join(root, 'portrait.png'), 'png-fixture');
    const resources = new DesktopResourceRegistry();
    resources.bindWindow('window-a', 101);
    registries.push(resources);
    const runtime = new DesktopCharacterAvatarRuntime({
      globalAssetRoot: root,
      assetLibraryMemberships: memberships(),
      resources,
      authority: new CharacterAvatarAuthorityService(repository()),
    });

    await expect(
      runtime.open({
        windowId: 'window-a',
        owner: { kind: 'character', characterRunId: 'character-run-a' },
        request: {
          requestId: 'request-portrait',
          operation: 'open',
          rendererSessionId: 'renderer-a',
          workbenchInstanceId: 'workbench-a',
          characterRunId: 'character-run-a',
          representationId: 'portrait-a',
          surface: 'portrait',
        },
      }),
    ).resolves.toMatchObject({
      status: 'ready',
      descriptor: {
        kind: 'portrait',
        mediaType: 'image/png',
        representationId: 'portrait-a',
      },
    });
  });
});

function memberships(): AssetLibraryMembershipRepository {
  return {
    get: vi.fn(async (membershipId) =>
      membershipId === 'global-asset-library:avatar-a' ||
      membershipId === 'global-asset-library:portrait-a'
        ? {
            membershipId,
            sourceRelativePath:
              membershipId === 'global-asset-library:avatar-a' ? 'avatar.vrm' : 'portrait.png',
            label: membershipId === 'global-asset-library:avatar-a' ? 'avatar.vrm' : 'portrait.png',
            mediaType:
              membershipId === 'global-asset-library:avatar-a' ? 'model/gltf-binary' : 'image/png',
            byteLength: 11,
            modifiedAt: '2026-08-10T00:00:00.000Z',
            state: 'active' as const,
            createdAt: '2026-08-10T00:00:00.000Z',
            updatedAt: '2026-08-10T00:00:00.000Z',
          }
        : null,
    ),
    findBySourceRelativePath: vi.fn(async () => null),
    listActive: vi.fn(async () => []),
    registerDiscovered: vi.fn(async () => undefined),
    activate: vi.fn(async () => {
      throw new Error('not expected');
    }),
    removeMany: vi.fn(async () => []),
    relocateMany: vi.fn(async () => []),
  };
}

function repository(): {
  readCharacterRun(characterRunId: string): Promise<CharacterRun | undefined>;
  readPublication(characterVersionId: string): Promise<PublishedCharacter | undefined>;
  readRoomRun(roomRunId: string): Promise<RoomRun | undefined>;
} {
  const run: CharacterRun = {
    characterRunId: 'character-run-a',
    characterVersionId: 'character-version-a',
    participantId: 'participant-a',
    controller: { kind: 'agent', primaryAgentSessionId: 'agent-session-a' },
    runtimeBinding: {
      kind: 'companion',
      companionContinuityId: 'continuity-a',
      relationshipId: 'relationship-a',
    },
    createdAt: '2026-08-10T00:00:00.000Z',
  };
  const publication: PublishedCharacter = {
    characterVersionId: 'character-version-a',
    characterProjectId: 'character-project-a',
    label: 'Avatar publication',
    definition: {
      summary: 'A Character with a selected Avatar.',
      backgroundStory: createEmptyCharacterBackgroundStory(),
      originSetting: createEmptyCharacterOriginSetting(),
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
      expressionPolicy: [],
      representationRefs: [
        {
          representationId: 'avatar-unselected',
          kind: 'vrm',
          resourceRef: 'global-asset-library:avatar-a',
        },
        {
          representationId: 'avatar-a',
          kind: 'vrm',
          resourceRef: 'global-asset-library:avatar-a',
        },
        {
          representationId: 'portrait-a',
          kind: 'portrait',
          resourceRef: 'global-asset-library:portrait-a',
        },
      ],
      representationDefaults: {
        avatarRepresentationId: 'avatar-a',
        portraitRepresentationId: 'portrait-a',
      },
    },
    acceptedEvidenceIds: [],
    publishedAt: '2026-08-10T00:00:00.000Z',
  };
  const roomRun: RoomRun = {
    topology: 'chatroom',
    roomRunId: 'room-run-a',
    characterRoomId: 'room-a',
    roomRevision: 0,
    participants: [
      {
        participantId: 'participant-a',
        displayName: 'Lin',
        characterVersionId: 'character-version-a',
        controller: {
          kind: 'agent',
          characterRunId: 'character-run-a',
          primaryAgentSessionId: 'agent-session-a',
        },
      },
    ],
    schedulingPolicy: { kind: 'mentioned' },
    events: [],
    mode: 'companion',
    relationshipIds: ['relationship-a'],
    createdAt: '2026-08-10T00:00:00.000Z',
  };
  return {
    async readCharacterRun(characterRunId) {
      return characterRunId === run.characterRunId ? run : undefined;
    },
    async readPublication(characterVersionId) {
      return characterVersionId === publication.characterVersionId ? publication : undefined;
    },
    async readRoomRun(roomRunId) {
      return roomRunId === roomRun.roomRunId ? roomRun : undefined;
    },
  };
}
