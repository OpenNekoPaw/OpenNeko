import { describe, expect, it } from 'vitest';
import {
  createCharacterAvatarOpenRequest,
  parseCharacterAvatarHostRequest,
  parseCharacterAvatarHostResult,
} from '../character-avatar-host';

describe('Character Avatar host contract', () => {
  it('keeps exact Scene, Run and representation identities and exposes no raw path', () => {
    const request = createCharacterAvatarOpenRequest({
      requestId: 'request-a',
      rendererSessionId: 'renderer-session-a',
      workbenchInstanceId: 'workbench-a',
      characterRunId: 'character-run-a',
      representationId: 'avatar-a',
      surface: 'avatar',
    });
    const result = parseCharacterAvatarHostResult(
      {
        requestId: request.requestId,
        status: 'ready',
        descriptor: {
          avatarResourceLeaseId: 'avatar-lease-a',
          characterRunId: request.characterRunId,
          representationId: request.representationId,
          kind: 'vrm',
          url: 'openneko://resource/resource-a',
          displayName: 'avatar.vrm',
          mediaType: 'model/gltf-binary',
          byteLength: 128,
          sourceFingerprint: '128:1',
        },
      },
      request.requestId,
    );

    expect(result.status).toBe('ready');
    expect(JSON.stringify(result)).not.toContain('/Users/');
    expect(() =>
      parseCharacterAvatarHostRequest({ ...request, activeCharacterRunId: 'character-run-b' }),
    ).toThrow(/unsupported fields/u);
  });
});
