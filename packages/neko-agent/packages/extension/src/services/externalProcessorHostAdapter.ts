import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  hashStableValue,
  type ContentLocator,
  type ProcessorContentProjectionPort,
  type ProcessorOutputLocator,
  type ProcessorOutputPromotionRequest,
  type ProcessorOutputPromotionResult,
} from '@neko/shared';
import { authorizePathInsideRoots, isForbiddenUnmanagedPath } from '@neko/agent/tools';
import type {
  ExternalProcessorDiagnostic,
  ExternalProcessorDiagnosticCode,
  ExternalProcessorDiagnosticSeverity,
  ExternalProcessorInvocation,
  ExternalProcessorInvocationInputBinding,
  ExternalProcessorInvocationOutputBinding,
  ExternalProcessorOutputOwnership,
  ExternalProcessorRegistration,
  ExternalProcessorRegistry,
  ExternalProcessorRegistryContext,
  ExternalProcessorResult,
  ExternalProcessorRootAlias,
} from '@neko-agent/types';
import { matchesExternalProcessorSecretEnvPattern } from '@neko-agent/types';

export interface ExternalProcessorHostAdapterOptions {
  readonly registry: ExternalProcessorRegistry;
  readonly roots: ExternalProcessorRootContext;
  readonly processRunner?: ExternalProcessorProcessRunner;
  readonly fsOps?: ExternalProcessorHostFsOps;
  readonly hostEnv?: Readonly<Record<string, string | undefined>>;
  readonly configuredEnv?: Readonly<Record<string, string | undefined>>;
  readonly runtimeEnv?: Readonly<Record<string, string | undefined>>;
  readonly executableAliases?: Readonly<Record<string, string>>;
  readonly outputStorage?: ExternalProcessorOutputStorage;
  readonly inputProjection: ProcessorContentProjectionPort;
  readonly resolveInputHandle: (handle: string) => Promise<string | undefined>;
}

export interface ExternalProcessorRootContext {
  readonly workspaceRoot?: string;
  readonly processorOutputRoot: string;
  readonly extensionPrivateResourcesRoot: string;
}

export interface ExternalProcessorOutputStorageAllocation {
  readonly locator: ProcessorOutputLocator;
  readonly writablePath: string;
}

export interface ExternalProcessorOutputStorageAllocationRequest {
  readonly processorId: string;
  readonly processorRunId: string;
  readonly stageId: string;
  readonly attempt: number;
  readonly slot: string;
  readonly ownership: ExternalProcessorOutputOwnership;
  readonly mediaType: string;
  readonly fileNameHint: string;
}

export interface ExternalProcessorOutputStorage {
  allocate(
    request: ExternalProcessorOutputStorageAllocationRequest,
  ): Promise<ExternalProcessorOutputStorageAllocation>;
  resolve(output: ProcessorOutputLocator): Promise<string | undefined>;
  promote(request: ProcessorOutputPromotionRequest): Promise<ProcessorOutputPromotionResult>;
}

export interface NodeExternalProcessorOutputStorageOptions {
  readonly root: string;
  readonly promoteOutput?: (input: {
    readonly output: ProcessorOutputLocator;
    readonly sourcePath: string;
    readonly target: ProcessorOutputPromotionRequest['target'];
    readonly signal?: AbortSignal;
  }) => Promise<ContentLocator>;
  readonly fsOps?: Pick<ExternalProcessorHostFsOps, 'mkdir'>;
}

export interface ExternalProcessorHostExecutionRequest {
  readonly invocation: ExternalProcessorInvocation;
  readonly registrationSnapshot?: ExternalProcessorRegistration;
  readonly registryContext?: ExternalProcessorRegistryContext;
  readonly signal?: AbortSignal;
}

export interface ExternalProcessorHostFsOps {
  mkdir(filePath: string, options: { recursive: boolean }): Promise<void>;
  stat(filePath: string): Promise<{ readonly size: number }>;
}

export interface ExternalProcessorProcessRunner {
  readonly canDisableNetwork?: boolean;
  run(input: ExternalProcessorProcessRunInput): Promise<ExternalProcessorProcessRunResult>;
}

export interface ExternalProcessorProcessRunInput {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly inputPaths: Readonly<Record<string, string>>;
  readonly outputPaths: Readonly<Record<string, string>>;
  readonly networkDisabled: boolean;
  readonly signal?: AbortSignal;
}

export interface ExternalProcessorProcessRunResult {
  readonly exitCode: number | null;
  readonly timedOut?: boolean;
  readonly signal?: string;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly error?: string;
}

interface ResolvedRoot {
  readonly alias: ExternalProcessorRootAlias;
  readonly paths: readonly string[];
}

interface ResolvedInput {
  readonly binding: ExternalProcessorInvocationInputBinding;
  readonly path: string;
}

interface AllocatedOutput {
  readonly binding: ExternalProcessorInvocationOutputBinding;
  readonly path: string;
  readonly locator: ProcessorOutputLocator;
}

