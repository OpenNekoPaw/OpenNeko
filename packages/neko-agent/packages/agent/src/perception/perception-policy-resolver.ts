import type { PerceptionPolicy, PerceptionPolicyContext } from '@neko/shared';

export class PerceptionPolicyResolver {
  resolve(context: PerceptionPolicyContext): PerceptionPolicy {
    if (context.userExplicitRequest) {
      return {
        timing: 'on-completion',
        layers: [0, 1, 2],
        reason: 'explicit perception request',
      };
    }

    if (context.isWorkflow && context.hasNextStep) {
      return {
        timing: 'on-completion',
        layers: [0, 1],
        reason: 'workflow follow-up step needs semantic media context',
      };
    }

    if (context.isWorkflow) {
      return {
        timing: 'on-reference',
        layers: [0, 1],
        reason: 'workflow asset can defer semantic perception until referenced',
      };
    }

    return {
      timing: 'on-completion',
      layers: [0],
      reason: `standalone ${context.modality} asset records structural metadata first`,
    };
  }
}

export function createPerceptionPolicyResolver(): PerceptionPolicyResolver {
  return new PerceptionPolicyResolver();
}
