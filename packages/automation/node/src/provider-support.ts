import type {
  AutomationProfile,
  AutomationProviderIdentity,
  AutomationProviderInspection,
  AutomationReviewedOperation,
} from '@neko/automation-contracts';

export interface AutomationSupportDiagnostic {
  readonly profileId: string;
  readonly operation: string;
  readonly code:
    | 'provider-unavailable'
    | 'provider-mismatch'
    | 'operation-unreviewed'
    | 'operation-schema-changed'
    | 'operation-annotations-contradictory';
}

export interface AutomationProfileSupport {
  readonly supportedOperations: readonly AutomationReviewedOperation[];
  readonly diagnostics: readonly AutomationSupportDiagnostic[];
}

export function inspectAutomationProviderSupport(
  profile: AutomationProfile,
  inspection: AutomationProviderInspection,
): AutomationProfileSupport {
  if (!sameProviderIdentity(profile.provider, inspection.provider)) {
    return {
      supportedOperations: Object.freeze([]),
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
  const supportedOperations: AutomationReviewedOperation[] = [];
  const diagnostics: AutomationSupportDiagnostic[] = [];
  for (const reviewed of profile.operations) {
    const actual = discovered.get(reviewed.name);
    if (!actual) {
      diagnostics.push({
        profileId: profile.id,
        operation: reviewed.name,
        code: 'operation-unreviewed',
      });
    } else if (!hasCompatibleInputSchema(actual.inputSchema, reviewed.requiredInputProperties)) {
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
      supportedOperations.push(reviewed);
    }
  }
  return {
    supportedOperations: Object.freeze(supportedOperations),
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
    left.deliverySource.kind !== right.deliverySource.kind
  ) {
    return false;
  }
  if (
    left.deliverySource.kind === 'user-managed-local-runtime' &&
    right.deliverySource.kind === 'user-managed-local-runtime'
  ) {
    return left.deliverySource.runtimeId === right.deliverySource.runtimeId;
  }
  return true;
}

function hasCompatibleInputSchema(
  schema: Readonly<Record<string, unknown>>,
  requiredProperties: readonly string[],
): boolean {
  if (schema['type'] !== 'object') return false;
  const properties = schema['properties'];
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
    return requiredProperties.length === 0;
  }
  return requiredProperties.every((property) => Object.hasOwn(properties, property));
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