interface TemplateValues {
  readonly inputs: Readonly<Record<string, string>>;
  readonly outputs: Readonly<Record<string, string>>;
  readonly params: Readonly<Record<string, string>>;
}

const TEMPLATE_PATTERN = /\$\{([^}]+)\}/g;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;
const FILE_URI_RE = /^file:/i;
const OUTPUT_ROOT_PREFIX = 'external-processors';
const DEFAULT_PROCESS_TIMEOUT_MS = 120_000;
const MAX_CAPTURED_STDIO_CHARS = 64_000;

export function createExternalProcessorHostAdapter(
  options: ExternalProcessorHostAdapterOptions,
): ExternalProcessorHostAdapter {
  return new ExternalProcessorHostAdapter(options);
}

export class ExternalProcessorHostAdapter {
  private readonly registry: ExternalProcessorRegistry;
  private readonly roots: ExternalProcessorRootContext;
  private readonly processRunner: ExternalProcessorProcessRunner;
  private readonly fsOps: ExternalProcessorHostFsOps;
  private readonly hostEnv: Readonly<Record<string, string | undefined>>;
  private readonly configuredEnv: Readonly<Record<string, string | undefined>>;
  private readonly runtimeEnv: Readonly<Record<string, string | undefined>>;
  private readonly executableAliases: Readonly<Record<string, string>>;
  private readonly outputStorage: ExternalProcessorOutputStorage;
  private readonly inputProjection: ProcessorContentProjectionPort;
  private readonly resolveInputHandle: (handle: string) => Promise<string | undefined>;
  private readonly pathPolicy: ExternalProcessorPathAccessPolicy;

  constructor(options: ExternalProcessorHostAdapterOptions) {
    this.registry = options.registry;
    this.roots = normalizeRootContext(options.roots);
    this.processRunner = options.processRunner ?? new NodeExternalProcessorProcessRunner();
    this.fsOps = options.fsOps ?? nodeExternalProcessorFsOps;
    this.hostEnv = options.hostEnv ?? process.env;
    this.configuredEnv = options.configuredEnv ?? {};
    this.runtimeEnv = options.runtimeEnv ?? {};
    this.executableAliases = options.executableAliases ?? {};
    this.outputStorage =
      options.outputStorage ??
      new NodeExternalProcessorOutputStorage({
        root: this.roots.processorOutputRoot,
        fsOps: this.fsOps,
      });
    this.inputProjection = options.inputProjection;
    this.resolveInputHandle = options.resolveInputHandle;
    this.pathPolicy = new ExternalProcessorPathAccessPolicy(this.roots);
  }

  async execute(request: ExternalProcessorHostExecutionRequest): Promise<ExternalProcessorResult> {
    const registrationOrDiagnostic = this.resolveRegistration(request);
    if (isDiagnostic(registrationOrDiagnostic)) {
      return this.failedResult(request.invocation, [registrationOrDiagnostic]);
    }

    const registration = registrationOrDiagnostic;
    const preflightDiagnostics = validateRegistrationMatchesInvocation(
      request.invocation,
      registration,
    );
    if (preflightDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return this.failedResult(request.invocation, preflightDiagnostics);
    }

    const inputs = await this.resolveInputs(request.invocation, registration, request.signal);
    const outputs = await this.allocateOutputs(request.invocation, registration);
    const cwd = this.resolveCwd(registration, outputs.items);
    const env = this.buildEnv(registration);
    const executable = this.resolveExecutable(registration);
    const network = this.validateNetworkPolicy(registration);
    const templateValues = createTemplateValues(
      request.invocation,
      registration,
      inputs.items,
      outputs.items,
    );
    const args = renderArgs(registration.manifest.entry.args, templateValues);

    const diagnostics = [
      ...preflightDiagnostics,
      ...inputs.diagnostics,
      ...outputs.diagnostics,
      ...cwd.diagnostics,
      ...env.diagnostics,
      ...executable.diagnostics,
      ...network.diagnostics,
      ...args.diagnostics,
    ];
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return this.failedResult(request.invocation, diagnostics);
    }

    await this.ensureOutputDirectories(outputs.items);
    const runResult = await this.processRunner.run({
      executable: executable.value!,
      args: args.value!,
      cwd: cwd.value!,
      env: env.value,
      timeoutMs: registration.manifest.policy.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS,
      inputPaths: toPathRecord(inputs.items),
      outputPaths: toPathRecord(outputs.items),
      networkDisabled: !registration.manifest.policy.allowNetwork,
      ...(request.signal ? { signal: request.signal } : {}),
    });

    const executionDiagnostics = diagnostics.concat(mapRunDiagnostics(runResult));
    if (runResult.timedOut || runResult.exitCode !== 0) {
      return {
        ...this.failedResult(request.invocation, executionDiagnostics),
        exitCode: runResult.exitCode ?? undefined,
      };
    }

