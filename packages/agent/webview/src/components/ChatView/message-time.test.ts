import { describe, expect, it, vi } from 'vitest';
import { formatMessageTime } from './message-time';

describe('formatMessageTime', () => {
  it('uses one hour-and-minute formatter for transcript and queue timestamps', () => {
    const formatter = vi.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('11:18');

    expect(formatMessageTime(1_717_200_000_000)).toBe('11:18');
    expect(formatter).toHaveBeenCalledWith([], { hour: '2-digit', minute: '2-digit' });

    formatter.mockRestore();
  });
});
