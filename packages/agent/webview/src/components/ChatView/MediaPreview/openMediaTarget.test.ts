import { describe, expect, it, vi } from 'vitest';
import { openMediaTarget } from './openMediaTarget';

const mockHostMessages = vi.hoisted(() => ({
  openFile: vi.fn(),
  openUrl: vi.fn(),
}));

vi.mock('../../../messages', () => ({
  AgentHostMessages: mockHostMessages,
}));

describe('openMediaTarget', () => {
  it('rejects generated asset refs without a Host-issued locator', () => {
    expect(() => openMediaTarget('generated-assets/asset-1.png')).toThrow(
      'Host file open requires a ContentLocator.',
    );

    expect(mockHostMessages.openFile).not.toHaveBeenCalled();
    expect(mockHostMessages.openUrl).not.toHaveBeenCalled();
  });
});
