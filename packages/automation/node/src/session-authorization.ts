import { randomUUID } from 'node:crypto';
import {
  parseAutomationProfile,
  parseAutomationTarget,
  sameAutomationTarget,
  type AutomationMode,
  type AutomationProfile,
  type AutomationSessionGrant,
  type AutomationTarget,
} from '@neko/automation-contracts';
import {
  parseAutomationTargetSelectionProjection,
  parseAutomationTargetSelectionResult,
  type AutomationTargetSelectionCandidate,
  type AutomationTargetSelectionProjection,
} from '@neko/automation-contracts/target-selection';
import type { AutomationTargetRevalidationPort } from './session-owned-mcp-runtime';

const MAX_SELECTION_CANDIDATES = 100;

export interface AutomationTargetDiscoveryPort extends AutomationTargetRevalidationPort {
  listCandidates(input: {
    readonly sessionId: string;
    readonly targetHint?: unknown;
    readonly signal?: AbortSignal;
  }): Promise<readonly AutomationTarget[]>;
}

export interface AutomationTargetSelectionPort {
  /** Resolve only from an explicit user action. `undefined` means the user cancelled. */
  select(input: AutomationTargetSelectionProjection, signal?: AbortSignal): Promise<unknown>;
}

export interface AutomationSessionAuthorizationInput {
  readonly sessionId: string;
  readonly profile: unknown;
  readonly mode: AutomationMode;
  readonly timeoutMs: number;
  readonly stepBudget: number;
  readonly owner: {
    readonly workspaceId: string;
    readonly conversationId: string;
    readonly runId: string;
    readonly toolCallId: string;
  };
  readonly targetHint?: unknown;
  readonly signal?: AbortSignal;
}

export interface AutomationSessionAuthorizationResult {
  readonly target: AutomationTarget;
  readonly grant: AutomationSessionGrant;
}

export interface AutomationSessionAuthorizationService {
  authorizeSession(
    input: AutomationSessionAuthorizationInput,
  ): Promise<AutomationSessionAuthorizationResult>;
}

export interface AutomationSessionGrantIssuerPort {
  issue(input: unknown): AutomationSessionGrant;
}

