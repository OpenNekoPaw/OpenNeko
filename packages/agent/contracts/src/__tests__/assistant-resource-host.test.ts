import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_RESOURCE_HOST_VERSION,
  parseAssistantResourceHostRequest,
  parseAssistantResourceHostResult,
} from '../assistant-resource-host';

describe('Assistant Resource Host contract', () => {
  it('strictly decodes exact conversation-owned routes', () => {
    const request = {
      schemaVersion: ASSISTANT_RESOURCE_HOST_VERSION,
      requestId: 'request:1',
      endpointEpoch: 'endpoint:1',
      identity: {
        assistantSpaceId: 'assistant:1',
        conversationId: 'conversation:1',
        windowId: 'window:1',
      },
      route: 'preview.authorize',
      scratchArtifactId: 'scratch:1',
    };
    expect(parseAssistantResourceHostRequest(request)).toEqual(request);
  });

  it('rejects raw paths, unknown fields and cross-request results', () => {
    expect(() =>
      parseAssistantResourceHostRequest({
        schemaVersion: ASSISTANT_RESOURCE_HOST_VERSION,
        requestId: 'request:1',
        endpointEpoch: 'endpoint:1',
        identity: {
          assistantSpaceId: 'assistant:1',
          conversationId: 'conversation:1',
          windowId: 'window:1',
        },
        route: 'preview.authorize',
        scratchArtifactId: 'scratch:1',
        path: '/Users/private/result.png',
      }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseAssistantResourceHostResult(
        {
          schemaVersion: ASSISTANT_RESOURCE_HOST_VERSION,
          requestId: 'request:other',
          route: 'preview.release',
          status: 'released',
        },
        'request:1',
      ),
    ).toThrow('request identity mismatch');
  });
});
