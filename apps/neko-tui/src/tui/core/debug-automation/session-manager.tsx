import React from 'react';
import { render, type Instance } from 'ink';
import { Readable, Writable } from 'node:stream';
import type { CLIConfig } from '../types';
import { CliConfigLoadError, loadConfig, validateConfig } from '../config';
import { App } from '../../components/App';
import { assertCanonicalTuiConversationId } from '../tui-conversation-id';
import { createNodeTerminalInvocationContext } from '../node-locale-bootstrap';
import {
  subscribeTerminalMarkdownPathEvents,
  type TerminalMarkdownPathEvent,
} from '../../markdown/path-observer';
import {
  assertRecordParams,
  assertAllowedParamKeys,
  readOptionalBooleanParam,
  readOptionalStringParam,
  readRequiredPositiveIntegerParam,
  readRequiredStringParam,
  validateTuiDebugAutomationTimeout,
  TuiDebugAutomationProtocolError,
} from './protocol';
import type {
  TuiDebugAutomationAppPort,
  TuiDebugAutomationController,
  TuiDebugAutomationDisposeParams,
  TuiDebugAutomationFactsParams,
  TuiDebugAutomationMarkdownFacts,
  TuiDebugAutomationMessageCancelParams,
  TuiDebugAutomationMessageCancelled,
  TuiDebugAutomationMessageSubmitParams,
  TuiDebugAutomationRequest,
  TuiDebugAutomationSessionCreateParams,
  TuiDebugAutomationSessionCreated,
  TuiDebugAutomationSessionFacts,
  TuiDebugAutomationSessionRefParams,
  TuiDebugAutomationSessionResumeParams,
  TuiDebugAutomationTerminalResizeParams,
  TuiDebugAutomationTerminalResized,
  TuiDebugAutomationWaitForIdleParams,
} from './types';

const DEFAULT_READY_TIMEOUT_MS = 30_000;
const DEFAULT_IDLE_TIMEOUT_MS = 120_000;
const DEFAULT_IDLE_POLL_INTERVAL_MS = 100;
const MAX_TERMINAL_COLUMNS = 1_000;
const MAX_TERMINAL_ROWS = 1_000;
const MAX_MARKDOWN_PATH_EVENTS = 2_048;

export interface TuiDebugAutomationSessionManagerOptions {
  readonly defaultWorkDir: string;
  readonly provider?: string;
  readonly model?: string;
  readonly apiKey?: string;
  readonly createSessionId?: () => string;
}

export class TuiDebugAutomationSessionManager {
  private readonly sessions = new Map<string, TuiDebugAutomationSessionRecord>();
  private sequence = 0;

  constructor(private readonly options: TuiDebugAutomationSessionManagerOptions) {}

  async handle(request: TuiDebugAutomationRequest): Promise<unknown> {
    switch (request.method) {
      case 'session.create':
        return this.createSession(readCreateParams(request));
      case 'session.resume':
        return this.resumeSession(readResumeParams(request));
      case 'message.submit':
        return this.submitMessage(readMessageSubmitParams(request));
      case 'message.cancel':
        return this.cancelMessage(readMessageCancelParams(request));
      case 'terminal.resize':
        return this.resizeTerminal(readTerminalResizeParams(request));
      case 'session.waitForIdle':
        return this.waitForIdle(readWaitForIdleParams(request));
      case 'session.facts':
        return this.readFacts(readFactsParams(request));
      case 'session.dispose':
        return this.disposeSession(readDisposeParams(request));
    }
  }

  async disposeAll(): Promise<void> {
    for (const session of this.sessions.values()) {
      session.dispose();
    }
    this.sessions.clear();
  }

  private async createSession(
    params: TuiDebugAutomationSessionCreateParams,
  ): Promise<TuiDebugAutomationSessionCreated> {
    return this.mountSession(params);
  }

  private async resumeSession(
    params: TuiDebugAutomationSessionResumeParams,
  ): Promise<TuiDebugAutomationSessionCreated> {
    const conversationId = assertCanonicalTuiConversationId(params.conversationId);
    return this.mountSession({ ...params, initialPrompt: params.initialPrompt }, conversationId);
  }