    const materialized = await this.materializeOutputs(registration, outputs.items);
    const resultDiagnostics = executionDiagnostics.concat(materialized.diagnostics);
    return {
      status: resultDiagnostics.some((diagnostic) => diagnostic.severity === 'error')
        ? 'failed'
        : 'succeeded',
      processorId: request.invocation.processorId,
      registrationId: request.invocation.registrationId,
      registrationRevision: request.invocation.registrationRevision,
      run: request.invocation.run,
      outputs: materialized.outputs,
      diagnostics: resultDiagnostics,
      exitCode: runResult.exitCode ?? undefined,
    };
  }

  resolveRoot(alias: ExternalProcessorRootAlias): ResolvedRoot | ExternalProcessorDiagnostic {
    const root = resolveRoot(alias, this.roots);
    if (root.paths.length === 0) {
      return diagnostic(
        'unauthorized-path',
        'error',
        `Processor root "${alias}" is not available in the current Host context.`,
        undefined,
        { root: alias },
      );
    }
    return root;
  }

  private resolveRegistration(
    request: ExternalProcessorHostExecutionRequest,
  ): ExternalProcessorRegistration | ExternalProcessorDiagnostic {
    if (request.registrationSnapshot) {
      return request.registrationSnapshot;
    }
    return this.registry.resolve(request.invocation.registrationId, request.registryContext);
  }

  private async resolveInputs(
    invocation: ExternalProcessorInvocation,
    registration: ExternalProcessorRegistration,
    signal?: AbortSignal,
  ): Promise<{
    readonly items: readonly ResolvedInput[];
    readonly diagnostics: readonly ExternalProcessorDiagnostic[];
  }> {
    const items: ResolvedInput[] = [];
    const diagnostics: ExternalProcessorDiagnostic[] = [];
    for (const binding of invocation.inputs) {
      if ('output' in binding) {
        const resolvedOutputPath = await this.outputStorage.resolve(binding.output);
        if (!resolvedOutputPath) {
          diagnostics.push(
            diagnostic(
              'missing-output',
              'error',
              `Input "${binding.slot}" references an unavailable processor output.`,
              `inputs.${binding.slot}`,
              { outputId: binding.output.id },
            ),
          );
          continue;
        }
        items.push({ binding, path: resolvedOutputPath });
        continue;
      }
      const projection = await this.inputProjection.project(binding.locator, {
        ...(signal ? { signal } : {}),
      });
      if (projection.status === 'unavailable') {
        diagnostics.push(
          diagnostic(
            'unauthorized-path',
            'error',
            `Input "${binding.slot}" could not be projected for processor access.`,
            `inputs.${binding.slot}`,
            { code: projection.diagnostic.code },
          ),
        );
        continue;
      }

      const localPath = normalizeLocalPath(await this.resolveInputHandle(projection.handle));
      if (!localPath) {
        diagnostics.push(
          diagnostic(
            'unauthorized-path',
            'error',
            `Input "${binding.slot}" processor handle is unavailable.`,
            `inputs.${binding.slot}`,
          ),
        );
        continue;
      }

      const authorization = this.pathPolicy.authorizeInput(
        registration.manifest.policy.allowedInputRoots,
        localPath,
      );
      if (authorization) {
        diagnostics.push({
          ...authorization,
          path: `inputs.${binding.slot}`,
        });
        continue;
      }
      items.push({ binding, path: localPath });
    }
    return { items, diagnostics };
  }

  private async allocateOutputs(
    invocation: ExternalProcessorInvocation,
    registration: ExternalProcessorRegistration,
  ): Promise<{
    readonly items: readonly AllocatedOutput[];
    readonly diagnostics: readonly ExternalProcessorDiagnostic[];
  }> {
    const items: AllocatedOutput[] = [];
    const diagnostics: ExternalProcessorDiagnostic[] = [];
    for (const binding of invocation.outputs) {
      const declaration = registration.manifest.outputs[binding.slot];
      if (!declaration) {
        diagnostics.push(
          diagnostic(
            'undeclared-template-reference',
            'error',
            `Output "${binding.slot}" is not declared by processor manifest.`,
            `outputs.${binding.slot}`,
          ),
        );
        continue;
      }

      if (!registration.manifest.policy.allowedOutputOwnerships.includes(binding.ownership)) {
        diagnostics.push(
          diagnostic(
            'illegal-output-ownership',
            'error',
            `Output "${binding.slot}" uses ownership "${binding.ownership}" not allowed by processor policy.`,
            `outputs.${binding.slot}`,
            { ownership: binding.ownership },
          ),
        );
        continue;
      }
      if (binding.ownership !== declaration.ownership) {
        diagnostics.push(
          diagnostic(
            'illegal-output-ownership',
            'error',
            `Output "${binding.slot}" must use declared ownership "${declaration.ownership}".`,
            `outputs.${binding.slot}`,
          ),
        );
        continue;
      }

      const relativeHint = sanitizeOutputPathHint(
        binding.pathHint ?? declaration.pathHint ?? binding.slot,
      );
      if (!relativeHint) {
        diagnostics.push(
          diagnostic(
            'non-portable-output',
            'error',
            `Output "${binding.slot}" path hint must be relative and stay inside the allocated root.`,
            `outputs.${binding.slot}.pathHint`,
          ),
        );
        continue;
      }

      const mediaType = declaration.produces[0];
      if (!mediaType) {
        diagnostics.push(
          diagnostic(
            'missing-required-field',
            'error',
            `Output "${binding.slot}" must declare at least one media type.`,
            `outputs.${binding.slot}.produces`,
          ),
        );
        continue;
      }
      try {
        const allocation = await this.outputStorage.allocate({
          processorId: registration.id,
          processorRunId: invocation.run.processorRunId,
          stageId: invocation.run.stageId,
          attempt: invocation.run.attempt,
          slot: binding.slot,
          ownership: binding.ownership,
          mediaType,
          fileNameHint: relativeHint,
        });
        items.push({ binding, path: allocation.writablePath, locator: allocation.locator });
      } catch (error) {
        diagnostics.push(
          diagnostic(
            'non-portable-output',
            'error',
            `Host could not allocate output "${binding.slot}".`,
            `outputs.${binding.slot}`,
            { error: error instanceof Error ? error.message : String(error) },
          ),
        );
      }
    }
    return { items, diagnostics };
  }

  private resolveCwd(
    registration: ExternalProcessorRegistration,
    outputs: readonly AllocatedOutput[],
  ): {
    readonly value?: string;
    readonly diagnostics: readonly ExternalProcessorDiagnostic[];
  } {
    const cwdRoot = registration.manifest.policy.cwdRoot;
    if (!cwdRoot) {
      return {
        value: outputs[0] ? path.dirname(outputs[0].path) : this.roots.processorOutputRoot,
        diagnostics: [],
      };
    }
    if (cwdRoot === 'mediaLibrary') {
      return {
        diagnostics: [
          diagnostic(
            'invalid-cwd',
            'error',
            'Processor cwd cannot use mediaLibrary because media libraries are read-only inputs.',
            'policy.cwdRoot',
          ),
        ],
      };
    }
    const root = this.resolveRoot(cwdRoot);
    if (isDiagnostic(root)) {
      return {
        diagnostics: [
          {
            ...root,
            code: 'invalid-cwd',
            path: 'policy.cwdRoot',
          },
        ],
      };
    }
    const cwd = root.paths[0]!;
    const unauthorized = this.pathPolicy.authorizeCwd(cwdRoot, cwd);
    return {
      value: cwd,
      diagnostics: unauthorized
        ? [{ ...unauthorized, code: 'invalid-cwd', path: 'policy.cwdRoot' }]
        : [],
    };
  }

  private buildEnv(registration: ExternalProcessorRegistration): {
    readonly value: Readonly<Record<string, string>>;
    readonly diagnostics: readonly ExternalProcessorDiagnostic[];
  } {
    const diagnostics: ExternalProcessorDiagnostic[] = [];
    const env: Record<string, string> = {};
    const profile = registration.manifest.envProfile;
    const denySecrets = registration.trustLevel !== 'core' || profile?.denySecrets !== false;

    inheritEnvKeys(
      profile?.inherits ?? [],
      this.hostEnv,
      'inherits',
      denySecrets,
      env,
      diagnostics,
    );
    inheritEnvKeys(
      profile?.configured ?? [],
      this.configuredEnv,
      'configured',
      denySecrets,
      env,
      diagnostics,
    );
    inheritEnvKeys(
      profile?.runtime ?? [],
      this.runtimeEnv,
      'runtime',
      denySecrets,
      env,
      diagnostics,
    );
    return { value: env, diagnostics };
  }

  private resolveExecutable(registration: ExternalProcessorRegistration): {
    readonly value?: string;
    readonly diagnostics: readonly ExternalProcessorDiagnostic[];
  } {
    const rendered = renderExecutable(
      registration.manifest.entry.executable,
      this.executableAliases,
    );
    if (rendered.diagnostics.length > 0) return rendered;

    const executable = normalizeLocalPath(rendered.value);
    if (!executable || !isAbsolutePath(executable)) {
      return {
        diagnostics: [
          diagnostic(
            'missing-executable',
            'error',
            'Processor executable must resolve to an absolute Host path from the manifest or configured aliases.',
            'entry.executable',
          ),
        ],
      };
    }
    if (isForbiddenUnmanagedPath(executable)) {
      return {
        diagnostics: [
          diagnostic(
            'missing-executable',
            'error',
            'Processor executable cannot be loaded from system temp, Downloads, or Desktop.',
            'entry.executable',
            { executable },
          ),
        ],
      };
    }
    return { value: executable, diagnostics: [] };
  }

  private validateNetworkPolicy(registration: ExternalProcessorRegistration): {
    readonly diagnostics: readonly ExternalProcessorDiagnostic[];
  } {
    if (registration.manifest.policy.allowNetwork) {
      return { diagnostics: [] };
    }
    if (this.processRunner.canDisableNetwork === true) {
      return { diagnostics: [] };
    }
    return {
      diagnostics: [
        diagnostic(
          'network-policy-unavailable',
          'error',
          'Processor requests network disabled, but this Host runner cannot enforce network isolation.',
          'policy.allowNetwork',
        ),
      ],
    };
  }

  private async ensureOutputDirectories(outputs: readonly AllocatedOutput[]): Promise<void> {
    const dirs = new Set(outputs.map((output) => path.dirname(output.path)));
    await Promise.all(Array.from(dirs).map((dir) => this.fsOps.mkdir(dir, { recursive: true })));
  }

  private async materializeOutputs(
    registration: ExternalProcessorRegistration,
    outputs: readonly AllocatedOutput[],
  ): Promise<Pick<ExternalProcessorResult, 'outputs' | 'diagnostics'>> {
    const resultOutputs: ExternalProcessorResult['outputs'][number][] = [];
    const diagnostics: ExternalProcessorDiagnostic[] = [];

    for (const output of outputs) {
      let sizeBytes: number | undefined;
      try {
        sizeBytes = (await this.fsOps.stat(output.path)).size;
      } catch (error) {
        diagnostics.push(
          diagnostic(
            'missing-output',
            'error',
            `Processor did not produce declared output "${output.binding.slot}".`,
            `outputs.${output.binding.slot}`,
            {
              outputOwnership: output.binding.ownership,
              error: error instanceof Error ? error.message : String(error),
            },
          ),
        );
        continue;
      }

      resultOutputs.push({
        slot: output.binding.slot,
        output: output.locator,
        ownership: output.binding.ownership,
        ...(sizeBytes !== undefined ? { sizeBytes } : {}),
        ...(registration.manifest.outputs[output.binding.slot]?.produces[0]
          ? { mimeType: registration.manifest.outputs[output.binding.slot]!.produces[0] }
          : {}),
      });
    }
    return { outputs: resultOutputs, diagnostics };
  }

  private failedResult(
    invocation: ExternalProcessorInvocation,
    diagnostics: readonly ExternalProcessorDiagnostic[],
  ): ExternalProcessorResult {
    return {
      status: 'failed',
      processorId: invocation.processorId,
      registrationId: invocation.registrationId,
      registrationRevision: invocation.registrationRevision,
      run: invocation.run,
      outputs: [],
      diagnostics,
    };
  }
}

