import type { ContentLocator } from '@neko/content-domain';
import type { GenerationProviderTaskRef, MediaGenerationExecutionOptions } from '../execution';

export interface ComfyUiWorkflowSubmission {
  readonly endpoint: string;
  readonly clientId: string;
  readonly workflow: Readonly<Record<string, unknown>>;
}

export interface ComfyUiWorkflowInputBinding {
  readonly nodeId: string;
  readonly inputName: string;
  readonly contentLocator: ContentLocator;
}

/**
 * Frozen input for one ComfyUI Generation Job. The workflow is the exact API
 * payload; resource bindings retain their authorized product identities.
 */
export interface ComfyUiWorkflowGenerationRequest extends ComfyUiWorkflowSubmission {
  readonly outputKind: 'image';
  readonly inputBindings: readonly ComfyUiWorkflowInputBinding[];
}

export interface ComfyUiPromptRef {
  readonly providerId: 'comfyui';
  readonly promptId: string;
}

export type ComfyUiPromptPhase = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ComfyUiPromptSnapshot {
  readonly ref: ComfyUiPromptRef;
  readonly phase: ComfyUiPromptPhase;
  readonly outputs: readonly ComfyUiOutputDescriptor[];
  readonly diagnostic?: string;
}

export interface ComfyUiOutputDescriptor {
  readonly filename: string;
  readonly subfolder: string;
  readonly outputType: string;
}

export interface ComfyUiRetrievedOutput {
  readonly descriptor: ComfyUiOutputDescriptor;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface ComfyUiWorkflowGenerationResult {
  readonly type: 'workflow';
  readonly providerId: 'comfyui';
  readonly promptId: string;
  readonly outputs: readonly ComfyUiRetrievedOutput[];
  readonly request: ComfyUiWorkflowGenerationRequest;
}

export type ComfyUiWorkflowTaskObservation =
  | { readonly status: 'pending' | 'processing'; readonly progress?: number }
  | { readonly status: 'cancelled' }
  | {
      readonly status: 'failed';
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly retryable: false;
      };
    }
  | { readonly status: 'completed'; readonly generation: ComfyUiWorkflowGenerationResult };

export interface ComfyUiWorkflowExecutionPort {
  generateWorkflow(
    request: ComfyUiWorkflowGenerationRequest,
    options?: MediaGenerationExecutionOptions,
  ): Promise<ComfyUiWorkflowGenerationResult>;
  describeWorkflowTask(
    request: ComfyUiWorkflowGenerationRequest,
    task: GenerationProviderTaskRef,
  ): Promise<ComfyUiWorkflowTaskObservation>;
  cancelWorkflowTask(
    request: ComfyUiWorkflowGenerationRequest,
    task: GenerationProviderTaskRef,
  ): Promise<void>;
}

export interface ComfyUiMaterializedInput {
  readonly filename: string;
  readonly subfolder?: string;
}

export interface ComfyUiWorkflowInputMaterializer {
  materialize(input: {
    readonly endpoint: string;
    readonly binding: ComfyUiWorkflowInputBinding;
    readonly signal?: AbortSignal;
  }): Promise<ComfyUiMaterializedInput>;
}

export interface ComfyUiWorkflowRunnerOptions {
  readonly api: ComfyUiLocalApi;
  readonly inputs?: ComfyUiWorkflowInputMaterializer;
  readonly pollIntervalMs?: number;
  readonly waitForPoll?: (intervalMs: number, signal?: AbortSignal) => Promise<void>;
}

export interface ComfyUiLocalApiRequestPort {
  request(input: {
    readonly url: string;
    readonly method: 'GET' | 'POST';
    readonly body?: Readonly<Record<string, unknown>>;
    readonly signal?: AbortSignal;
  }): Promise<Response>;
}

export class ComfyUiLocalApiError extends Error {
  constructor(
    readonly code:
      | 'comfyui-endpoint-invalid'
      | 'comfyui-request-failed'
      | 'comfyui-response-invalid'
      | 'comfyui-workflow-rejected'
      | 'comfyui-prompt-unavailable'
      | 'comfyui-cancel-target-mismatch'
      | 'comfyui-output-unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'ComfyUiLocalApiError';
  }
}

