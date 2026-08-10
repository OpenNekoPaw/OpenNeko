import {
  parseAutomationActionApproval,
  parseAutomationActionRequest,
  parseAutomationProfile,
  parseAutomationProviderInspection,
  parseAutomationSessionGrant,
  parseAutomationSessionRequest,
  parseAutomationTarget,
  sameAutomationTarget,
  type AutomationActionApproval,
  type AutomationActionRequest,
  type AutomationActionResult,
  type AutomationDiagnosticCode,
  type AutomationEvidence,
  type AutomationMode,
  type AutomationPermission,
  type AutomationProfile,
  type AutomationProviderIdentity,
  type AutomationReviewedOperation,
  type AutomationSessionRequest,
  type AutomationSessionGrant,
  type AutomationSessionSnapshot,
  type AutomationTarget,
} from '@neko/automation-contracts';
import {
  actionsForStatus,
  parseAutomationSessionControlCommand,
  parseAutomationSessionControlScope,
  type AutomationSessionControlCommand,
  type AutomationSessionControlProjection,
  type AutomationSessionEvidenceStatus,
  type AutomationSessionPhase,
} from '@neko/automation-contracts/session-control';
import {
  qualifyAutomationProviderProfile,
  type AutomationQualificationDiagnostic,
} from './qualification';

export * from './browser-use';
export * from './computer-use';
export * from './cua-driver-targets';
export * from './endpoint-management';
export * from './mcp-provider';
export * from './permission-management';
export * from './qualification';
export * from './schema-digest';
export * from './session-authorization';
export * from './session-owned-mcp-runtime';
export * from './target-selection-coordinator';
export * from './transient-observation-store';

export interface AutomationExtensionRuntimePort {
  isEnabled(extensionId: string): Promise<boolean>;
}

export interface AutomationSessionGrantPort {
  /** Consume one user-issued grant. A grant is never reusable, including after launch failure. */
  consume(grant: AutomationSessionGrant): Promise<boolean>;
}

export interface AutomationSessionGrantAuthority extends AutomationSessionGrantPort {
  /** Called only by a Host path that has completed explicit user authorization. */
  issue(input: unknown): AutomationSessionGrant;
  revoke(grantId: string): boolean;
}

export function createAutomationSessionGrantAuthority(): AutomationSessionGrantAuthority {
  const grants = new Map<string, AutomationSessionGrant>();
  return {
    issue(input) {
      const grant = parseAutomationSessionGrant(input);
      if (grants.has(grant.grantId)) {
        throw new Error(`Automation session grant '${grant.grantId}' already exists.`);
      }
      grants.set(grant.grantId, grant);
      return grant;
    },
    async consume(input) {
      const grant = parseAutomationSessionGrant(input);
      const issued = grants.get(grant.grantId);
      if (!issued || !sameSessionGrant(issued, grant)) return false;
      grants.delete(grant.grantId);
      return true;
    },
    revoke(grantId) {
      return grants.delete(grantId);
    },
  };
}

export interface AutomationHostPermissionPort {
  query(input: {
    readonly provider: AutomationProviderIdentity;
    readonly target: AutomationTarget;
    readonly permission: AutomationPermission;
  }): Promise<'granted' | 'denied' | 'not-determined' | 'unsupported'>;
}

export interface AutomationTransientObservationPort {
  publish(input: {
    readonly sessionId: string;
    readonly actionId: string;
    readonly data: Uint8Array;
    readonly mimeType: string;
    readonly width: number;
    readonly height: number;
  }): Promise<{ readonly receiptId: string }>;
}

export interface AutomationProviderExecutionResult {
  readonly text?: string;
  readonly structuredContent?: Readonly<Record<string, unknown>>;
  readonly observation?: {
    readonly data: Uint8Array;
    readonly mimeType: string;
    readonly width: number;
    readonly height: number;
  };
  readonly mutationVerified?: boolean;
}

