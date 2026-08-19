import type { AutomationProfile } from '@neko/automation-contracts';

export const BROWSER_USE_OBSERVE_PROFILE: AutomationProfile = Object.freeze({
  id: 'browser-use.observe',
  provider: Object.freeze({
    extensionId: 'browser-use',
    providerId: 'browser-use',
    kind: 'browser',
    deliverySource: Object.freeze({ kind: 'bundled-adapter' as const }),
  }),
  operations: Object.freeze([
    reviewedObserveOperation('browser_get_state'),
    reviewedObserveOperation('browser_get_html'),
    reviewedObserveOperation('browser_screenshot'),
  ]),
  requiredPermissions: Object.freeze({}),
});

function reviewedObserveOperation(name: string) {
  return Object.freeze({
    name,
    requiredInputProperties: Object.freeze([]),
    modes: Object.freeze(['observe'] as const),
    trait: Object.freeze({
      effect: 'observe' as const,
      readOnly: true,
      destructive: false,
      sensitive: true,
      requiresApproval: false,
    }),
  });
}
