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
  it('opens generated asset refs through the file channel', () => {
    openMediaTarget('generated-assets/asset-1.png');

    expect(mockVSCodeMessages.openFile).toHaveBeenCalledWith('generated-assets/asset-1.png');
    expect(mockVSCodeMessages.openUrl).not.toHaveBeenCalled();
  });
});