export class NodeExternalProcessorOutputStorage implements ExternalProcessorOutputStorage {
  private readonly root: string;
  private readonly promoteOutput?: NodeExternalProcessorOutputStorageOptions['promoteOutput'];
  private readonly fsOps: Pick<ExternalProcessorHostFsOps, 'mkdir'>;
  private readonly allocations = new Map<
    string,
    { readonly locator: ProcessorOutputLocator; readonly path: string }
  >();

  constructor(options: NodeExternalProcessorOutputStorageOptions) {
    this.root = path.normalize(options.root);
    this.promoteOutput = options.promoteOutput;
    this.fsOps = options.fsOps ?? nodeExternalProcessorFsOps;
  }

  async allocate(
    request: ExternalProcessorOutputStorageAllocationRequest,
  ): Promise<ExternalProcessorOutputStorageAllocation> {
    const fileName = sanitizeOutputPathHint(request.fileNameHint);
    if (!fileName) {
      throw new Error('Processor output allocation requires a portable file name hint.');
    }
    const relativePath = path.join(
      OUTPUT_ROOT_PREFIX,
      request.ownership,
      sanitizePathSegment(request.processorId),
      sanitizePathSegment(request.processorRunId),
      sanitizePathSegment(request.stageId),
      `attempt-${request.attempt}`,
      fileName,
    );
    const writablePath = path.normalize(path.join(this.root, relativePath));
    const authorization = authorizePathInsideRoots(writablePath, [this.root]);
    if (!authorization.allowed) {
      throw new Error('Processor output allocation escaped the Host-owned output root.');
    }
    const locator: ProcessorOutputLocator = {
      kind: 'processor-output',
      id: `processor-output-${hashStableValue({
        processorId: request.processorId,
        processorRunId: request.processorRunId,
        stageId: request.stageId,
        attempt: request.attempt,
        slot: request.slot,
        ownership: request.ownership,
      })}`,
      ownership: request.ownership,
      mediaType: request.mediaType,
    };
    await this.fsOps.mkdir(path.dirname(writablePath), { recursive: true });
    this.allocations.set(locator.id, { locator, path: writablePath });
    return { locator, writablePath };
  }