export class ComfyUiLocalApi {
  constructor(private readonly requests: ComfyUiLocalApiRequestPort) {}

  async submit(input: ComfyUiWorkflowSubmission, signal?: AbortSignal): Promise<ComfyUiPromptRef> {
    const endpoint = requireLoopbackEndpoint(input.endpoint);
    const response = await this.requests.request({
      url: `${endpoint}/prompt`,
      method: 'POST',
      body: {
        prompt: requireWorkflow(input.workflow),
        client_id: requireIdentity(input.clientId, 'ComfyUI client'),
      },
      signal,
    });
    const payload = await readJson(response, 'ComfyUI workflow submission');
    if (!response.ok) {
      throw new ComfyUiLocalApiError(
        'comfyui-workflow-rejected',
        describeProviderError(payload, response.status),
      );
    }
    const promptId = readString(payload['prompt_id']);
    if (!promptId) {
      throw new ComfyUiLocalApiError(
        'comfyui-response-invalid',
        'ComfyUI workflow submission did not return prompt_id.',
      );
    }
    return { providerId: 'comfyui', promptId };
  }

  async validateWorkflow(
    endpointInput: string,
    workflow: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<void> {
    const endpoint = requireLoopbackEndpoint(endpointInput);
    const response = await this.requests.request({
      url: `${endpoint}/object_info`,
      method: 'GET',
      signal,
    });
    const objectInfo = await readJson(response, 'ComfyUI node catalog');
    if (!response.ok) throw requestFailure('ComfyUI node catalog', response.status, objectInfo);
    validateWorkflowRequirements(requireWorkflow(workflow), objectInfo);
  }

  async describe(
    endpointInput: string,
    ref: ComfyUiPromptRef,
    signal?: AbortSignal,
  ): Promise<ComfyUiPromptSnapshot> {
    const endpoint = requireLoopbackEndpoint(endpointInput);
    const promptId = requirePromptRef(ref);
    const historyResponse = await this.requests.request({
      url: `${endpoint}/history/${encodeURIComponent(promptId)}`,
      method: 'GET',
      signal,
    });
    const history = await readJson(historyResponse, 'ComfyUI prompt history');
    if (!historyResponse.ok) {
      throw requestFailure('ComfyUI prompt history', historyResponse.status, history);
    }
    const historyEntry = recordValue(history[promptId]);
    if (historyEntry) return projectHistory(ref, historyEntry);

    const queue = await this.readQueue(endpoint, signal);
    if (queue.running.has(promptId)) return { ref, phase: 'running', outputs: [] };
    if (queue.pending.has(promptId)) return { ref, phase: 'queued', outputs: [] };
    throw new ComfyUiLocalApiError(
      'comfyui-prompt-unavailable',
      `ComfyUI prompt '${promptId}' is absent from exact history and queue state.`,
    );
  }

  async cancel(endpointInput: string, ref: ComfyUiPromptRef, signal?: AbortSignal): Promise<void> {
    const endpoint = requireLoopbackEndpoint(endpointInput);
    const promptId = requirePromptRef(ref);
    const queue = await this.readQueue(endpoint, signal);
    if (queue.pending.has(promptId)) {
      await this.postAndRequireOk(
        `${endpoint}/queue`,
        { delete: [promptId] },
        'ComfyUI pending prompt cancellation',
        signal,
      );
      return;
    }
    if (queue.running.has(promptId)) {
      if (queue.running.size !== 1) {
        throw new ComfyUiLocalApiError(
          'comfyui-cancel-target-mismatch',
          `ComfyUI interrupt is global while ${queue.running.size} prompts are running; exact prompt cancellation was refused.`,
        );
      }
      await this.postAndRequireOk(
        `${endpoint}/interrupt`,
        {},
        'ComfyUI running prompt interruption',
        signal,
      );
      return;
    }
    const snapshot = await this.describe(endpoint, ref, signal);
    if (
      snapshot.phase === 'succeeded' ||
      snapshot.phase === 'failed' ||
      snapshot.phase === 'cancelled'
    ) {
      return;
    }
    throw new ComfyUiLocalApiError(
      'comfyui-cancel-target-mismatch',
      `ComfyUI prompt '${promptId}' could not be matched for cancellation.`,
    );
  }

  async retrieve(
    endpointInput: string,
    ref: ComfyUiPromptRef,
    descriptor: ComfyUiOutputDescriptor,
    signal?: AbortSignal,
  ): Promise<ComfyUiRetrievedOutput> {
    const endpoint = requireLoopbackEndpoint(endpointInput);
    const snapshot = await this.describe(endpoint, ref, signal);
    const exact = snapshot.outputs.find((candidate) => sameOutput(candidate, descriptor));
    if (snapshot.phase !== 'succeeded' || !exact) {
      throw new ComfyUiLocalApiError(
        'comfyui-output-unavailable',
        `ComfyUI output is not owned by succeeded prompt '${ref.promptId}'.`,
      );
    }
    const query = new URLSearchParams({
      filename: exact.filename,
      subfolder: exact.subfolder,
      type: exact.outputType,
    });
    const response = await this.requests.request({
      url: `${endpoint}/view?${query.toString()}`,
      method: 'GET',
      signal,
    });
    requireUnredirectedLoopbackResponse(response, 'ComfyUI output retrieval');
    if (!response.ok || response.status >= 300) {
      throw new ComfyUiLocalApiError(
        'comfyui-output-unavailable',
        `ComfyUI output retrieval failed with HTTP ${response.status}.`,
      );
    }
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim();
    if (!mimeType || !mimeType.includes('/')) {
      throw new ComfyUiLocalApiError(
        'comfyui-response-invalid',
        'ComfyUI output response has no valid content type.',
      );
    }
    return {
      descriptor: exact,
      mimeType,
      bytes: new Uint8Array(await response.arrayBuffer()),
    };
  }

  private async readQueue(endpoint: string, signal?: AbortSignal) {
    const response = await this.requests.request({
      url: `${endpoint}/queue`,
      method: 'GET',
      signal,
    });
    const payload = await readJson(response, 'ComfyUI queue');
    if (!response.ok) throw requestFailure('ComfyUI queue', response.status, payload);
    return {
      running: readQueuePromptIds(payload['queue_running']),
      pending: readQueuePromptIds(payload['queue_pending']),
    };
  }

  private async postAndRequireOk(
    url: string,
    body: Readonly<Record<string, unknown>>,
    label: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await this.requests.request({ url, method: 'POST', body, signal });
    requireUnredirectedLoopbackResponse(response, label);
    if (!response.ok) {
      const payload = await readJson(response, label);
      throw requestFailure(label, response.status, payload);
    }
  }
}

export class ComfyUiWorkflowRunner implements ComfyUiWorkflowExecutionPort {
  private readonly pollIntervalMs: number;
  private readonly waitForPoll: (intervalMs: number, signal?: AbortSignal) => Promise<void>;

