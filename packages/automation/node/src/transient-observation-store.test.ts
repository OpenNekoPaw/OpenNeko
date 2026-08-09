import { describe, expect, it } from 'vitest';
import { createAutomationTransientObservationStore } from './transient-observation-store';

describe('Automation transient observation store', () => {
  it('returns transcript-safe receipts and releases raw bytes after one owner-bound consume', async () => {
    let current = 100;
    const store = createAutomationTransientObservationStore({
      ttlMs: 50,
      maxBytes: 16,
      now: () => current,
      createId: () => 'receipt-1',
    });
    const data = new Uint8Array([137, 80, 78, 71]);
    await expect(
      store.publish({
        sessionId: 'session-1',
        actionId: 'action-1',
        data,
        mimeType: 'image/png',
        width: 2,
        height: 3,
      }),
    ).resolves.toEqual({ receiptId: 'receipt-1' });

    data.fill(0);
    const receipt = store.readReceipt('receipt-1');
    expect(receipt).toMatchObject({
      receiptId: 'receipt-1',
      sessionId: 'session-1',
      actionId: 'action-1',
      byteLength: 4,
      expiresAt: 150,
    });
    expect(JSON.stringify(receipt)).not.toContain('137,80,78,71');
    expect(() =>
      store.consume({
        receiptId: 'receipt-1',
        sessionId: 'session-other',
        actionId: 'action-1',
      }),
    ).toThrow('owner does not match');
    expect(
      store.consume({
        receiptId: 'receipt-1',
        sessionId: 'session-1',
        actionId: 'action-1',
      }).data,
    ).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(store.readReceipt('receipt-1')).toBeUndefined();

    current = 200;
    expect(() =>
      store.consume({
        receiptId: 'receipt-1',
        sessionId: 'session-1',
        actionId: 'action-1',
      }),
    ).toThrow('unavailable or expired');
  });
});
