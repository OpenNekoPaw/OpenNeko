import { describe, expect, it, vi } from 'vitest';
import { openMediaTarget } from './openMediaTarget';

const mockVSCodeMessages = vi.hoisted(() => ({
  openFile: vi.fn(),
  openUrl: vi.fn(),
}));

vi.mock('@/messages', () => ({
  AgentHostMessages: mockVSCodeMessages,
  VSCodeMessages: mockVSCodeMessages,
}));

describe('openMediaTarget', () => {
  it('rejects generated asset refs without a Host-issued locator', () => {
    expect(() => openMediaTarget('generated-assets/asset-1.png')).toThrow(
      'Host file open requires a ContentLocator.',
    );

    expect(mockVSCodeMessages.openFile).not.toHaveBeenCalled();
    expect(mockVSCodeMessages.openUrl).not.toHaveBeenCalled();
  });
});