  constructor(private readonly options: ComfyUiWorkflowRunnerOptions) {
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.waitForPoll = options.waitForPoll ?? waitForPoll;
    if (!Number.isSafeInteger(this.pollIntervalMs) || this.pollIntervalMs <= 0) {
      throw new RangeError('ComfyUI workflow poll interval must be a positive integer.');
    }
  }

  async generateWorkflow(
    request: ComfyUiWorkflowGenerationRequest,
    executionOptions: MediaGenerationExecutionOptions = {},
  ): Promise<ComfyUiWorkflowGenerationResult> {
    await this.options.api.validateWorkflow(
      request.endpoint,
      request.workflow,
      executionOptions.signal,
    );
    const workflow = await this.bindInputs(request, executionOptions.signal);
    const ref = await this.options.api.submit(
      { endpoint: request.endpoint, clientId: request.clientId, workflow },
      executionOptions.signal,
    );
    await executionOptions.onExternalTask?.({
      providerId: ref.providerId,
      externalTaskId: ref.promptId,
    });
    while (true) {
      const observation = await this.describeExact(request, ref, executionOptions.signal);
      switch (observation.status) {
        case 'pending':
        case 'processing':
          executionOptions.onProgress?.(observation.progress ?? 0);
          await this.waitForPoll(this.pollIntervalMs, executionOptions.signal);
          break;
        case 'completed':
          return observation.generation;
        case 'cancelled':
          throw new ComfyUiLocalApiError(
            'comfyui-prompt-unavailable',
            `ComfyUI prompt '${ref.promptId}' was cancelled.`,
          );
        case 'failed':
          throw new ComfyUiLocalApiError('comfyui-request-failed', observation.error.message);
      }
    }
  }

