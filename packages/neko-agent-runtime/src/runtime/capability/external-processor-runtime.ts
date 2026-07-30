import type {
  ExternalProcessorCatalog,
  ExternalProcessorDiagnostic,
  ExternalProcessorInvocation,
  ExternalProcessorInvocationInputBinding,
  ExternalProcessorInvocationOutputBinding,
  ExternalProcessorManifest,
  ExternalProcessorParamDeclaration,
  ExternalProcessorRegistration,
  ExternalProcessorRegistry,
  ExternalProcessorRegistryChangeListener,
  ExternalProcessorRegistryContext,
  ExternalProcessorRegistrySubscription,
  ExternalProcessorResult,
  ExternalProcessorRunIdentity,
} from '@neko-agent/types';
import { isContentLocator, type ResourceRef } from '@neko/shared';

export interface AgentExternalProcessorRuntimeOptions {
  readonly registry: ExternalProcessorRegistry;
  readonly defaultCatalogContext?: ExternalProcessorRegistryContext;
  readonly defaultExecutionContext?: ExternalProcessorRegistryContext;
  readonly generateProcessorRunId?: () => string;
  readonly generateStageId?: () => string;
}

export interface AgentExternalProcessorRuntime {
  list(context?: ExternalProcessorRegistryContext): ExternalProcessorCatalog;
  resolve(
    processorId: string,
    context?: ExternalProcessorRegistryContext,
  ): ExternalProcessorRegistration | ExternalProcessorDiagnostic;
  onDidChange(
    listener: ExternalProcessorRegistryChangeListener,
  ): ExternalProcessorRegistrySubscription;
  planInvocation(input: AgentExternalProcessorPlanInput): AgentExternalProcessorPlanResult;
  projectResult(input: AgentExternalProcessorResultInput): AgentExternalProcessorResultProjection;
  startChain(input: AgentExternalProcessorChainStartInput): AgentExternalProcessorChainRun;
  planChainStage(
    input: AgentExternalProcessorChainStageInput,
  ): AgentExternalProcessorChainStagePlanResult;
  continueChainAfterApproval(
    input: AgentExternalProcessorChainApprovalContinuationInput,
  ): AgentExternalProcessorChainRun | ExternalProcessorDiagnostic;
  replanChainForTargetChange(
    input: AgentExternalProcessorChainTargetChangeInput,
  ): AgentExternalProcessorChainRun;
  getChainRun(processorRunId: string): AgentExternalProcessorChainRun | undefined;
}

export interface AgentExternalProcessorPlanInput {
  readonly processorId: string;
  readonly context?: ExternalProcessorRegistryContext;
  readonly run?: Partial<ExternalProcessorRunIdentity>;
  readonly inputs: readonly ExternalProcessorInvocationInputBinding[];
  readonly outputs?: readonly ExternalProcessorInvocationOutputBinding[];
  readonly params?: Readonly<Record<string, string | number | boolean>>;
}

export type AgentExternalProcessorPlanResult =
  AgentExternalProcessorReadyPlan | AgentExternalProcessorBlockedPlan;

export interface AgentExternalProcessorReadyPlan {
  readonly status: 'ready';
  readonly registration: ExternalProcessorRegistration;
  readonly invocation: ExternalProcessorInvocation;
  readonly diagnostics: readonly ExternalProcessorDiagnostic[];
}

export interface AgentExternalProcessorBlockedPlan {
  readonly status: 'blocked';
  readonly registration?: ExternalProcessorRegistration;
  readonly diagnostics: readonly ExternalProcessorDiagnostic[];
}

export interface AgentExternalProcessorResultInput {
  readonly invocation: ExternalProcessorInvocation;
  readonly result: ExternalProcessorResult;
}

export interface DeveloperModeTemporaryProcessorRequestInput {
  readonly command: string;
  readonly cwdRoot?: ExternalProcessorManifest['policy']['cwdRoot'];
  readonly allowedInputRoots?: ExternalProcessorManifest['policy']['allowedInputRoots'];
  readonly timeoutMs?: number;
  readonly allowNetwork?: boolean;
  readonly run?: Partial<ExternalProcessorRunIdentity>;
}