  private async mountSession(
    params: TuiDebugAutomationSessionCreateParams,
    resumeConversationId?: string,
  ): Promise<TuiDebugAutomationSessionCreated> {
    const config = this.loadSessionConfig(params);
    const sessionId = this.nextSessionId();
    const controller = new TuiDebugAutomationAppController(sessionId);
    const output = new TuiAutomationNullWriteStream();
    const input = new TuiAutomationEmptyReadStream();
    let instance: Instance;
    try {
      instance = render(
        <App
          config={config}
          initialPrompt={params.initialPrompt}
          resumeConversationId={resumeConversationId}
          terminal={createNodeTerminalInvocationContext({ workDir: config.workDir })}
          automation={controller}
        />,
        {
          stdout: output.asWriteStream(),
          stderr: output.asWriteStream(),
          stdin: input.asReadStream(),
          patchConsole: false,
          exitOnCtrlC: false,
        },
      );
    } catch (error) {
      controller.dispose();
      throw error;
    }
    const record = new TuiDebugAutomationSessionRecord(sessionId, controller, instance);
    this.sessions.set(sessionId, record);

    try {
      const port = await controller.waitForPort(DEFAULT_READY_TIMEOUT_MS);
      await controller.waitUntilReady(DEFAULT_READY_TIMEOUT_MS, sessionId);
      return {
        sessionId,
        conversationId: port.getConversationId(),
      };
    } catch (error) {
      record.dispose();
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  private async submitMessage(params: TuiDebugAutomationMessageSubmitParams): Promise<{
    readonly sessionId: string;
    readonly conversationId: string;
    readonly queued: boolean;
  }> {
    const session = this.requireSession(params);
    const before = await session.readFacts(false);
    await session.port.submitMessage({ prompt: params.prompt });
    const after = await session.readFacts(false);
    const beforePending = before.messageQueue?.pendingCount ?? 0;
    const afterPending = after.messageQueue?.pendingCount ?? 0;
    return {
      sessionId: params.sessionId,
      conversationId: after.conversationId,
      queued: afterPending > beforePending,
    };
  }

  private cancelMessage(
    params: TuiDebugAutomationMessageCancelParams,
  ): TuiDebugAutomationMessageCancelled {
    const session = this.requireSession(params);
    return {
      sessionId: params.sessionId,
      conversationId: session.port.getConversationId(),
      accepted: session.port.cancelActiveMessage(),
    };
  }

  private async resizeTerminal(
    params: TuiDebugAutomationTerminalResizeParams,
  ): Promise<TuiDebugAutomationTerminalResized> {
    const session = this.requireSession(params);
    session.port.resizeTerminal({ columns: params.columns, rows: params.rows });
    await new Promise<void>((resolve) => setImmediate(resolve));
    return { sessionId: params.sessionId, columns: params.columns, rows: params.rows };
  }

  private async waitForIdle(params: TuiDebugAutomationWaitForIdleParams): Promise<unknown> {
    const session = this.requireSession(params);
    const timeoutMs = validateTuiDebugAutomationTimeout(params.timeoutMs, {
      defaultMs: DEFAULT_IDLE_TIMEOUT_MS,
      label: 'timeoutMs',
    });
    const pollIntervalMs = validateTuiDebugAutomationTimeout(params.pollIntervalMs, {
      defaultMs: DEFAULT_IDLE_POLL_INTERVAL_MS,
      label: 'pollIntervalMs',
      maxMs: 10_000,
    });
    return session.port.waitForIdle({ timeoutMs, pollIntervalMs });
  }

  private async readFacts(
    params: TuiDebugAutomationFactsParams,
  ): Promise<TuiDebugAutomationSessionFacts> {
    const session = this.requireSession(params);
    return session.readFacts(params.includeHistory === true);
  }

  private disposeSession(params: TuiDebugAutomationDisposeParams): {
    readonly sessionId: string;
    readonly disposed: true;
  } {
    const session = this.requireSession(params);
    session.dispose();
    this.sessions.delete(params.sessionId);
    return {
      sessionId: params.sessionId,
      disposed: true,
    };
  }

  private requireSession(
    params: TuiDebugAutomationSessionRefParams,
  ): TuiDebugAutomationSessionRecord {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new TuiDebugAutomationProtocolError(
        'session-not-found',
        `Unknown debug automation session: ${params.sessionId}`,
        { sessionId: params.sessionId },
      );
    }
    if (session.disposed) {
      throw new TuiDebugAutomationProtocolError(
        'session-disposed',
        `Debug automation session is disposed: ${params.sessionId}`,
        { sessionId: params.sessionId },
      );
    }
    return session;
  }

  private loadSessionConfig(params: TuiDebugAutomationSessionCreateParams): CLIConfig {
    const workDir = params.workDir ?? this.options.defaultWorkDir;
    let config: CLIConfig;
    try {
      const loaded = loadConfig(workDir, {
        provider: params.provider ?? this.options.provider,
        model: params.model ?? this.options.model,
        apiKey: params.apiKey ?? this.options.apiKey,
        defaultModelPurposes: params.modelPurposes,
      });
      config = { ...loaded, ...(params.runtimeConfig ?? {}) };
    } catch (error) {
      if (error instanceof CliConfigLoadError) {
        throw new TuiDebugAutomationProtocolError(
          'invalid-request',
          'Debug automation session configuration could not be loaded.',
          { diagnostic: error.diagnostic },
        );
      }
      throw error;
    }
    const validation = validateConfig(config);
    if (!validation.valid) {
      throw new TuiDebugAutomationProtocolError(
        'invalid-request',
        'Debug automation session configuration is invalid.',
        { diagnostics: validation.diagnostics },
      );
    }
    return config;
  }

  private nextSessionId(): string {
    if (this.options.createSessionId) {
      return this.options.createSessionId();
    }
    this.sequence += 1;
    return `debug-session-${this.sequence}`;
  }
}

class TuiDebugAutomationSessionRecord {
  disposed = false;

