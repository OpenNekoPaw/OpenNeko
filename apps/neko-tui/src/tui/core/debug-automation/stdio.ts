import { Console } from 'node:console';
import type { Readable, Writable } from 'node:stream';
import {
  createTuiDebugAutomationErrorResponse,
  createTuiDebugAutomationSuccessResponse,
  parseTuiDebugAutomationRequest,
} from './protocol';
import type { TuiDebugAutomationRequest } from './types';

export interface TuiDebugAutomationRequestHandler {
  handle(request: TuiDebugAutomationRequest): Promise<unknown>;
}

export interface TuiDebugAutomationStdioOptions {
  readonly input: Readable;
  readonly output: Writable;
  readonly handler: TuiDebugAutomationRequestHandler;
  /** Receives transitive console output while stdout is reserved for protocol frames. */
  readonly diagnosticOutput?: Writable;
}

export function runTuiDebugAutomationJsonLineServer(
  options: TuiDebugAutomationStdioOptions,
): Promise<void> {
  const { input, output, handler } = options;
  const restoreConsole = reserveStdoutForProtocol(options.diagnosticOutput ?? process.stderr);
  let buffer = '';
  let closed = false;
  let closing = false;
  let pending = Promise.resolve();

  return new Promise<void>((resolve) => {
    const detachInput = (): void => {
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('close', onEnd);
      input.off('error', onError);
    };

    const cleanup = (): void => {
      detachInput();
      restoreConsole();
    };

    const close = (): void => {
      if (closed) return;
      closed = true;
      cleanup();
      resolve();
    };

    const closeAfterPending = (): void => {
      if (closed || closing) return;
      closing = true;
      detachInput();
      void pending.then(close, close);
    };

    const writeResponse = (response: unknown): void => {
      output.write(`${JSON.stringify(response)}\n`);
    };

    const handleLine = (rawLine: string): void => {
      const line = rawLine.trim();
      if (!line) return;
      pending = pending.then(async () => {
        let requestId: string | null = null;
        try {
          const request = parseTuiDebugAutomationRequest(line);
          requestId = request.id;
          const result = await handler.handle(request);
          writeResponse(createTuiDebugAutomationSuccessResponse(request.id, result));
        } catch (error) {
          writeResponse(createTuiDebugAutomationErrorResponse(error, requestId));
        }
      });
    };

    const drainBuffer = (): void => {
      for (;;) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex < 0) return;
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        handleLine(line);
      }
    };

    function onData(chunk: Buffer | string): void {
      buffer += chunk.toString();
      drainBuffer();
    }

    function onEnd(): void {
      if (closed || closing) return;
      const trailing = buffer.trim();
      buffer = '';
      if (trailing) {
        handleLine(trailing);
      }
      closeAfterPending();
    }

    function onError(error: Error): void {
      if (closed || closing) return;
      writeResponse(createTuiDebugAutomationErrorResponse(error));
      closeAfterPending();
    }

    input.on('data', onData);
    input.once('end', onEnd);
    input.once('close', onEnd);
    input.once('error', onError);
  });
}

interface ConsoleReservation {
  readonly token: symbol;
  readonly console: unknown;
}

let consoleReservationBase: typeof globalThis.console | undefined;
const consoleReservations: ConsoleReservation[] = [];

function reserveStdoutForProtocol(diagnosticOutput: Writable): () => void {
  if (consoleReservations.length === 0) {
    consoleReservationBase = globalThis.console;
  }

  const reservation: ConsoleReservation = {
    token: Symbol('tui-debug-automation-console'),
    console: new Console({
      stdout: diagnosticOutput,
      stderr: diagnosticOutput,
      colorMode: false,
    }),
  };
  consoleReservations.push(reservation);
  setGlobalConsole(reservation.console);

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;

    const index = consoleReservations.findIndex((entry) => entry.token === reservation.token);
    if (index < 0) return;
    const wasActive = index === consoleReservations.length - 1;
    consoleReservations.splice(index, 1);
    if (!wasActive) return;

    const nextConsole = consoleReservations.at(-1)?.console ?? consoleReservationBase;
    if (nextConsole !== undefined) {
      setGlobalConsole(nextConsole);
    }
    if (consoleReservations.length === 0) {
      consoleReservationBase = undefined;
    }
  };
}

function setGlobalConsole(value: unknown): void {
  Object.defineProperty(globalThis, 'console', {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}