export interface DeveloperModeTemporaryProcessorRequest {
  readonly manifest: ExternalProcessorManifest;
  readonly invocation: ExternalProcessorInvocation;
  readonly diagnostics: readonly ExternalProcessorDiagnostic[];
}

export interface AgentExternalProcessorResultProjection {
  readonly status: ExternalProcessorResult['status'];
  readonly processorId: string;
  readonly registrationId: string;
  readonly registrationRevision: number;
  readonly run: ExternalProcessorRunIdentity;
  readonly outputs: ExternalProcessorResult['outputs'];
  readonly diagnostics: readonly ExternalProcessorDiagnostic[];
  readonly exitCode?: number;
}

export interface AgentExternalProcessorChainStartInput {
  readonly targetKey: string;
  readonly parentProcessorRunId?: string;
  readonly parentResourceRef?: ResourceRef;
}

export interface AgentExternalProcessorChainRun {
  readonly processorRunId: string;
  readonly targetKey: string;
  readonly status: 'running' | 'waiting-approval' | 'completed' | 'failed' | 'cancelled';
  readonly stages: readonly AgentExternalProcessorChainStageRecord[];
  readonly parentProcessorRunId?: string;
  readonly parentResourceRef?: ResourceRef;
}

export interface AgentExternalProcessorChainStageRecord {
  readonly stageId: string;
  readonly processorId: string;
  readonly attempt: number;
  readonly status: 'planned' | 'waiting-approval' | 'ready' | 'succeeded' | 'failed' | 'cancelled';
  readonly invocation?: ExternalProcessorInvocation;
  readonly diagnostics: readonly ExternalProcessorDiagnostic[];
  readonly approvalToken?: string;
}

export interface AgentExternalProcessorChainStageInput extends Omit<
  AgentExternalProcessorPlanInput,
  'run'
> {
  readonly processorRunId: string;
  readonly stageId?: string;
  readonly attempt?: number;
  readonly parentResourceRef?: ResourceRef;
  readonly requireApprovalContinuation?: boolean;
  readonly approvalToken?: string;
}

export type AgentExternalProcessorChainStagePlanResult =
  | {
      readonly status: 'ready';
      readonly run: AgentExternalProcessorChainRun;
      readonly stage: AgentExternalProcessorChainStageRecord;
      readonly plan: AgentExternalProcessorReadyPlan;
    }
  | {
      readonly status: 'waiting-approval';
      readonly run: AgentExternalProcessorChainRun;
      readonly stage: AgentExternalProcessorChainStageRecord;
      readonly plan: AgentExternalProcessorReadyPlan;
    }
  | {
      readonly status: 'blocked';
      readonly run?: AgentExternalProcessorChainRun;
      readonly diagnostics: readonly ExternalProcessorDiagnostic[];
    };

export interface AgentExternalProcessorChainApprovalContinuationInput {
  readonly processorRunId: string;
  readonly stageId: string;
  readonly approvalToken: string;
}

export interface AgentExternalProcessorChainTargetChangeInput {
  readonly previousProcessorRunId: string;
  readonly targetKey: string;
  readonly parentResourceRef?: ResourceRef;
}

export function createAgentExternalProcessorRuntime(
  options: AgentExternalProcessorRuntimeOptions,
): AgentExternalProcessorRuntime {
  return new DefaultAgentExternalProcessorRuntime(options);
}

export function createDeveloperModeTemporaryProcessorRequest(
  input: DeveloperModeTemporaryProcessorRequestInput,
): DeveloperModeTemporaryProcessorRequest {
  const command = input.command.trim();
  if (!command) {
    return {
      manifest: createDeveloperModeManifest({
        command: '',
        allowNetwork: input.allowNetwork,
        allowedInputRoots: input.allowedInputRoots,
        cwdRoot: input.cwdRoot,
        timeoutMs: input.timeoutMs,
      }),
      invocation: createDeveloperModeInvocation(
        '',
        input.run,
        'developer-mode-temp-run',
        'developer-mode-temp-stage',
      ),
      diagnostics: [
        diagnostic(
          'missing-required-field',
          'error',
          'Developer Mode command is required.',
          'command',
        ),
      ],
    };
  }

  const manifest = createDeveloperModeManifest({
    command,
    allowNetwork: input.allowNetwork,
    allowedInputRoots: input.allowedInputRoots,
    cwdRoot: input.cwdRoot,
    timeoutMs: input.timeoutMs,
  });
  return {
    manifest,
    invocation: createDeveloperModeInvocation(
      command,
      input.run,
      `developer-mode-run-${stableCommandHash(command)}`,
      'developer-mode-stage-1',
    ),
    diagnostics: [],
  };
}

