import { describe, expect, it, vi } from 'vitest';
import { openMediaTarget } from './openMediaTarget';
import { createTestAgentHostMessageSender } from '../../../test-utils/agent-host-messages';

const mockHostMessages = vi.hoisted(() => ({
  openFile: vi.fn(),
  openUrl: vi.fn(),
}));

describe('openMediaTarget', () => {
  it('rejects generated asset refs without a Host-issued locator', () => {
    const hostMessages = createTestAgentHostMessageSender(mockHostMessages);
    expect(() => openMediaTarget(hostMessages, 'generated-assets/asset-1.png')).toThrow(
      'Host file open requires a ContentLocator.',
    );

    expect(mockHostMessages.openFile).not.toHaveBeenCalled();
    expect(mockHostMessages.openUrl).not.toHaveBeenCalled();
  });
});