export interface AutomationProviderPort {
  readonly identity: AutomationProviderIdentity;
  inspect(signal?: AbortSignal): Promise<unknown>;
  openSession(input: {
    readonly sessionId: string;
    readonly target: AutomationTarget;
    readonly mode: AutomationMode;
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
  }): Promise<{ readonly providerSessionId: string }>;
  revalidateTarget(input: {
    readonly providerSessionId: string;
    readonly expected: AutomationTarget;
    readonly signal?: AbortSignal;
  }): Promise<AutomationTarget>;
  execute(input: {
    readonly providerSessionId: string;
    readonly operation: string;
    readonly arguments: Readonly<Record<string, unknown>>;
    readonly signal?: AbortSignal;
  }): Promise<AutomationProviderExecutionResult>;
  closeSession(providerSessionId: string): Promise<void>;
}

export interface BrowserAutomationProviderPort extends AutomationProviderPort {
  readonly identity: AutomationProviderIdentity & { readonly kind: 'browser' };
}

export interface ComputerAutomationProviderPort extends AutomationProviderPort {
  readonly identity: AutomationProviderIdentity & { readonly kind: 'computer' };
}

export interface AutomationActionApprovalProjection {
  readonly actionId: string;
  readonly sessionId: string;
  readonly operation: string;
  readonly target: AutomationTarget;
  readonly mode: AutomationMode;
  readonly effect: AutomationReviewedOperation['trait']['effect'];
  readonly sensitive: boolean;
  readonly destructive: boolean;
  readonly remainingSteps: number;
}

export class AutomationError extends Error {
  constructor(
    readonly code: AutomationDiagnosticCode,
    message: string,
  ) {
    super(message);
    this.name = 'AutomationError';
  }
}

export interface AutomationApplicationService {
  listQualificationDiagnostics(): readonly AutomationQualificationDiagnostic[];
  listAvailableOperations(profileId: string): readonly AutomationReviewedOperation[];
  listOwnedSessions(extensionId: string): readonly AutomationSessionSnapshot[];
  listSessionControls(scope: unknown): readonly AutomationSessionControlProjection[];
  controlSession(input: unknown): Promise<void>;
  subscribeSessionControls(listener: () => void): () => void;
  openSession(input: unknown, signal?: AbortSignal): Promise<AutomationSessionSnapshot>;
  readSession(sessionId: string): AutomationSessionSnapshot | undefined;
  prepareAction(input: unknown, signal?: AbortSignal): Promise<AutomationActionApprovalProjection>;
  executeAction(
    input: unknown,
    approval?: unknown,
    signal?: AbortSignal,
  ): Promise<AutomationActionResult>;
  pauseSession(sessionId: string): AutomationSessionSnapshot;
  resumeSession(sessionId: string, target: unknown): Promise<AutomationSessionSnapshot>;
  stopSession(sessionId: string): Promise<AutomationSessionSnapshot>;
  takeOverSession(sessionId: string): Promise<AutomationSessionSnapshot>;
}