  async resolve(output: ProcessorOutputLocator): Promise<string | undefined> {
    const allocation = this.allocations.get(output.id);
    return allocation && processorOutputLocatorsEqual(allocation.locator, output)
      ? allocation.path
      : undefined;
  }

  async promote(request: ProcessorOutputPromotionRequest): Promise<ProcessorOutputPromotionResult> {
    const allocation = this.allocations.get(request.output.id);
    if (!allocation || !processorOutputLocatorsEqual(allocation.locator, request.output)) {
      throw new Error(`Processor output is unavailable for promotion: ${request.output.id}`);
    }
    if (!this.promoteOutput) {
      throw new Error('Processor output promotion requires an owning durable writer.');
    }
    const source = await this.promoteOutput({
      output: request.output,
      sourcePath: allocation.path,
      target: request.target,
      ...(request.signal ? { signal: request.signal } : {}),
    });
    return {
      status: 'promoted',
      output: { ...request.output, ownership: 'promoted' },
      source,
    };
  }
}

function processorOutputLocatorsEqual(
  left: ProcessorOutputLocator,
  right: ProcessorOutputLocator,
): boolean {
  return (
    left.kind === right.kind &&
    left.id === right.id &&
    left.ownership === right.ownership &&
    left.mediaType === right.mediaType &&
    left.fingerprint === right.fingerprint
  );
}

