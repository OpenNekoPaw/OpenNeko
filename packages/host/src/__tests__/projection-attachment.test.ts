import { describe, expect, it } from 'vitest';
import {
  isSameHostProjectionAttachment,
  type HostProjectionAttachmentFrame,
} from '../projection-attachment';

interface TestKey {
  readonly endpointEpoch: string;
  readonly attachmentId: string;
  readonly ownerId: string;
}

describe('Host projection attachment contract', () => {
  it('compares endpoint and attachment identity without assuming an owner shape', () => {
    expect(
      isSameHostProjectionAttachment(
        { endpointEpoch: 'endpoint-1', attachmentId: 'attachment-1' },
        { endpointEpoch: 'endpoint-1', attachmentId: 'attachment-1' },
      ),
    ).toBe(true);
    expect(
      isSameHostProjectionAttachment(
        { endpointEpoch: 'endpoint-1', attachmentId: 'attachment-1' },
        { endpointEpoch: 'endpoint-2', attachmentId: 'attachment-1' },
      ),
    ).toBe(false);
  });

  it('keeps owner-specific identity on generic snapshot frames', () => {
    const frame: HostProjectionAttachmentFrame<TestKey, { value: string }, { value: string }> = {
      type: 'projectionSnapshot',
      key: {
        endpointEpoch: 'endpoint-1',
        attachmentId: 'attachment-1',
        ownerId: 'project-1',
      },
      sequence: 0,
      projectionVersion: 3,
      projection: { value: 'ready' },
    };

    expect(frame.key.ownerId).toBe('project-1');
    expect(frame.projectionVersion).toBe(3);
  });
});