  describeWorkflowTask(
    request: ComfyUiWorkflowGenerationRequest,
    task: GenerationProviderTaskRef,
  ): Promise<ComfyUiWorkflowTaskObservation> {
    return this.describeExact(request, taskRef(task));
  }

  cancelWorkflowTask(
    request: ComfyUiWorkflowGenerationRequest,
    task: GenerationProviderTaskRef,
  ): Promise<void> {
    return this.options.api.cancel(request.endpoint, taskRef(task));
  }

  private async describeExact(
    request: ComfyUiWorkflowGenerationRequest,
    ref: ComfyUiPromptRef,
    signal?: AbortSignal,
  ): Promise<ComfyUiWorkflowTaskObservation> {
    const snapshot = await this.options.api.describe(request.endpoint, ref, signal);
    switch (snapshot.phase) {
      case 'queued':
        return { status: 'pending', progress: 0 };
      case 'running':
        return { status: 'processing' };
      case 'cancelled':
        return { status: 'cancelled' };
      case 'failed':
        return {
          status: 'failed',
          error: {
            code: 'comfyui-workflow-failed',
            message: snapshot.diagnostic ?? 'ComfyUI reported workflow execution failure.',
            retryable: false,
          },
        };
      case 'succeeded': {
        if (snapshot.outputs.length === 0) {
          return {
            status: 'failed',
            error: {
              code: 'comfyui-output-unavailable',
              message: `ComfyUI prompt '${ref.promptId}' completed without history-owned outputs.`,
              retryable: false,
            },
          };
        }
        const outputs = await Promise.all(
          snapshot.outputs.map((descriptor) =>
            this.options.api.retrieve(request.endpoint, ref, descriptor, signal),
          ),
        );
        if (outputs.some((output) => !output.mimeType.startsWith('image/'))) {
          return {
            status: 'failed',
            error: {
              code: 'comfyui-output-kind-mismatch',
              message: 'ComfyUI returned a non-image output for an image workflow Job.',
              retryable: false,
            },
          };
        }
        return {
          status: 'completed',
          generation: {
            type: 'workflow',
            providerId: 'comfyui',
            promptId: ref.promptId,
            outputs,
            request,
          },
        };
      }
    }
  }