export class NodeExternalProcessorProcessRunner implements ExternalProcessorProcessRunner {
  readonly canDisableNetwork = false;

  async run(input: ExternalProcessorProcessRunInput): Promise<ExternalProcessorProcessRunResult> {
    return new Promise((resolve) => {
      const child = spawn(input.executable, [...input.args], {
        cwd: input.cwd,
        env: input.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;
      const timeout = input.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill();
          }, input.timeoutMs)
        : undefined;

      const finish = (result: ExternalProcessorProcessRunResult) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        resolve(result);
      };

      input.signal?.addEventListener(
        'abort',
        () => {
          child.kill();
          finish({
            exitCode: null,
            signal: 'ABORT_ERR',
            error: 'Processor execution was aborted.',
          });
        },
        { once: true },
      );

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout = captureBounded(stdout, chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr = captureBounded(stderr, chunk);
      });
      child.on('error', (error) => {
        finish({ exitCode: null, error: error.message, stdout, stderr });
      });
      child.on('close', (exitCode, signal) => {
        finish({
          exitCode,
          ...(timedOut ? { timedOut } : {}),
          ...(signal ? { signal } : {}),
          ...(stdout ? { stdout } : {}),
          ...(stderr ? { stderr } : {}),
        });
      });
    });
  }
}

class ExternalProcessorPathAccessPolicy {
  private readonly roots: ExternalProcessorRootContext;

  constructor(roots: ExternalProcessorRootContext) {
    this.roots = roots;
  }

  authorizeInput(
    roots: readonly ExternalProcessorRootAlias[],
    filePath: string,
  ): ExternalProcessorDiagnostic | undefined {
    const normalized = normalizeLocalPath(filePath);
    if (!normalized || !isAbsolutePath(normalized)) {
      return diagnostic(
        'unauthorized-path',
        'error',
        'Processor input handle did not resolve to a Host-local file.',
      );
    }
    if (isForbiddenUnmanagedPath(normalized)) {
      return diagnostic(
        'unauthorized-path',
        'error',
        'Processor input is outside managed Host content roots.',
      );
    }
    const authorized = roots.some((root) => {
      const resolvedRoot = resolveRoot(root, this.roots);
      return authorizePathInsideRoots(normalized, resolvedRoot.paths).allowed;
    });
    return authorized
      ? undefined
      : diagnostic(
          'unauthorized-path',
          'error',
          'Processor input is outside the roots allowed by its manifest.',
          undefined,
          { allowedRootAliases: roots },
        );
  }

  authorizeCwd(
    root: ExternalProcessorRootAlias,
    filePath: string,
  ): ExternalProcessorDiagnostic | undefined {
    return this.authorizePath(root, filePath, 'cwd');
  }

  private authorizePath(
    root: ExternalProcessorRootAlias,
    filePath: string,
    accessKind: 'input' | 'cwd',
  ): ExternalProcessorDiagnostic | undefined {
    const normalized = normalizeLocalPath(filePath);
    if (!normalized || !isAbsolutePath(normalized)) {
      return diagnostic(
        'unauthorized-path',
        'error',
        `Processor ${accessKind} path must be an absolute local path after Host resolution.`,
        undefined,
        { root, filePath },
      );
    }
    const resolvedRoot = resolveRoot(root, this.roots);
    const decision = authorizePathInsideRoots(normalized, resolvedRoot.paths);
    if (decision.reason === 'forbidden-unmanaged-path') {
      return diagnostic(
        'unauthorized-path',
        'error',
        `Processor ${accessKind} path is denied because it is in system temp, Downloads, or Desktop.`,
        undefined,
        { root, filePath: normalized },
      );
    }
    if (decision.reason === 'outside-authorized-roots') {
      return diagnostic(
        'unauthorized-path',
        'error',
        `Processor ${accessKind} path is outside the declared "${root}" root.`,
        undefined,
        { root, filePath: normalized, allowedRoots: resolvedRoot.paths },
      );
    }
    return undefined;
  }
}