class DefaultAgentExternalProcessorRuntime implements AgentExternalProcessorRuntime {
  private readonly registry: ExternalProcessorRegistry;
  private readonly defaultCatalogContext?: ExternalProcessorRegistryContext;
  private readonly defaultExecutionContext?: ExternalProcessorRegistryContext;
  private readonly generateProcessorRunId: () => string;
  private readonly generateStageId: () => string;
  private readonly chainRuns = new Map<string, AgentExternalProcessorChainRun>();
  private processorRunSequence = 0;
  private stageSequence = 0;

  constructor(options: AgentExternalProcessorRuntimeOptions) {
    this.registry = options.registry;
    this.defaultCatalogContext = options.defaultCatalogContext;
    this.defaultExecutionContext = options.defaultExecutionContext;
    this.generateProcessorRunId =
      options.generateProcessorRunId ?? (() => `processor-run-${++this.processorRunSequence}`);
    this.generateStageId = options.generateStageId ?? (() => `stage-${++this.stageSequence}`);
  }

  list(context?: ExternalProcessorRegistryContext): ExternalProcessorCatalog {
    return this.registry.list(mergeRegistryContext(this.defaultCatalogContext, context));
  }

  resolve(
    processorId: string,
    context?: ExternalProcessorRegistryContext,
  ): ExternalProcessorRegistration | ExternalProcessorDiagnostic {
    return this.registry.resolve(
      processorId,
      mergeRegistryContext(this.defaultExecutionContext, context),
    );
  }

  onDidChange(
    listener: ExternalProcessorRegistryChangeListener,
  ): ExternalProcessorRegistrySubscription {
    return this.registry.onDidChange(listener);
  }

  planInvocation(input: AgentExternalProcessorPlanInput): AgentExternalProcessorPlanResult {
    const resolved = this.resolve(input.processorId, input.context);
    if (isProcessorDiagnostic(resolved)) {
      return { status: 'blocked', diagnostics: [resolved] };
    }

    const outputs = input.outputs ?? createDefaultOutputBindings(resolved);
    const diagnostics = [
      ...validateInvocationInputs(resolved, input.inputs),
      ...validateInvocationOutputs(resolved, outputs),
      ...validateInvocationParams(resolved, input.params),
    ];
    if (diagnostics.some((item) => item.severity === 'error')) {
      return { status: 'blocked', registration: resolved, diagnostics };
    }

    const run = createRunIdentity(input.run, this.generateProcessorRunId, this.generateStageId);
    return {
      status: 'ready',
      registration: resolved,
      invocation: {
        processorId: resolved.id,
        registrationId: resolved.registrationId,
        registrationRevision: resolved.revision,
        run,
        inputs: [...input.inputs],
        outputs,
        ...(input.params ? { params: { ...input.params } } : {}),
      },
      diagnostics,
    };
  }

  projectResult(input: AgentExternalProcessorResultInput): AgentExternalProcessorResultProjection {
    const diagnostics = [
      ...input.result.diagnostics,
      ...validateResultMatchesInvocation(input.invocation, input.result),
    ];
    return {
      status: input.result.status,
      processorId: input.result.processorId,
      registrationId: input.result.registrationId,
      registrationRevision: input.result.registrationRevision,
      run: input.result.run,
      outputs: input.result.outputs.map((output) => ({ ...output })),
      diagnostics,
      ...(input.result.exitCode !== undefined ? { exitCode: input.result.exitCode } : {}),
    };
  }

  startChain(input: AgentExternalProcessorChainStartInput): AgentExternalProcessorChainRun {
    const run: AgentExternalProcessorChainRun = {
      processorRunId: this.generateProcessorRunId(),
      targetKey: input.targetKey,
      status: 'running',
      stages: [],
      ...(input.parentProcessorRunId ? { parentProcessorRunId: input.parentProcessorRunId } : {}),
      ...(input.parentResourceRef ? { parentResourceRef: input.parentResourceRef } : {}),
    };
    this.chainRuns.set(run.processorRunId, run);
    return run;
  }