  constructor(
    readonly sessionId: string,
    private readonly controller: TuiDebugAutomationAppController,
    private readonly instance: Instance,
  ) {}

  get port(): TuiDebugAutomationAppPort {
    const port = this.controller.currentPort;
    if (!port) {
      throw new TuiDebugAutomationProtocolError(
        'session-not-ready',
        `Debug automation session is not ready: ${this.sessionId}`,
      );
    }
    return port;
  }

  async readFacts(includeHistory: boolean): Promise<TuiDebugAutomationSessionFacts> {
    return this.port.readFacts({ sessionId: this.sessionId, includeHistory });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.instance.unmount();
    this.instance.cleanup();
    this.controller.dispose();
  }
}

class TuiDebugAutomationAppController implements TuiDebugAutomationController {
  currentPort: TuiDebugAutomationAppPort | null = null;
  private readonly waiters: Array<(port: TuiDebugAutomationAppPort) => void> = [];
  private readonly markdownPathEvents: TerminalMarkdownPathEvent[] = [];
  private droppedMarkdownPathEventCount = 0;
  private readonly unsubscribeMarkdownPathEvents: () => void;

  constructor(readonly sessionId: string) {
    this.unsubscribeMarkdownPathEvents = subscribeTerminalMarkdownPathEvents((event) => {
      if (this.markdownPathEvents.length >= MAX_MARKDOWN_PATH_EVENTS) {
        this.markdownPathEvents.shift();
        this.droppedMarkdownPathEventCount += 1;
      }
      this.markdownPathEvents.push(event);
    });
  }

  bind(port: TuiDebugAutomationAppPort): void {
    if (port.ownerKind !== 'tui-app-session-owner') {
      throw new TuiDebugAutomationProtocolError(
        'invalid-request',
        'Debug automation can only bind the TUI App/session owner.',
      );
    }
    this.currentPort = port;
    for (const waiter of this.waiters.splice(0)) {
      waiter(port);
    }
  }

  unbind(port: TuiDebugAutomationAppPort): void {
    if (this.currentPort === port) {
      this.currentPort = null;
    }
  }

  readMarkdownFacts(): TuiDebugAutomationMarkdownFacts {
    return {
      pathEvents: [...this.markdownPathEvents],
      droppedPathEventCount: this.droppedMarkdownPathEventCount,
    };
  }

  dispose(): void {
    this.unsubscribeMarkdownPathEvents();
  }