function normalizeRootContext(roots: ExternalProcessorRootContext): ExternalProcessorRootContext {
  return {
    ...(roots.workspaceRoot ? { workspaceRoot: path.normalize(roots.workspaceRoot) } : {}),
    processorOutputRoot: path.normalize(roots.processorOutputRoot),
    extensionPrivateResourcesRoot: path.normalize(roots.extensionPrivateResourcesRoot),
  };
}

function resolveRoot(
  alias: ExternalProcessorRootAlias,
  roots: ExternalProcessorRootContext,
): ResolvedRoot {
  switch (alias) {
    case 'workspace':
      return {
        alias,
        paths: roots.workspaceRoot ? [roots.workspaceRoot] : [],
      };
    case 'mediaLibrary':
      return {
        alias,
        paths: roots.workspaceRoot ? [path.join(roots.workspaceRoot, 'neko', 'assets')] : [],
      };
    case 'extensionPrivateResources':
      return {
        alias,
        paths: [roots.extensionPrivateResourcesRoot],
      };
  }
}

function renderExecutable(
  executable: string,
  aliases: Readonly<Record<string, string>>,
): { readonly value?: string; readonly diagnostics: readonly ExternalProcessorDiagnostic[] } {
  const diagnostics: ExternalProcessorDiagnostic[] = [];
  const value = executable.replace(TEMPLATE_PATTERN, (_match, token: string) => {
    const alias = token.trim();
    const replacement = aliases[alias];
    if (!replacement) {
      diagnostics.push(
        diagnostic(
          'missing-executable',
          'error',
          `Executable alias "${alias}" is not configured for this Host.`,
          'entry.executable',
          { alias },
        ),
      );
      return '';
    }
    return replacement;
  });
  return diagnostics.length > 0 ? { diagnostics } : { value, diagnostics };
}

function renderArgs(
  args: readonly string[],
  values: TemplateValues,
): {
  readonly value?: readonly string[];
  readonly diagnostics: readonly ExternalProcessorDiagnostic[];
} {
  const diagnostics: ExternalProcessorDiagnostic[] = [];
  const rendered = args.map((arg, index) =>
    arg.replace(TEMPLATE_PATTERN, (_match, token: string) => {
      const replacement = resolveTemplateValue(token.trim(), values);
      if (replacement === undefined) {
        diagnostics.push(
          diagnostic(
            'invalid-template-reference',
            'error',
            `Argument template references unknown value "${token}".`,
            `entry.args.${index}`,
            { token },
          ),
        );
        return '';
      }
      return replacement;
    }),
  );
  return diagnostics.length > 0 ? { diagnostics } : { value: rendered, diagnostics };
}

function resolveTemplateValue(token: string, values: TemplateValues): string | undefined {
  const [namespace, key, extra] = token.split('.');
  if (!namespace || !key || extra !== undefined) return undefined;
  if (namespace === 'input') return values.inputs[key];
  if (namespace === 'output') return values.outputs[key];
  if (namespace === 'params') return values.params[key];
  return undefined;
}

function createTemplateValues(
  invocation: ExternalProcessorInvocation,
  registration: ExternalProcessorRegistration,
  inputs: readonly ResolvedInput[],
  outputs: readonly AllocatedOutput[],
): {
  readonly inputs: Record<string, string>;
  readonly outputs: Record<string, string>;
  readonly params: Record<string, string>;
} {
  const inputValues: Record<string, string> = {};
  for (const item of inputs) {
    inputValues[item.binding.slot] = item.path;
  }
  const outputValues: Record<string, string> = {};
  for (const item of outputs) {
    outputValues[item.binding.slot] = item.path;
  }
  const paramValues: Record<string, string> = {};
  for (const [key, declaration] of Object.entries(registration.manifest.params ?? {})) {
    const value = invocation.params?.[key] ?? declaration.default;
    if (value !== undefined) paramValues[key] = String(value);
  }
  for (const [key, value] of Object.entries(invocation.params ?? {})) {
    paramValues[key] = String(value);
  }
  return { inputs: inputValues, outputs: outputValues, params: paramValues };
}