  planChainStage(
    input: AgentExternalProcessorChainStageInput,
  ): AgentExternalProcessorChainStagePlanResult {
    const run = this.chainRuns.get(input.processorRunId);
    if (!run) {
      return {
        status: 'blocked',
        diagnostics: [
          diagnostic(
            'disabled-processor',
            'error',
            `Processor run "${input.processorRunId}" is not active.`,
            'processorRunId',
          ),
        ],
      };
    }
    if (isShellPipelineProcessorRequest(input.processorId)) {
      return {
        status: 'blocked',
        run,
        diagnostics: [
          diagnostic(
            'disabled-processor',
            'error',
            'Processor chains must use explicit registered processor ids, not shell pipelines.',
            'processorId',
          ),
        ],
      };
    }

    const stageId = input.stageId ?? this.generateStageId();
    const attempt = input.attempt ?? nextAttemptForStage(run, stageId);
    const plan = this.planInvocation({
      processorId: input.processorId,
      context: input.context,
      inputs: input.inputs,
      outputs: input.outputs,
      params: input.params,
      run: {
        processorRunId: run.processorRunId,
        stageId,
        attempt,
        ...(run.parentProcessorRunId ? { parentProcessorRunId: run.parentProcessorRunId } : {}),
        ...((input.parentResourceRef ?? run.parentResourceRef)
          ? { parentResourceRef: input.parentResourceRef ?? run.parentResourceRef }
          : {}),
      },
    });
    if (plan.status === 'blocked') {
      const blockedRun = upsertChainStage(run, {
        stageId,
        processorId: input.processorId,
        attempt,
        status: 'failed',
        diagnostics: plan.diagnostics,
      });
      this.chainRuns.set(blockedRun.processorRunId, blockedRun);
      return { status: 'blocked', run: blockedRun, diagnostics: plan.diagnostics };
    }

    const waiting = input.requireApprovalContinuation === true;
    const stage: AgentExternalProcessorChainStageRecord = {
      stageId,
      processorId: input.processorId,
      attempt,
      status: waiting ? 'waiting-approval' : 'ready',
      invocation: plan.invocation,
      diagnostics: plan.diagnostics,
      ...(input.approvalToken ? { approvalToken: input.approvalToken } : {}),
    };
    const nextRun = upsertChainStage(
      {
        ...run,
        status: waiting ? 'waiting-approval' : 'running',
      },
      stage,
    );
    this.chainRuns.set(nextRun.processorRunId, nextRun);
    return {
      status: waiting ? 'waiting-approval' : 'ready',
      run: nextRun,
      stage,
      plan,
    };
  }

  continueChainAfterApproval(
    input: AgentExternalProcessorChainApprovalContinuationInput,
  ): AgentExternalProcessorChainRun | ExternalProcessorDiagnostic {
    const run = this.chainRuns.get(input.processorRunId);
    if (!run) {
      return diagnostic(
        'disabled-processor',
        'error',
        `Processor run "${input.processorRunId}" is not active.`,
        'processorRunId',
      );
    }
    const stage = run.stages.find((item) => item.stageId === input.stageId);
    if (!stage || stage.status !== 'waiting-approval') {
      return diagnostic(
        'disabled-processor',
        'error',
        `Processor stage "${input.stageId}" is not waiting for approval.`,
        'stageId',
      );
    }
    if (stage.approvalToken && stage.approvalToken !== input.approvalToken) {
      return diagnostic(
        'disabled-processor',
        'error',
        `Processor stage "${input.stageId}" approval token does not match.`,
        'approvalToken',
      );
    }

    const nextRun = upsertChainStage({ ...run, status: 'running' }, { ...stage, status: 'ready' });
    this.chainRuns.set(nextRun.processorRunId, nextRun);
    return nextRun;
  }