  private async bindInputs(
    request: ComfyUiWorkflowGenerationRequest,
    signal?: AbortSignal,
  ): Promise<Readonly<Record<string, unknown>>> {
    const workflow = structuredClone(request.workflow) as Record<string, unknown>;
    if (request.inputBindings.length === 0) return workflow;
    if (!this.options.inputs) {
      throw new ComfyUiLocalApiError(
        'comfyui-workflow-rejected',
        'ComfyUI workflow has authorized resource inputs, but no input materializer is composed.',
      );
    }
    const exactInputs = new Set<string>();
    for (const binding of request.inputBindings) {
      const exactInput = `${binding.nodeId}\0${binding.inputName}`;
      if (exactInputs.has(exactInput)) {
        throw new ComfyUiLocalApiError(
          'comfyui-workflow-rejected',
          `ComfyUI input binding '${binding.nodeId}.${binding.inputName}' is duplicated.`,
        );
      }
      exactInputs.add(exactInput);
      const node = recordValue(workflow[binding.nodeId]);
      const nodeInputs = recordValue(node?.['inputs']);
      if (
        !Object.hasOwn(workflow, binding.nodeId) ||
        !nodeInputs ||
        !Object.hasOwn(nodeInputs, binding.inputName)
      ) {
        throw new ComfyUiLocalApiError(
          'comfyui-workflow-rejected',
          `ComfyUI input binding '${binding.nodeId}.${binding.inputName}' is absent from the frozen workflow.`,
        );
      }
    }
    for (const binding of request.inputBindings) {
      const materialized = await this.options.inputs.materialize({
        endpoint: request.endpoint,
        binding,
        signal,
      });
      const nodeInputs = recordValue(recordValue(workflow[binding.nodeId])?.['inputs']);
      if (!nodeInputs) {
        throw new Error(
          'Validated ComfyUI workflow input became unavailable before materialization.',
        );
      }
      (nodeInputs as Record<string, unknown>)[binding.inputName] = materialized.subfolder
        ? `${materialized.subfolder}/${materialized.filename}`
        : materialized.filename;
    }
    return workflow;
  }
}

function projectHistory(
  ref: ComfyUiPromptRef,
  entry: Readonly<Record<string, unknown>>,
): ComfyUiPromptSnapshot {
  const status = recordValue(entry['status']);
  const statusString = readString(status?.['status_str']);
  const completed = status?.['completed'] === true;
  const outputs = collectOutputs(entry['outputs']);
  if (completed) return { ref, phase: 'succeeded', outputs };
  if (statusString === 'error') {
    return { ref, phase: 'failed', outputs: [], diagnostic: 'ComfyUI reported execution error.' };
  }
  if (statusString === 'cancelled' || statusString === 'interrupted') {
    return { ref, phase: 'cancelled', outputs: [] };
  }
  return { ref, phase: 'running', outputs: [] };
}

function validateWorkflowRequirements(
  workflow: Readonly<Record<string, unknown>>,
  objectInfo: Readonly<Record<string, unknown>>,
): void {
  for (const [nodeId, nodeValue] of Object.entries(workflow)) {
    const node = recordValue(nodeValue);
    const classType = readString(node?.['class_type']);
    if (!node || !classType) {
      throw new ComfyUiLocalApiError(
        'comfyui-workflow-rejected',
        `ComfyUI workflow node '${nodeId}' has no class_type.`,
      );
    }
    const nodeDefinition = recordValue(objectInfo[classType]);
    if (!nodeDefinition) {
      throw new ComfyUiLocalApiError(
        'comfyui-workflow-rejected',
        `ComfyUI node '${classType}' required by workflow node '${nodeId}' is unavailable.`,
      );
    }
    validateEnumeratedInputs(nodeId, node, nodeDefinition);
  }
}

function validateEnumeratedInputs(
  nodeId: string,
  node: Readonly<Record<string, unknown>>,
  definition: Readonly<Record<string, unknown>>,
): void {
  const values = recordValue(node['inputs']);
  const declared = recordValue(recordValue(definition['input'])?.['required']);
  if (!values || !declared) return;
  for (const [inputName, declarationValue] of Object.entries(declared)) {
    const declaration = Array.isArray(declarationValue) ? declarationValue : undefined;
    const choices = Array.isArray(declaration?.[0]) ? declaration[0] : undefined;
    const selected = values[inputName];
    if (choices && typeof selected === 'string' && !choices.some((choice) => choice === selected)) {
      throw new ComfyUiLocalApiError(
        'comfyui-workflow-rejected',
        `ComfyUI workflow input '${nodeId}.${inputName}' requires unavailable value '${selected}'.`,
      );
    }
  }
}

function taskRef(task: GenerationProviderTaskRef): ComfyUiPromptRef {
  if (task.providerId !== 'comfyui') {
    throw new ComfyUiLocalApiError(
      'comfyui-prompt-unavailable',
      `External task provider '${task.providerId}' is not ComfyUI.`,
    );
  }
  return { providerId: 'comfyui', promptId: task.externalTaskId };
}

function waitForPoll(intervalMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason ?? new Error('ComfyUI workflow polling aborted.'));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, intervalMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function collectOutputs(value: unknown): readonly ComfyUiOutputDescriptor[] {
  const outputs = recordValue(value);
  if (!outputs) return [];
  const descriptors: ComfyUiOutputDescriptor[] = [];
  for (const nodeOutput of Object.values(outputs)) {
    const record = recordValue(nodeOutput);
    if (!record) continue;
    for (const entries of Object.values(record)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const candidate = recordValue(entry);
        const filename = readString(candidate?.['filename']);
        const subfolder = readString(candidate?.['subfolder']);
        const outputType = readString(candidate?.['type']);
        if (filename && subfolder !== undefined && outputType) {
          descriptors.push({ filename, subfolder, outputType });
        }
      }
    }
  }
  return descriptors;
}