  waitForPort(timeoutMs: number): Promise<TuiDebugAutomationAppPort> {
    if (this.currentPort) {
      return Promise.resolve(this.currentPort);
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waiters.indexOf(resolve);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(
          new TuiDebugAutomationProtocolError(
            'session-timeout',
            `Timed out waiting for TUI App/session owner for ${this.sessionId}.`,
          ),
        );
      }, timeoutMs);
      this.waiters.push((port) => {
        clearTimeout(timeout);
        resolve(port);
      });
    });
  }

  async waitUntilReady(timeoutMs: number, sessionId: string): Promise<void> {
    const startedAt = Date.now();
    for (;;) {
      const port = await this.waitForPort(timeoutMs);
      const initializationError = port.getInitializationError();
      if (initializationError) {
        throw new TuiDebugAutomationProtocolError(
          'internal-error',
          `TUI session initialization failed for ${this.sessionId}.`,
          { sessionId, diagnostic: initializationError.message },
        );
      }
      if (port.isReady()) {
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        const facts = await port.readFacts({ sessionId, includeHistory: false }).catch((error) => ({
          factReadError: error instanceof Error ? error.message : String(error),
        }));
        throw new TuiDebugAutomationProtocolError(
          'session-timeout',
          `Timed out waiting for TUI session readiness for ${this.sessionId}.`,
          facts,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

class TuiAutomationNullWriteStream extends Writable {
  readonly columns = 120;
  readonly rows = 30;
  readonly isTTY = false;

  override _write(
    _chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }

  asWriteStream(): NodeJS.WriteStream {
    return this as unknown as NodeJS.WriteStream;
  }
}

export class TuiAutomationEmptyReadStream extends Readable {
  readonly isTTY = true;

  override _read(): void {
    // Automation submits through the TUI input adapter instead of terminal stdin.
  }

  setRawMode(_mode: boolean): this {
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  asReadStream(): NodeJS.ReadStream {
    return this as unknown as NodeJS.ReadStream;
  }
}

function readCreateParams(
  request: TuiDebugAutomationRequest,
): TuiDebugAutomationSessionCreateParams {
  const params = assertRecordParams(request.params, request.method);
  assertAllowedParamKeys(
    params,
    ['workDir', 'provider', 'model', 'apiKey', 'initialPrompt', 'runtimeConfig', 'modelPurposes'],
    request.method,
  );
  return readSessionCreateFields(params, request.method);
}

function readSessionCreateFields(
  params: Record<string, unknown>,
  method: TuiDebugAutomationRequest['method'],
): TuiDebugAutomationSessionCreateParams {
  return {
    workDir: readOptionalStringParam(params, 'workDir'),
    provider: readOptionalStringParam(params, 'provider'),
    model: readOptionalStringParam(params, 'model'),
    apiKey: readOptionalStringParam(params, 'apiKey'),
    initialPrompt: readOptionalStringParam(params, 'initialPrompt'),
    runtimeConfig: readRuntimeConfig(params['runtimeConfig'], method),
    modelPurposes: readModelPurposes(params['modelPurposes'], method),
  };
}

function readResumeParams(
  request: TuiDebugAutomationRequest,
): TuiDebugAutomationSessionResumeParams {
  const params = assertRecordParams(request.params, request.method);
  assertAllowedParamKeys(
    params,
    [
      'workDir',
      'provider',
      'model',
      'apiKey',
      'initialPrompt',
      'runtimeConfig',
      'modelPurposes',
      'conversationId',
    ],
    request.method,
  );
  return {
    ...readSessionCreateFields(params, request.method),
    conversationId: readRequiredStringParam(params, 'conversationId', request.method),
  };
}

function readMessageSubmitParams(
  request: TuiDebugAutomationRequest,
): TuiDebugAutomationMessageSubmitParams {
  const params = assertRecordParams(request.params, request.method);
  assertAllowedParamKeys(params, ['sessionId', 'prompt'], request.method);
  return {
    sessionId: readRequiredStringParam(params, 'sessionId', request.method),
    prompt: readRequiredStringParam(params, 'prompt', request.method),
  };
}

function readMessageCancelParams(
  request: TuiDebugAutomationRequest,
): TuiDebugAutomationMessageCancelParams {
  const params = assertRecordParams(request.params, request.method);
  assertAllowedParamKeys(params, ['sessionId'], request.method);
  return {
    sessionId: readRequiredStringParam(params, 'sessionId', request.method),
  };
}

function readTerminalResizeParams(
  request: TuiDebugAutomationRequest,
): TuiDebugAutomationTerminalResizeParams {
  const params = assertRecordParams(request.params, request.method);
  assertAllowedParamKeys(params, ['sessionId', 'columns', 'rows'], request.method);
  return {
    sessionId: readRequiredStringParam(params, 'sessionId', request.method),
    columns: readRequiredPositiveIntegerParam(
      params,
      'columns',
      request.method,
      MAX_TERMINAL_COLUMNS,
    ),
    rows: readRequiredPositiveIntegerParam(params, 'rows', request.method, MAX_TERMINAL_ROWS),
  };
}

function readWaitForIdleParams(
  request: TuiDebugAutomationRequest,
): TuiDebugAutomationWaitForIdleParams {
  const params = assertRecordParams(request.params, request.method);
  assertAllowedParamKeys(params, ['sessionId', 'timeoutMs', 'pollIntervalMs'], request.method);
  return {
    sessionId: readRequiredStringParam(params, 'sessionId', request.method),
    timeoutMs: readOptionalNumberParam(params, 'timeoutMs'),
    pollIntervalMs: readOptionalNumberParam(params, 'pollIntervalMs'),
  };
}

function readFactsParams(request: TuiDebugAutomationRequest): TuiDebugAutomationFactsParams {
  const params = assertRecordParams(request.params, request.method);
  assertAllowedParamKeys(params, ['sessionId', 'includeHistory'], request.method);
  return {
    sessionId: readRequiredStringParam(params, 'sessionId', request.method),
    includeHistory: readOptionalBooleanParam(params, 'includeHistory'),
  };
}

function readDisposeParams(request: TuiDebugAutomationRequest): TuiDebugAutomationDisposeParams {
  const params = assertRecordParams(request.params, request.method);
  assertAllowedParamKeys(params, ['sessionId'], request.method);
  return {
    sessionId: readRequiredStringParam(params, 'sessionId', request.method),
  };
}

function readRuntimeConfig(
  value: unknown,
  method: TuiDebugAutomationRequest['method'],
): TuiDebugAutomationSessionCreateParams['runtimeConfig'] {
  if (value === undefined) return undefined;
  const config = assertRecordParams(value, method);
  assertAllowedParamKeys(
    config,
    ['executionMode', 'temperature', 'maxTokens', 'thinkingBudget', 'outputFormat'],
    method,
    'params.runtimeConfig',
  );
  const outputFormat = readOptionalStringParam(config, 'outputFormat');
  const executionMode = readOptionalStringParam(config, 'executionMode');
  if (
    executionMode !== undefined &&
    executionMode !== 'auto' &&
    executionMode !== 'ask' &&
    executionMode !== 'plan'
  ) {
    throw new TuiDebugAutomationProtocolError(
      'invalid-request',
      'session runtimeConfig.executionMode must be auto, ask, or plan.',
      { received: executionMode },
    );
  }
  if (
    outputFormat !== undefined &&
    outputFormat !== 'text' &&
    outputFormat !== 'json' &&
    outputFormat !== 'markdown'
  ) {
    throw new TuiDebugAutomationProtocolError(
      'invalid-request',
      'session runtimeConfig.outputFormat must be text, json, or markdown.',
      { received: outputFormat },
    );
  }
  const temperature = readOptionalNumberParam(config, 'temperature');
  const maxTokens = readOptionalNumberParam(config, 'maxTokens');
  const thinkingBudget = readOptionalNumberParam(config, 'thinkingBudget');
  return {
    ...(executionMode ? { executionMode } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(thinkingBudget !== undefined ? { thinkingBudget } : {}),
    ...(outputFormat ? { outputFormat } : {}),
  };
}

const DEBUG_MODEL_PURPOSES = [
  'image.generate',
  'image.edit',
  'image.understand',
  'video.generate',
  'video.understand',
  'audio.generate',
  'audio.tts',
  'audio.understand',
  'audio.music.generate',
] as const;

function readModelPurposes(
  value: unknown,
  method: TuiDebugAutomationRequest['method'],
): TuiDebugAutomationSessionCreateParams['modelPurposes'] {
  if (value === undefined) return undefined;
  const entries = assertRecordParams(value, method);
  assertAllowedParamKeys(entries, DEBUG_MODEL_PURPOSES, method, 'params.modelPurposes');
  const result: NonNullable<TuiDebugAutomationSessionCreateParams['modelPurposes']> = {};
  for (const purpose of DEBUG_MODEL_PURPOSES) {
    const candidate = entries[purpose];
    if (candidate === undefined) continue;
    const binding = assertRecordParams(candidate, method);
    assertAllowedParamKeys(
      binding,
      ['providerId', 'modelId'],
      method,
      `params.modelPurposes.${purpose}`,
    );
    result[purpose] = {
      providerId: readRequiredStringParam(binding, 'providerId', method),
      modelId: readRequiredStringParam(binding, 'modelId', method),
    };
  }
  return result;
}

function readOptionalNumberParam(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number') {
    throw new TuiDebugAutomationProtocolError(
      'invalid-request',
      `params.${key} must be a number when provided.`,
      { key, received: value },
    );
  }
  return value;
}