  replanChainForTargetChange(
    input: AgentExternalProcessorChainTargetChangeInput,
  ): AgentExternalProcessorChainRun {
    const previous = this.chainRuns.get(input.previousProcessorRunId);
    const run = this.startChain({
      targetKey: input.targetKey,
      parentProcessorRunId: input.previousProcessorRunId,
      ...((input.parentResourceRef ?? previous?.parentResourceRef)
        ? { parentResourceRef: input.parentResourceRef ?? previous?.parentResourceRef }
        : {}),
    });
    return run;
  }

  getChainRun(processorRunId: string): AgentExternalProcessorChainRun | undefined {
    return this.chainRuns.get(processorRunId);
  }
}

function mergeRegistryContext(
  defaults: ExternalProcessorRegistryContext | undefined,
  override: ExternalProcessorRegistryContext | undefined,
): ExternalProcessorRegistryContext | undefined {
  if (!defaults && !override) return undefined;
  return {
    ...(defaults ?? {}),
    ...(override ?? {}),
  };
}

function isProcessorDiagnostic(
  value: ExternalProcessorRegistration | ExternalProcessorDiagnostic,
): value is ExternalProcessorDiagnostic {
  return 'code' in value && 'severity' in value;
}

function createDefaultOutputBindings(
  registration: ExternalProcessorRegistration,
): readonly ExternalProcessorInvocationOutputBinding[] {
  return Object.entries(registration.manifest.outputs).map(([slot, declaration]) => ({
    slot,
    ownership: declaration.ownership,
    ...(declaration.pathHint ? { pathHint: declaration.pathHint } : {}),
  }));
}

function createRunIdentity(
  input: Partial<ExternalProcessorRunIdentity> | undefined,
  generateProcessorRunId: () => string,
  generateStageId: () => string,
): ExternalProcessorRunIdentity {
  return {
    processorRunId: input?.processorRunId ?? generateProcessorRunId(),
    stageId: input?.stageId ?? generateStageId(),
    attempt: input?.attempt ?? 1,
    ...(input?.parentProcessorRunId ? { parentProcessorRunId: input.parentProcessorRunId } : {}),
    ...(input?.parentResourceRef ? { parentResourceRef: input.parentResourceRef } : {}),
  };
}

function validateInvocationInputs(
  registration: ExternalProcessorRegistration,
  inputs: readonly ExternalProcessorInvocationInputBinding[],
): readonly ExternalProcessorDiagnostic[] {
  const diagnostics: ExternalProcessorDiagnostic[] = [];
  const declarations = registration.manifest.inputs;
  const providedSlots = new Set(inputs.map((input) => input.slot));

  for (const [slot, declaration] of Object.entries(declarations)) {
    if (declaration.required === true && !providedSlots.has(slot)) {
      diagnostics.push(
        diagnostic(
          'missing-required-field',
          'error',
          `Required processor input "${slot}" was not provided.`,
          `inputs.${slot}`,
        ),
      );
    }
  }

  for (const input of inputs) {
    if (!declarations[input.slot]) {
      diagnostics.push(
        diagnostic(
          'undeclared-template-reference',
          'error',
          `Processor input "${input.slot}" is not declared by the manifest.`,
          `inputs.${input.slot}`,
        ),
      );
    }
    if ('locator' in input && !isContentLocator(input.locator)) {
      diagnostics.push(
        diagnostic(
          'unauthorized-path',
          'error',
          `Processor input "${input.slot}" has an invalid content locator.`,
          `inputs.${input.slot}.locator`,
        ),
      );
    }
  }

  return diagnostics;
}

function validateInvocationOutputs(
  registration: ExternalProcessorRegistration,
  outputs: readonly ExternalProcessorInvocationOutputBinding[],
): readonly ExternalProcessorDiagnostic[] {
  const diagnostics: ExternalProcessorDiagnostic[] = [];
  const declarations = registration.manifest.outputs;
  const allowedOwnerships = new Set(registration.manifest.policy.allowedOutputOwnerships);
  const providedSlots = new Set(outputs.map((output) => output.slot));

  for (const slot of Object.keys(declarations)) {
    if (!providedSlots.has(slot)) {
      diagnostics.push(
        diagnostic(
          'missing-required-field',
          'error',
          `Declared processor output "${slot}" has no Host allocation binding.`,
          `outputs.${slot}`,
        ),
      );
    }
  }

  for (const output of outputs) {
    const declaration = declarations[output.slot];
    if (!declaration) {
      diagnostics.push(
        diagnostic(
          'undeclared-template-reference',
          'error',
          `Processor output "${output.slot}" is not declared by the manifest.`,
          `outputs.${output.slot}`,
        ),
      );
      continue;
    }
    if (!allowedOwnerships.has(output.ownership) || output.ownership !== declaration.ownership) {
      diagnostics.push(
        diagnostic(
          'illegal-output-ownership',
          'error',
          `Processor output "${output.slot}" must use declared ownership "${declaration.ownership}".`,
          `outputs.${output.slot}.ownership`,
        ),
      );
    }
  }

  return diagnostics;
}

