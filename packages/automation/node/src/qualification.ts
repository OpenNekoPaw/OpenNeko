import type {
  AutomationProfile,
  AutomationProviderIdentity,
  AutomationProviderInspection,
  AutomationReviewedOperation,
} from '@neko/automation-contracts';

export interface AutomationQualificationDiagnostic {
  readonly profileId: string;
  readonly operation: string;
  readonly code:
    | 'provider-unavailable'
    | 'provider-mismatch'
    | 'operation-unreviewed'
    | 'operation-schema-changed'
    | 'operation-annotations-contradictory';
}

export interface AutomationProfileQualification {
  readonly availableOperations: readonly AutomationReviewedOperation[];
  readonly diagnostics: readonly AutomationQualificationDiagnostic[];
}

export function qualifyAutomationProviderProfile(
  profile: AutomationProfile,
  inspection: AutomationProviderInspection,
): AutomationProfileQualification {
  if (!sameProviderIdentity(profile.provider, inspection.provider)) {
    return {
      availableOperations: Object.freeze([]),
      diagnostics: Object.freeze(
        profile.operations.map((operation) => ({
          profileId: profile.id,
          operation: operation.name,
          code: 'provider-mismatch' as const,
        })),
      ),
    };
  }
  const discovered = new Map(inspection.operations.map((operation) => [operation.name, operation]));
  const availableOperations: AutomationReviewedOperation[] = [];
  const diagnostics: AutomationQualificationDiagnostic[] = [];
  for (const reviewed of profile.operations) {
    const actual = discovered.get(reviewed.name);
    if (!actual) {
      diagnostics.push({
        profileId: profile.id,
        operation: reviewed.name,
        code: 'operation-unreviewed',
      });
    } else if (actual.inputSchemaDigest !== reviewed.inputSchemaDigest) {
      diagnostics.push({
        profileId: profile.id,
        operation: reviewed.name,
        code: 'operation-schema-changed',
      });
    } else if (annotationsContradict(reviewed, actual.annotations)) {
      diagnostics.push({
        profileId: profile.id,
        operation: reviewed.name,
        code: 'operation-annotations-contradictory',
      });
    } else {
      availableOperations.push(reviewed);
    }
  }
  return {
    availableOperations: Object.freeze(availableOperations),
    diagnostics: Object.freeze(diagnostics),
  };
}

function sameProviderIdentity(
  left: AutomationProviderIdentity,
  right: AutomationProviderIdentity,
): boolean {
  if (
    left.extensionId !== right.extensionId ||
    left.providerId !== right.providerId ||
    left.kind !== right.kind ||
    left.upstreamRelease !== right.upstreamRelease ||
    left.deliverySource.kind !== right.deliverySource.kind
  ) {
    return false;
  }
  if (
    left.deliverySource.kind === 'user-managed-endpoint' &&
    right.deliverySource.kind === 'user-managed-endpoint'
  ) {
    return left.deliverySource.endpointId === right.deliverySource.endpointId;
  }
  return true;
}

function annotationsContradict(
  reviewed: AutomationReviewedOperation,
  actual: { readonly readOnlyHint?: boolean; readonly destructiveHint?: boolean },
): boolean {
  return (
    (reviewed.trait.readOnly && actual.readOnlyHint === false) ||
    (!reviewed.trait.readOnly && actual.readOnlyHint === true) ||
    (!reviewed.trait.destructive && actual.destructiveHint === true)
  );
}