export async function createAutomationApplicationService(options: {
  readonly profiles: readonly unknown[];
  readonly providers: readonly AutomationProviderPort[];
  readonly extensionRuntime: AutomationExtensionRuntimePort;
  readonly sessionGrants: AutomationSessionGrantPort;
  readonly hostPermissions: AutomationHostPermissionPort;
  readonly transientObservations: AutomationTransientObservationPort;
}): Promise<AutomationApplicationService> {
  const profiles = options.profiles.map(parseAutomationProfile);
  requireUniqueIdentities(
    profiles.map((profile) => profile.id),
    'Automation profile',
  );
  const providers = new Map<string, AutomationProviderPort>();
  for (const provider of options.providers) {
    const key = providerKey(provider.identity);
    if (providers.has(key)) throw new Error(`Automation provider '${key}' is duplicated.`);
    providers.set(key, provider);
  }

  const qualifications = new Map<string, ReadonlyMap<string, AutomationReviewedOperation>>();
  const diagnostics: AutomationQualificationDiagnostic[] = [];
  for (const profile of profiles) {
    const provider = providers.get(providerKey(profile.provider));
    if (!provider) {
      qualifications.set(profile.id, new Map());
      diagnostics.push(
        ...profile.operations.map((operation) => ({
          profileId: profile.id,
          operation: operation.name,
          code: 'provider-unavailable' as const,
        })),
      );
      continue;
    }
    let inspection;
    try {
      inspection = parseAutomationProviderInspection(await provider.inspect());
    } catch {
      qualifications.set(profile.id, new Map());
      diagnostics.push(
        ...profile.operations.map((operation) => ({
          profileId: profile.id,
          operation: operation.name,
          code: 'provider-unavailable' as const,
        })),
      );
      continue;
    }
    const qualification = qualifyAutomationProviderProfile(profile, inspection);
    const available = new Map(
      qualification.availableOperations.map((operation) => [operation.name, operation]),
    );
    diagnostics.push(...qualification.diagnostics);
    qualifications.set(profile.id, available);
  }

  return new DefaultAutomationApplicationService(
    new Map(profiles.map((profile) => [profile.id, profile])),
    providers,
    qualifications,
    Object.freeze(diagnostics),
    options.extensionRuntime,
    options.sessionGrants,
    options.hostPermissions,
    options.transientObservations,
  );
}

interface RuntimeSession {
  readonly request: AutomationSessionRequest;
  readonly profile: AutomationProfile;
  readonly provider: AutomationProviderPort;
  readonly providerSessionId: string;
  status: AutomationSessionSnapshot['status'];
  remainingSteps: number;
  phase: AutomationSessionPhase;
  evidenceStatus: AutomationSessionEvidenceStatus;
  lifecycleController: AbortController;
  readonly consumedApprovalIds: Set<string>;
}

class DefaultAutomationApplicationService implements AutomationApplicationService {
  private readonly sessions = new Map<string, RuntimeSession>();
  private readonly consumedGrantIds = new Set<string>();
  private readonly sessionControlListeners = new Set<() => void>();

  constructor(
    private readonly profiles: ReadonlyMap<string, AutomationProfile>,
    private readonly providers: ReadonlyMap<string, AutomationProviderPort>,
    private readonly qualifications: ReadonlyMap<
      string,
      ReadonlyMap<string, AutomationReviewedOperation>
    >,
    private readonly diagnostics: readonly AutomationQualificationDiagnostic[],
    private readonly extensionRuntime: AutomationExtensionRuntimePort,
    private readonly sessionGrants: AutomationSessionGrantPort,
    private readonly hostPermissions: AutomationHostPermissionPort,
    private readonly transientObservations: AutomationTransientObservationPort,
  ) {}

  listQualificationDiagnostics(): readonly AutomationQualificationDiagnostic[] {
    return this.diagnostics;
  }

  listAvailableOperations(profileId: string): readonly AutomationReviewedOperation[] {
    const operations = this.qualifications.get(profileId);
    if (!operations) {
      throw new AutomationError(
        'provider-unavailable',
        `Automation profile '${profileId}' is unavailable.`,
      );
    }
    return Object.freeze([...operations.values()]);
  }

