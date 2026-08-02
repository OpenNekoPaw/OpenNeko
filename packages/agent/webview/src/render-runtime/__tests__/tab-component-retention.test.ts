import { describe, expect, it } from 'vitest';
import { createTabComponentRetentionPolicy } from '../tab-component-retention';

describe('Tab component retention policy', () => {
  it('bounds clean inactive component trees by activation recency', () => {
    const policy = createTabComponentRetentionPolicy(1);

    expect([
      ...policy.reconcile([
        { tabId: 'tab-a', active: true, mustRetain: false },
        { tabId: 'tab-b', active: false, mustRetain: false },
        { tabId: 'tab-c', active: false, mustRetain: false },
      ]),
    ]).toEqual(['tab-a', 'tab-c']);

    expect([
      ...policy.reconcile([
        { tabId: 'tab-a', active: false, mustRetain: false },
        { tabId: 'tab-b', active: true, mustRetain: false },
        { tabId: 'tab-c', active: false, mustRetain: false },
      ]),
    ]).toEqual(['tab-b', 'tab-a']);
  });

  it('retains every active or protected tree even when the clean budget is exhausted', () => {
    const policy = createTabComponentRetentionPolicy(0);

    expect([
      ...policy.reconcile([
        { tabId: 'tab-active', active: true, mustRetain: false },
        { tabId: 'tab-running', active: false, mustRetain: true },
        { tabId: 'tab-dirty', active: false, mustRetain: true },
        { tabId: 'tab-clean', active: false, mustRetain: false },
      ]),
    ]).toEqual(['tab-active', 'tab-running', 'tab-dirty']);
  });

  it('fails visibly for invalid limits and ambiguous active ownership', () => {
    expect(() => createTabComponentRetentionPolicy(-1)).toThrow(/non-negative integer/);
    const policy = createTabComponentRetentionPolicy(1);
    expect(() =>
      policy.reconcile([
        { tabId: 'tab-a', active: true, mustRetain: false },
        { tabId: 'tab-b', active: true, mustRetain: false },
      ]),
    ).toThrow(/Multiple active Tab/);
  });
});