function validateInvocationParams(
  registration: ExternalProcessorRegistration,
  params: Readonly<Record<string, string | number | boolean>> | undefined,
): readonly ExternalProcessorDiagnostic[] {
  const diagnostics: ExternalProcessorDiagnostic[] = [];
  const declarations = registration.manifest.params ?? {};
  const provided = params ?? {};

  for (const [slot, declaration] of Object.entries(declarations)) {
    if (
      declaration.required === true &&
      provided[slot] === undefined &&
      declaration.default === undefined
    ) {
      diagnostics.push(
        diagnostic(
          'missing-required-field',
          'error',
          `Required processor parameter "${slot}" was not provided.`,
          `params.${slot}`,
        ),
      );
    }
  }

  for (const [slot, value] of Object.entries(provided)) {
    const declaration = declarations[slot];
    if (!declaration) {
      diagnostics.push(
        diagnostic(
          'undeclared-template-reference',
          'error',
          `Processor parameter "${slot}" is not declared by the manifest.`,
          `params.${slot}`,
        ),
      );
      continue;
    }
    diagnostics.push(...validateParamValue(slot, value, declaration));
  }

  return diagnostics;
}

function validateParamValue(
  slot: string,
  value: string | number | boolean,
  declaration: ExternalProcessorParamDeclaration,
): readonly ExternalProcessorDiagnostic[] {
  const diagnostics: ExternalProcessorDiagnostic[] = [];
  if (!matchesParamType(value, declaration.type)) {
    diagnostics.push(
      diagnostic(
        'invalid-field-type',
        'error',
        `Processor parameter "${slot}" must be ${declaration.type}.`,
        `params.${slot}`,
      ),
    );
  }
  if (declaration.allowed && !declaration.allowed.includes(value)) {
    diagnostics.push(
      diagnostic(
        'invalid-field-type',
        'error',
        `Processor parameter "${slot}" is not one of the allowed values.`,
        `params.${slot}`,
      ),
    );
  }
  return diagnostics;
}

function matchesParamType(
  value: string | number | boolean,
  type: ExternalProcessorParamDeclaration['type'],
): boolean {
  if (type === 'enum') return true;
  return typeof value === type;
}

function validateResultMatchesInvocation(
  invocation: ExternalProcessorInvocation,
  result: ExternalProcessorResult,
): readonly ExternalProcessorDiagnostic[] {
  const diagnostics: ExternalProcessorDiagnostic[] = [];
  if (
    result.processorId !== invocation.processorId ||
    result.registrationId !== invocation.registrationId ||
    result.registrationRevision !== invocation.registrationRevision
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-manifest',
        'error',
        'Processor result does not match the invocation registration snapshot.',
      ),
    );
  }
  if (
    result.run.processorRunId !== invocation.run.processorRunId ||
    result.run.stageId !== invocation.run.stageId ||
    result.run.attempt !== invocation.run.attempt
  ) {
    diagnostics.push(
      diagnostic(
        'invalid-manifest',
        'error',
        'Processor result does not match run/stage identity.',
      ),
    );
  }

  const outputSlots = new Set(invocation.outputs.map((output) => output.slot));
  for (const output of result.outputs) {
    if (!outputSlots.has(output.slot)) {
      diagnostics.push(
        diagnostic(
          'undeclared-template-reference',
          'error',
          `Processor result output "${output.slot}" was not allocated by invocation plan.`,
          `outputs.${output.slot}`,
        ),
      );
    }
    const binding = invocation.outputs.find((item) => item.slot === output.slot);
    if (
      binding &&
      (output.ownership !== binding.ownership || output.output.ownership !== output.ownership)
    ) {
      diagnostics.push(
        diagnostic(
          'illegal-output-ownership',
          'error',
          `Processor result output "${output.slot}" does not match the allocated ownership.`,
          `outputs.${output.slot}.ownership`,
        ),
      );
    }
  }
  return diagnostics;
}

