import type { AutomationProfile } from '@neko/automation-contracts';

export const CUA_DRIVER_OBSERVE_PROFILE: AutomationProfile = Object.freeze({
  id: 'computer-use.observe.macos',
  provider: Object.freeze({
    extensionId: 'computer-use',
    providerId: 'cua-driver',
    kind: 'computer',
    deliverySource: Object.freeze({ kind: 'bundled-adapter' as const }),
  }),
  operations: Object.freeze([
    Object.freeze({
      name: 'verify_state',
      requiredInputProperties: Object.freeze(['pid', 'window_id', 'session']),
      modes: Object.freeze(['observe'] as const),
      trait: Object.freeze({
        effect: 'observe' as const,
        readOnly: true,
        destructive: false,
        sensitive: true,
        requiresApproval: false,
      }),
    }),
  ]),
  requiredPermissions: Object.freeze({
    observe: Object.freeze(['screen-recording'] as const),
  }),
});
