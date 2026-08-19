import { describe, expect, it } from 'vitest';
import {
  parseAssistantResourceHostRequest,
  parseAssistantResourceHostResult,
} from '../assistant-resource-host';

describe('Assistant Resource Host contract', () => {
  it('strictly decodes exact conversation-owned routes', () => {
    const request = {
      requestId: 'request:1',
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
        requestId: 'request:1',
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
      parseAssistantResourceHostRequest({
        requestId: 'request:1',
        identity: {
          assistantSpaceId: 'assistant:1',
          conversationId: 'conversation:1',
          windowId: 'window:1',
        },
        route: 'snapshot.get',
        rendererSessionId: 'removed-endpoint',
      }),
    ).toThrow('unsupported fields');
    expect(() =>
      parseAssistantResourceHostResult(
        {
          requestId: 'request:other',
          route: 'preview.release',
          status: 'released',
        },
        'request:1',
      ),
    ).toThrow('request identity mismatch');
  });
});