function createDeveloperModeManifest(input: {
  readonly command: string;
  readonly cwdRoot?: ExternalProcessorManifest['policy']['cwdRoot'];
  readonly allowedInputRoots?: ExternalProcessorManifest['policy']['allowedInputRoots'];
  readonly timeoutMs?: number;
  readonly allowNetwork?: boolean;
}): ExternalProcessorManifest {
  const allowedInputRoots = input.allowedInputRoots ?? ['workspace'];
  return {
    schema: 'neko.externalProcessor',
    schemaVersion: 2,
    id: 'developer-mode.one-shot-command',
    kind: 'external-processor',
    displayName: 'Developer Mode One-shot Command',
    version: '0.0.0-temporary',
    entry: {
      executable: '${HOST_SHELL}',
      args: ['-c', '${params.command}'],
    },
    inputs: {},
    outputs: {
      stdout: { produces: ['text/plain'], ownership: 'debug', pathHint: 'stdout.txt' },
      stderr: { produces: ['text/plain'], ownership: 'debug', pathHint: 'stderr.txt' },
    },
    params: {
      command: { type: 'string', required: true, default: input.command },
    },
    policy: {
      requiresApproval: true,
      allowNetwork: input.allowNetwork ?? false,
      allowedInputRoots,
      allowedOutputOwnerships: ['debug'],
      timeoutMs: input.timeoutMs ?? 120_000,
      ...(input.cwdRoot ? { cwdRoot: input.cwdRoot } : {}),
    },
    envProfile: {
      inherits: [],
      configured: [],
      runtime: [],
      denySecrets: true,
    },
  };
}

function createDeveloperModeInvocation(
  command: string,
  run: Partial<ExternalProcessorRunIdentity> | undefined,
  processorRunId: string,
  stageId: string,
): ExternalProcessorInvocation {
  return {
    processorId: 'developer-mode.one-shot-command',
    registrationId: 'temporary:developer-mode:one-shot-command',
    registrationRevision: 0,
    run: createRunIdentity(
      { processorRunId, stageId, attempt: 1, ...run },
      () => processorRunId,
      () => stageId,
    ),
    inputs: [],
    outputs: [
      { slot: 'stdout', ownership: 'debug', pathHint: 'stdout.txt' },
      { slot: 'stderr', ownership: 'debug', pathHint: 'stderr.txt' },
    ],
    params: {
      command,
    },
  };
}

function stableCommandHash(command: string): string {
  let hash = 0;
  for (let index = 0; index < command.length; index += 1) {
    hash = (hash * 31 + command.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function nextAttemptForStage(run: AgentExternalProcessorChainRun, stageId: string): number {
  const attempts = run.stages
    .filter((stage) => stage.stageId === stageId)
    .map((stage) => stage.attempt);
  if (attempts.length === 0) return 1;
  return Math.max(...attempts) + 1;
}

function upsertChainStage(
  run: AgentExternalProcessorChainRun,
  stage: AgentExternalProcessorChainStageRecord,
): AgentExternalProcessorChainRun {
  const stages = run.stages.filter(
    (item) => !(item.stageId === stage.stageId && item.attempt === stage.attempt),
  );
  return {
    ...run,
    stages: [...stages, stage],
  };
}

function isShellPipelineProcessorRequest(processorId: string): boolean {
  const trimmed = processorId.trim();
  return (
    trimmed === 'Bash' ||
    trimmed === 'bash' ||
    trimmed.startsWith('bash ') ||
    trimmed.startsWith('bash -c') ||
    trimmed.startsWith('sh -c') ||
    trimmed.startsWith('zsh -c') ||
    trimmed.includes('|')
  );
}

function diagnostic(
  code: ExternalProcessorDiagnostic['code'],
  severity: ExternalProcessorDiagnostic['severity'],
  message: string,
  path?: string,
): ExternalProcessorDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path ? { path } : {}),
  };
}