export function createAutomationSessionAuthorizationService(options: {
  readonly registrations: readonly {
    readonly profile: unknown;
    readonly targets: AutomationTargetDiscoveryPort;
  }[];
  readonly grants: AutomationSessionGrantIssuerPort;
  readonly selection: AutomationTargetSelectionPort;
  readonly createAuthorizationId?: () => string;
  readonly createGrantId?: () => string;
}): AutomationSessionAuthorizationService {
  const registrations = new Map<
    string,
    { readonly profile: AutomationProfile; readonly targets: AutomationTargetDiscoveryPort }
  >();
  for (const input of options.registrations) {
    const profile = parseAutomationProfile(input.profile);
    if (registrations.has(profile.id)) {
      throw new Error(`Automation authorization profile '${profile.id}' is duplicated.`);
    }
    registrations.set(profile.id, Object.freeze({ profile, targets: input.targets }));
  }
  const createAuthorizationId =
    options.createAuthorizationId ?? (() => `authorization:${randomUUID()}`);
  const createGrantId = options.createGrantId ?? (() => `grant:${randomUUID()}`);

  return Object.freeze({
    async authorizeSession(
      input: AutomationSessionAuthorizationInput,
    ): Promise<AutomationSessionAuthorizationResult> {
      throwIfAborted(input.signal);
      const profile = parseAutomationProfile(input.profile);
      const registration = registrations.get(profile.id);
      if (!registration || !sameProfile(registration.profile, profile)) {
        throw new Error('Automation session authorization profile is unavailable or changed.');
      }
      if (
        !registration.profile.operations.some((operation) => operation.modes.includes(input.mode))
      ) {
        throw new Error(
          `Automation mode '${input.mode}' is unavailable for profile '${profile.id}'.`,
        );
      }
      const sessionId = identity(input.sessionId, 'Automation session');
      const timeoutMs = boundedInteger(input.timeoutMs, 1, 120_000, 'Automation timeout');
      const stepBudget = boundedInteger(input.stepBudget, 1, 100, 'Automation step budget');
      const owner = Object.freeze({
        workspaceId: identity(input.owner.workspaceId, 'Workspace'),
        conversationId: identity(input.owner.conversationId, 'Conversation'),
        runId: identity(input.owner.runId, 'Run'),
        toolCallId: identity(input.owner.toolCallId, 'Tool Call'),
      });
      const authorizationId = identity(createAuthorizationId(), 'Automation target authorization');
      const discovered = await registration.targets.listCandidates({
        sessionId,
        ...(input.targetHint === undefined ? {} : { targetHint: input.targetHint }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      throwIfAborted(input.signal);
      if (discovered.length === 0) {
        throw new Error('Automation target selection has no eligible candidates.');
      }
      if (discovered.length > MAX_SELECTION_CANDIDATES) {
        throw new Error(
          `Automation target selection exceeds ${MAX_SELECTION_CANDIDATES} eligible candidates.`,
        );
      }
      const targets = new Map<string, AutomationTarget>();
      for (const candidate of discovered) {
        const target = parseAutomationTarget(candidate);
        if (target.kind !== profile.provider.kind) {
          throw new Error('Automation target kind does not match the selected provider.');
        }
        if (targets.has(target.targetKey)) {
          throw new Error(`Automation target '${target.targetKey}' is duplicated.`);
        }
        targets.set(target.targetKey, target);
      }
      const selection = await options.selection.select(
        parseAutomationTargetSelectionProjection({
          authorizationId,
          profileId: profile.id,
          provider: profile.provider,
          mode: input.mode,
          timeoutMs,
          stepBudget,
          owner,
          candidates: [...targets.values()].map(projectSelectionCandidate),
        }),
        input.signal,
      );
      throwIfAborted(input.signal);
      if (selection === undefined) {
        throw new Error('Automation target selection was cancelled by the user.');
      }
      const selected = parseAutomationTargetSelectionResult(selection);
      if (selected.authorizationId !== authorizationId) {
        throw new Error('Automation target selection identity is stale.');
      }
      const selectedTarget = targets.get(selected.targetKey);
      if (!selectedTarget) {
        throw new Error('Automation target selection did not choose an eligible target.');
      }
      const revalidated = parseAutomationTarget(
        await registration.targets.revalidate({
          target: selectedTarget,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        }),
      );
      throwIfAborted(input.signal);
      if (!sameAutomationTarget(selectedTarget, revalidated)) {
        throw new Error('Automation target changed after user selection.');
      }
      const grant = options.grants.issue({
        grantId: identity(createGrantId(), 'Automation session grant'),
        sessionId,
        extensionId: profile.provider.extensionId,
        profileId: profile.id,
        provider: profile.provider,
        target: selectedTarget,
        mode: input.mode,
        timeoutMs,
        stepBudget,
        conversationId: owner.conversationId,
        runId: owner.runId,
        toolCallId: owner.toolCallId,
      });
      return Object.freeze({ target: selectedTarget, grant });
    },
  });
}

function projectSelectionCandidate(target: AutomationTarget): AutomationTargetSelectionCandidate {
  if (target.kind === 'browser') {
    return Object.freeze({
      kind: target.kind,
      targetKey: target.targetKey,
      label: target.label,
      origin: target.origin,
      allowedDomains: Object.freeze([...target.allowedDomains]),
    });
  }
  return Object.freeze({
    kind: target.kind,
    targetKey: target.targetKey,
    label: target.label,
    region: Object.freeze({ ...target.region }),
  });
}

function sameProfile(left: AutomationProfile, right: AutomationProfile): boolean {
  return (
    left.id === right.id &&
    sameProvider(left.provider, right.provider) &&
    left.operations.length === right.operations.length &&
    left.operations.every((operation, index) => {
      const candidate = right.operations[index];
      return (
        candidate !== undefined &&
        operation.name === candidate.name &&
        sameOrderedStrings(operation.requiredInputProperties, candidate.requiredInputProperties) &&
        sameOrderedStrings(operation.modes, candidate.modes) &&
        operation.trait.effect === candidate.trait.effect &&
        operation.trait.readOnly === candidate.trait.readOnly &&
        operation.trait.destructive === candidate.trait.destructive &&
        operation.trait.sensitive === candidate.trait.sensitive &&
        operation.trait.requiresApproval === candidate.trait.requiresApproval
      );
    }) &&
    (['observe', 'browse-read', 'interact'] as const).every((mode) =>
      sameOrderedStrings(
        left.requiredPermissions[mode] ?? [],
        right.requiredPermissions[mode] ?? [],
      ),
    )
  );
}

function sameProvider(
  left: AutomationProfile['provider'],
  right: AutomationProfile['provider'],
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

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function boundedInteger(value: unknown, minimum: number, maximum: number, label: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function identity(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim() ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)
  ) {
    throw new Error(`${label} identity is invalid.`);
  }
  return value;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Automation authorization aborted.');
}