  listOwnedSessions(extensionId: string): readonly AutomationSessionSnapshot[] {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(extensionId)) {
      throw new Error('Automation extension identity is invalid.');
    }
    return Object.freeze(
      [...this.sessions.values()]
        .filter(
          (session) =>
            session.profile.provider.extensionId === extensionId &&
            session.status !== 'stopped' &&
            session.status !== 'taken-over',
        )
        .map(projectSession)
        .sort((left, right) => left.sessionId.localeCompare(right.sessionId)),
    );
  }

  listSessionControls(scope: unknown): readonly AutomationSessionControlProjection[] {
    const parsedScope = parseAutomationSessionControlScope(scope);
    return Object.freeze(
      [...this.sessions.values()]
        .filter(
          (session) =>
            session.request.owner.conversationId === parsedScope.conversationId &&
            (session.status === 'active' || session.status === 'paused'),
        )
        .map(projectSessionControl)
        .sort((left, right) => left.sessionId.localeCompare(right.sessionId)),
    );
  }

  async controlSession(input: unknown): Promise<void> {
    const command = parseAutomationSessionControlCommand(input);
    const session = this.requireSession(command.sessionId);
    validateSessionControlOwner(command, session);
    switch (command.action) {
      case 'pause':
        this.pauseSession(command.sessionId);
        return;
      case 'resume':
        await this.resumeSession(command.sessionId, session.request.target);
        return;
      case 'stop':
        await this.stopSession(command.sessionId);
        return;
      case 'take-over':
        await this.takeOverSession(command.sessionId);
        return;
    }
  }

  subscribeSessionControls(listener: () => void): () => void {
    this.sessionControlListeners.add(listener);
    return () => this.sessionControlListeners.delete(listener);
  }

  async openSession(input: unknown, signal?: AbortSignal): Promise<AutomationSessionSnapshot> {
    const request = parseAutomationSessionRequest(input);
    if (this.sessions.has(request.sessionId)) {
      throw new AutomationError(
        'session-unavailable',
        `Automation session '${request.sessionId}' already exists.`,
      );
    }
    const profile = this.profiles.get(request.profileId);
    if (!profile)
      throw new AutomationError('session-unavailable', 'Automation profile is unavailable.');
    const provider = this.providers.get(providerKey(profile.provider));
    if (!provider)
      throw new AutomationError('provider-unavailable', 'Automation provider is unavailable.');
    validateSessionBinding(request, profile);
    if (!(await this.extensionRuntime.isEnabled(profile.provider.extensionId))) {
      throw new AutomationError('session-grant-invalid', 'Automation extension is not enabled.');
    }
    for (const permission of profile.requiredPermissions[request.mode] ?? []) {
      const state = await this.hostPermissions.query({
        provider: profile.provider,
        target: request.target,
        permission,
      });
      if (state !== 'granted') {
        throw new AutomationError(
          'permission-required',
          `Automation permission '${permission}' is ${state}.`,
        );
      }
    }
    if (this.consumedGrantIds.has(request.grant.grantId)) {
      throw new AutomationError(
        'session-grant-replayed',
        'Automation session grant was already consumed.',
      );
    }
    if (!(await this.sessionGrants.consume(request.grant))) {
      throw new AutomationError(
        'session-grant-invalid',
        'Automation session grant was not issued by the user authorization authority.',
      );
    }
    this.consumedGrantIds.add(request.grant.grantId);
    let opened;
    try {
      opened = await provider.openSession({
        sessionId: request.sessionId,
        target: request.target,
        mode: request.mode,
        timeoutMs: request.timeoutMs,
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      throw providerFailure(error);
    }
    const session: RuntimeSession = {
      request,
      profile,
      provider,
      providerSessionId: requireProviderSessionId(opened.providerSessionId),
      status: 'active',
      remainingSteps: request.stepBudget,
      phase: 'idle',
      evidenceStatus: 'none',
      lifecycleController: new AbortController(),
      consumedApprovalIds: new Set(),
    };
    this.sessions.set(request.sessionId, session);
    this.notifySessionControls();
    return projectSession(session);
  }

  readSession(sessionId: string): AutomationSessionSnapshot | undefined {
    const session = this.sessions.get(sessionId);
    return session ? projectSession(session) : undefined;
  }

  async prepareAction(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<AutomationActionApprovalProjection> {
    const request = parseAutomationActionRequest(input);
    const { session, operation } = this.requireExecutableAction(request);
    if (!operation.trait.requiresApproval) {
      throw new AutomationError('approval-invalid', 'Automation action does not require approval.');
    }
    await this.revalidate(session, signal);
    return {
      actionId: request.actionId,
      sessionId: request.sessionId,
      operation: request.operation,
      target: session.request.target,
      mode: session.request.mode,
      effect: operation.trait.effect,
      sensitive: operation.trait.sensitive,
      destructive: operation.trait.destructive,
      remainingSteps: session.remainingSteps,
    };
  }

  async executeAction(
    input: unknown,
    approval?: unknown,
    signal?: AbortSignal,
  ): Promise<AutomationActionResult> {
    const request = parseAutomationActionRequest(input);
    const { session, operation } = this.requireExecutableAction(request);
    let parsedApproval: AutomationActionApproval | undefined;
    if (operation.trait.requiresApproval) {
      if (approval === undefined) {
        throw new AutomationError('approval-required', 'Automation action approval is required.');
      }
      parsedApproval = parseAutomationActionApproval(approval);
      validateApproval(parsedApproval, request, session);
      if (session.consumedApprovalIds.has(parsedApproval.approvalId)) {
        throw new AutomationError(
          'approval-replayed',
          'Automation action approval was already consumed.',
        );
      }
      if (!parsedApproval.approved) {
        throw new AutomationError('approval-invalid', 'Automation action was denied.');
      }
    } else if (approval !== undefined) {
      throw new AutomationError('approval-invalid', 'Unexpected Automation action approval.');
    }
    if (parsedApproval) session.consumedApprovalIds.add(parsedApproval.approvalId);
    await this.revalidatePermissions(session);
    await this.revalidate(session, signal);
    session.remainingSteps -= 1;
    session.phase = operation.trait.readOnly ? 'observation' : 'action';
    session.evidenceStatus = 'none';
    this.notifySessionControls();
    let providerResult: AutomationProviderExecutionResult;
    try {
      providerResult = await session.provider.execute({
        providerSessionId: session.providerSessionId,
        operation: operation.name,
        arguments: request.arguments,
        signal: combineAbortSignals(signal, session.lifecycleController.signal),
      });
    } catch (error) {
      if (session.status !== 'active') {
        throw new AutomationError(
          'session-not-active',
          'Automation session stopped while the provider action was running.',
        );
      }
      this.markEvidenceFailed(session);
      throw providerFailure(error);
    }
    this.requireActiveSession(session);
    if (!operation.trait.readOnly && providerResult.mutationVerified !== true) {
      this.markEvidenceFailed(session);
      throw new AutomationError(
        'provider-failed',
        'Automation provider did not return independent mutation evidence.',
      );
    }
    let evidence: readonly AutomationEvidence[];
    try {
      evidence = await this.projectEvidence(request, session, operation, providerResult);
    } catch (error) {
      if (session.status !== 'active') {
        throw new AutomationError(
          'session-not-active',
          'Automation session stopped before evidence projection completed.',
        );
      }
      this.markEvidenceFailed(session);
      throw error;
    }
    this.requireActiveSession(session);
    session.phase = 'idle';
    session.evidenceStatus = evidence.length === 0 ? 'none' : 'available';
    this.notifySessionControls();
    return {
      actionId: request.actionId,
      session: projectSession(session),
      evidence,
    };
  }

  pauseSession(sessionId: string): AutomationSessionSnapshot {
    const session = this.requireSession(sessionId);
    if (session.status !== 'active') {
      throw new AutomationError('session-not-active', 'Automation session is not active.');
    }
    session.status = 'paused';
    session.phase = 'idle';
    session.lifecycleController.abort(
      new AutomationError('session-not-active', 'Automation session was paused by the user.'),
    );
    this.notifySessionControls();
    return projectSession(session);
  }

  async resumeSession(sessionId: string, target: unknown): Promise<AutomationSessionSnapshot> {
    const session = this.requireSession(sessionId);
    if (session.status !== 'paused') {
      throw new AutomationError('session-not-active', 'Automation session is not paused.');
    }
    const parsedTarget = parseAutomationTarget(target);
    if (!sameAutomationTarget(session.request.target, parsedTarget)) {
      throw new AutomationError(
        'target-mismatch',
        'Automation resume target does not match the session.',
      );
    }
    session.lifecycleController = new AbortController();
    await this.revalidate(session);
    session.status = 'active';
    this.notifySessionControls();
    return projectSession(session);
  }

  async stopSession(sessionId: string): Promise<AutomationSessionSnapshot> {
    return this.closeSession(sessionId, 'stopped');
  }

  async takeOverSession(sessionId: string): Promise<AutomationSessionSnapshot> {
    return this.closeSession(sessionId, 'taken-over');
  }

  private requireExecutableAction(request: AutomationActionRequest): {
    readonly session: RuntimeSession;
    readonly operation: AutomationReviewedOperation;
  } {
    const session = this.requireSession(request.sessionId);
    if (session.status !== 'active') {
      throw new AutomationError('session-not-active', 'Automation session is not active.');
    }
    if (session.remainingSteps <= 0) {
      throw new AutomationError('step-budget-exhausted', 'Automation step budget is exhausted.');
    }
    const operation = this.qualifications.get(session.profile.id)?.get(request.operation);
    if (!operation || !operation.modes.includes(session.request.mode)) {
      throw new AutomationError(
        'operation-unreviewed',
        'Automation operation is not reviewed for this mode.',
      );
    }
    return { session, operation };
  }

  private requireSession(sessionId: string): RuntimeSession {
    const session = this.sessions.get(sessionId);
    if (!session)
      throw new AutomationError('session-unavailable', 'Automation session is unavailable.');
    return session;
  }

  private requireActiveSession(session: RuntimeSession): void {
    if (session.status !== 'active') {
      throw new AutomationError('session-not-active', 'Automation session is not active.');
    }
  }

  private async revalidate(session: RuntimeSession, signal?: AbortSignal): Promise<void> {
    let actual;
    try {
      actual = await session.provider.revalidateTarget({
        providerSessionId: session.providerSessionId,
        expected: session.request.target,
        signal: combineAbortSignals(signal, session.lifecycleController.signal),
      });
    } catch (error) {
      if (session.status !== 'active' && session.status !== 'paused') {
        throw new AutomationError(
          'session-not-active',
          'Automation session stopped during target revalidation.',
        );
      }
      this.pauseAfterBoundaryFailure(session);
      throw providerFailure(error);
    }
    if (!sameAutomationTarget(session.request.target, actual)) {
      this.pauseAfterBoundaryFailure(session);
      throw new AutomationError('target-mismatch', 'Automation target changed before input.');
    }
  }

  private async revalidatePermissions(session: RuntimeSession): Promise<void> {
    for (const permission of session.profile.requiredPermissions[session.request.mode] ?? []) {
      let state: Awaited<ReturnType<AutomationHostPermissionPort['query']>>;
      try {
        state = await this.hostPermissions.query({
          provider: session.profile.provider,
          target: session.request.target,
          permission,
        });
      } catch (error) {
        this.pauseAfterBoundaryFailure(session);
        throw new AutomationError(
          'permission-required',
          `Automation permission '${permission}' could not be verified: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (state !== 'granted') {
        this.pauseAfterBoundaryFailure(session);
        throw new AutomationError(
          'permission-required',
          `Automation permission '${permission}' is ${state}.`,
        );
      }
    }
  }

  private async projectEvidence(
    request: AutomationActionRequest,
    session: RuntimeSession,
    operation: AutomationReviewedOperation,
    result: AutomationProviderExecutionResult,
  ): Promise<readonly AutomationEvidence[]> {
    const evidence: AutomationEvidence[] = [];
    if (result.text !== undefined) evidence.push({ kind: 'text', text: result.text });
    if (result.structuredContent !== undefined) {
      evidence.push({ kind: 'structured', data: result.structuredContent });
    }
    if (result.observation) {
      const receipt = await this.transientObservations.publish({
        sessionId: request.sessionId,
        actionId: request.actionId,
        ...result.observation,
      });
      evidence.push({
        kind: 'transient-image',
        receiptId: requireProviderSessionId(receipt.receiptId),
        mimeType: result.observation.mimeType,
        width: result.observation.width,
        height: result.observation.height,
      });
    }
    if (!operation.trait.readOnly) {
      evidence.push({
        kind: 'mutation',
        operation: operation.name,
        targetKey: session.request.target.targetKey,
        verified: true,
      });
    }
    return Object.freeze(evidence);
  }

  private async closeSession(
    sessionId: string,
    status: 'stopped' | 'taken-over',
  ): Promise<AutomationSessionSnapshot> {
    const session = this.requireSession(sessionId);
    if (session.status === 'stopped' || session.status === 'taken-over') {
      throw new AutomationError('session-not-active', 'Automation session is already closed.');
    }
    session.status = status;
    session.phase = 'idle';
    session.lifecycleController.abort(
      new AutomationError(
        'session-not-active',
        status === 'taken-over'
          ? 'Automation session control was taken over by the user.'
          : 'Automation session was stopped by the user.',
      ),
    );
    this.notifySessionControls();
    try {
      await session.provider.closeSession(session.providerSessionId);
    } catch (error) {
      session.status = 'paused';
      session.evidenceStatus = 'failed';
      session.lifecycleController = new AbortController();
      this.notifySessionControls();
      throw providerFailure(error);
    }
    return projectSession(session);
  }

  private pauseAfterBoundaryFailure(session: RuntimeSession): void {
    if (session.status === 'active') {
      session.status = 'paused';
      session.phase = 'idle';
      this.notifySessionControls();
    }
  }

  private markEvidenceFailed(session: RuntimeSession): void {
    session.phase = 'idle';
    session.evidenceStatus = 'failed';
    this.notifySessionControls();
  }

  private notifySessionControls(): void {
    for (const listener of this.sessionControlListeners) listener();
  }
}

function validateSessionBinding(
  request: AutomationSessionRequest,
  profile: AutomationProfile,
): void {
  const grant = request.grant;
  if (
    grant.sessionId !== request.sessionId ||
    grant.extensionId !== profile.provider.extensionId ||
    grant.profileId !== request.profileId ||
    !sameProviderIdentity(grant.provider, profile.provider) ||
    !sameAutomationTarget(grant.target, request.target) ||
    grant.mode !== request.mode ||
    grant.timeoutMs !== request.timeoutMs ||
    grant.stepBudget !== request.stepBudget ||
    grant.conversationId !== request.owner.conversationId ||
    grant.runId !== request.owner.runId ||
    grant.toolCallId !== request.owner.toolCallId ||
    request.target.kind !== profile.provider.kind
  ) {
    throw new AutomationError(
      'session-grant-invalid',
      'Automation session grant does not match the exact request.',
    );
  }
}

function validateApproval(
  approval: AutomationActionApproval,
  request: AutomationActionRequest,
  session: RuntimeSession,
): void {
  if (
    approval.actionId !== request.actionId ||
    approval.sessionId !== request.sessionId ||
    approval.operation !== request.operation ||
    approval.targetKey !== session.request.target.targetKey
  ) {
    throw new AutomationError(
      'approval-invalid',
      'Automation action approval does not match the exact action.',
    );
  }
}

function projectSession(session: RuntimeSession): AutomationSessionSnapshot {
  return {
    sessionId: session.request.sessionId,
    profileId: session.profile.id,
    provider: session.profile.provider,
    target: session.request.target,
    mode: session.request.mode,
    status: session.status,
    remainingSteps: session.remainingSteps,
  };
}

function projectSessionControl(session: RuntimeSession): AutomationSessionControlProjection {
  if (session.status !== 'active' && session.status !== 'paused') {
    throw new AutomationError(
      'session-not-active',
      'Closed Automation sessions do not have live controls.',
    );
  }
  return {
    sessionId: session.request.sessionId,
    profileId: session.profile.id,
    provider: {
      extensionId: session.profile.provider.extensionId,
      providerId: session.profile.provider.providerId,
      kind: session.profile.provider.kind,
      upstreamRelease: session.profile.provider.upstreamRelease,
    },
    target: {
      kind: session.request.target.kind,
      targetKey: session.request.target.targetKey,
      label: session.request.target.label,
    },
    mode: session.request.mode,
    status: session.status,
    remainingSteps: session.remainingSteps,
    phase: session.phase,
    evidenceStatus: session.evidenceStatus,
    owner: session.request.owner,
    availableActions: actionsForStatus(session.status),
  };
}

function validateSessionControlOwner(
  command: AutomationSessionControlCommand,
  session: RuntimeSession,
): void {
  const owner = session.request.owner;
  if (
    command.owner.conversationId !== owner.conversationId ||
    command.owner.runId !== owner.runId ||
    command.owner.toolCallId !== owner.toolCallId
  ) {
    throw new AutomationError(
      'session-unavailable',
      'Automation session control owner does not match the exact Tool Call.',
    );
  }
}

function combineAbortSignals(
  external: AbortSignal | undefined,
  lifecycle: AbortSignal,
): AbortSignal {
  return external === undefined ? lifecycle : AbortSignal.any([external, lifecycle]);
}

function providerKey(identity: AutomationProviderIdentity): string {
  const source = identity.deliverySource;
  return `${identity.extensionId}:${identity.providerId}:${
    source.kind === 'user-managed-endpoint' ? `${source.kind}:${source.endpointId}` : source.kind
  }`;
}

function sameProviderIdentity(
  left: AutomationProviderIdentity,
  right: AutomationProviderIdentity,
): boolean {
  return (
    left.extensionId === right.extensionId &&
    left.providerId === right.providerId &&
    left.kind === right.kind &&
    left.upstreamRelease === right.upstreamRelease &&
    sameProviderDeliverySource(left.deliverySource, right.deliverySource)
  );
}

function sameProviderDeliverySource(
  left: AutomationProviderIdentity['deliverySource'],
  right: AutomationProviderIdentity['deliverySource'],
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'user-managed-endpoint' && right.kind === 'user-managed-endpoint') {
    return left.endpointId === right.endpointId;
  }
  return true;
}

function sameSessionGrant(left: AutomationSessionGrant, right: AutomationSessionGrant): boolean {
  return (
    left.grantId === right.grantId &&
    left.sessionId === right.sessionId &&
    left.extensionId === right.extensionId &&
    left.profileId === right.profileId &&
    sameProviderIdentity(left.provider, right.provider) &&
    sameAutomationTarget(left.target, right.target) &&
    left.mode === right.mode &&
    left.timeoutMs === right.timeoutMs &&
    left.stepBudget === right.stepBudget &&
    left.conversationId === right.conversationId &&
    left.runId === right.runId &&
    left.toolCallId === right.toolCallId
  );
}

function requireUniqueIdentities(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length)
    throw new Error(`${label} identities are duplicated.`);
}

function requireProviderSessionId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)) {
    throw new AutomationError(
      'provider-failed',
      'Automation provider returned an invalid opaque identity.',
    );
  }
  return value;
}

function providerFailure(error: unknown): AutomationError {
  return new AutomationError(
    'provider-failed',
    `Automation provider failed: ${error instanceof Error ? error.message : String(error)}`,
  );
}