function validateRegistrationMatchesInvocation(
  invocation: ExternalProcessorInvocation,
  registration: ExternalProcessorRegistration,
): readonly ExternalProcessorDiagnostic[] {
  const diagnostics: ExternalProcessorDiagnostic[] = [];
  if (registration.registrationId !== invocation.registrationId) {
    diagnostics.push(
      diagnostic(
        'disabled-processor',
        'error',
        'Resolved processor registration does not match invocation registrationId.',
        'registrationId',
        {
          expected: invocation.registrationId,
          actual: registration.registrationId,
        },
      ),
    );
  }
  if (registration.revision !== invocation.registrationRevision) {
    diagnostics.push(
      diagnostic(
        'disabled-processor',
        'error',
        'Resolved processor registration revision does not match invocation snapshot.',
        'registrationRevision',
        {
          expected: invocation.registrationRevision,
          actual: registration.revision,
        },
      ),
    );
  }
  if (registration.id !== invocation.processorId) {
    diagnostics.push(
      diagnostic(
        'disabled-processor',
        'error',
        'Resolved processor id does not match invocation processorId.',
        'processorId',
        {
          expected: invocation.processorId,
          actual: registration.id,
        },
      ),
    );
  }
  return diagnostics;
}

function inheritEnvKeys(
  keys: readonly string[],
  source: Readonly<Record<string, string | undefined>>,
  sourceKind: 'inherits' | 'configured' | 'runtime',
  denySecrets: boolean,
  target: Record<string, string>,
  diagnostics: ExternalProcessorDiagnostic[],
): void {
  for (const key of keys) {
    if (denySecrets && matchesExternalProcessorSecretEnvPattern(key)) {
      diagnostics.push(
        diagnostic(
          'blocked-env-key',
          'error',
          `Environment key "${key}" is blocked by Host secret policy.`,
          `envProfile.${sourceKind}`,
          { key },
        ),
      );
      continue;
    }
    const value = source[key];
    if (value === undefined) {
      diagnostics.push(
        diagnostic(
          'unknown-env-key',
          'warning',
          `Environment key "${key}" was requested but is not available from ${sourceKind}.`,
          `envProfile.${sourceKind}`,
          { key },
        ),
      );
      continue;
    }
    target[key] = value;
  }
}

function mapRunDiagnostics(
  result: ExternalProcessorProcessRunResult,
): readonly ExternalProcessorDiagnostic[] {
  const diagnostics: ExternalProcessorDiagnostic[] = [];
  if (result.timedOut) {
    diagnostics.push(
      diagnostic(
        'execution-timeout',
        'error',
        'Processor execution exceeded its timeout and was terminated.',
      ),
    );
  }
  if (result.error) {
    diagnostics.push(
      diagnostic(
        result.exitCode === null ? 'missing-executable' : 'execution-failed',
        'error',
        result.error,
      ),
    );
  }
  if (result.exitCode !== 0 && !result.error && !result.timedOut) {
    diagnostics.push(
      diagnostic(
        'execution-failed',
        'error',
        `Processor exited with code ${result.exitCode}.`,
        undefined,
        {
          ...(result.signal ? { signal: result.signal } : {}),
          ...(result.stderr ? { stderr: result.stderr } : {}),
        },
      ),
    );
  }
  return diagnostics;
}

function toPathRecord(
  items: readonly ResolvedInput[] | readonly AllocatedOutput[],
): Readonly<Record<string, string>> {
  const record: Record<string, string> = {};
  for (const item of items) {
    record[item.binding.slot] = item.path;
  }
  return record;
}

function sanitizeOutputPathHint(value: string): string | undefined {
  const normalized = path.posix.normalize(value.trim().replace(/\\/g, '/'));
  if (
    normalized.length === 0 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/') ||
    WINDOWS_DRIVE_RE.test(normalized)
  ) {
    return undefined;
  }
  return normalized.replace(/^\.\//, '');
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function normalizeLocalPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (FILE_URI_RE.test(trimmed)) {
    try {
      return path.normalize(fileURLToPath(trimmed));
    } catch {
      return undefined;
    }
  }
  return path.normalize(trimmed);
}

function isAbsolutePath(value: string): boolean {
  return path.isAbsolute(value) || WINDOWS_DRIVE_RE.test(value);
}

function captureBounded(current: string, chunk: Buffer): string {
  const next = current + chunk.toString('utf8');
  return next.length > MAX_CAPTURED_STDIO_CHARS
    ? next.slice(next.length - MAX_CAPTURED_STDIO_CHARS)
    : next;
}

const nodeExternalProcessorFsOps: ExternalProcessorHostFsOps = {
  async mkdir(filePath, options) {
    await fs.mkdir(filePath, options);
  },
  stat(filePath) {
    return fs.stat(filePath);
  },
};

function isDiagnostic(value: unknown): value is ExternalProcessorDiagnostic {
  return typeof value === 'object' && value !== null && 'code' in value && 'severity' in value;
}

function diagnostic(
  code: ExternalProcessorDiagnosticCode,
  severity: ExternalProcessorDiagnosticSeverity,
  message: string,
  diagnosticPath?: string,
  details?: Readonly<Record<string, unknown>>,
): ExternalProcessorDiagnostic {
  return {
    code,
    severity,
    message,
    ...(diagnosticPath ? { path: diagnosticPath } : {}),
    ...(details ? { details } : {}),
  };
}