function readQueuePromptIds(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value.flatMap((entry) => {
      if (!Array.isArray(entry)) return [];
      const promptId = readString(entry[1]);
      return promptId ? [promptId] : [];
    }),
  );
}

async function readJson(
  response: Response,
  label: string,
): Promise<Readonly<Record<string, unknown>>> {
  requireUnredirectedLoopbackResponse(response, label);
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    throw new ComfyUiLocalApiError(
      'comfyui-response-invalid',
      `${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const record = recordValue(value);
  if (!record) {
    throw new ComfyUiLocalApiError('comfyui-response-invalid', `${label} returned a non-object.`);
  }
  return record;
}

function requestFailure(
  label: string,
  status: number,
  payload: Readonly<Record<string, unknown>>,
): ComfyUiLocalApiError {
  return new ComfyUiLocalApiError(
    'comfyui-request-failed',
    `${label} failed: ${describeProviderError(payload, status)}`,
  );
}

function describeProviderError(payload: Readonly<Record<string, unknown>>, status: number): string {
  return readString(payload['error']) ?? `HTTP ${status}`;
}

function requireLoopbackEndpoint(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ComfyUiLocalApiError('comfyui-endpoint-invalid', 'ComfyUI endpoint is invalid.');
  }
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new ComfyUiLocalApiError(
      'comfyui-endpoint-invalid',
      'ComfyUI endpoint must be an explicit HTTP loopback URL.',
    );
  }
  return url.href.replace(/\/$/u, '');
}

function requireUnredirectedLoopbackResponse(response: Response, label: string): void {
  if (response.redirected) {
    throw new ComfyUiLocalApiError(
      'comfyui-endpoint-invalid',
      `${label} followed a redirect, so its local endpoint identity cannot be trusted.`,
    );
  }
  if (!response.url) return;
  const responseUrl = new URL(response.url);
  if (
    responseUrl.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(responseUrl.hostname) ||
    responseUrl.username ||
    responseUrl.password
  ) {
    throw new ComfyUiLocalApiError(
      'comfyui-endpoint-invalid',
      `${label} returned from outside the explicit loopback boundary.`,
    );
  }
}

function requireWorkflow(value: Readonly<Record<string, unknown>>) {
  if (Object.keys(value).length === 0) {
    throw new ComfyUiLocalApiError(
      'comfyui-workflow-rejected',
      'ComfyUI workflow must contain at least one exact node.',
    );
  }
  return value;
}

function requirePromptRef(ref: ComfyUiPromptRef): string {
  if (ref.providerId !== 'comfyui') {
    throw new ComfyUiLocalApiError(
      'comfyui-prompt-unavailable',
      'ComfyUI prompt provider identity is invalid.',
    );
  }
  return requireIdentity(ref.promptId, 'ComfyUI prompt');
}

function requireIdentity(value: string, label: string): string {
  if (!value || value !== value.trim() || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)) {
    throw new ComfyUiLocalApiError('comfyui-response-invalid', `${label} identity is invalid.`);
  }
  return value;
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function sameOutput(left: ComfyUiOutputDescriptor, right: ComfyUiOutputDescriptor): boolean {
  return (
    left.filename === right.filename &&
    left.subfolder === right.subfolder &&
    left.outputType === right.outputType
  );
}
