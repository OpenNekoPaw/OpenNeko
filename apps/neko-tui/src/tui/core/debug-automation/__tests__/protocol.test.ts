import { describe, expect, it } from 'vitest';
import {
  TuiDebugAutomationProtocolError,
  parseTuiDebugAutomationRequest,
  readRequiredPositiveIntegerParam,
  validateTuiDebugAutomationTimeout,
} from '../protocol';
import { TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA } from '../types';

describe('TUI debug automation protocol', () => {
  it('parses a valid request', () => {
    const request = parseTuiDebugAutomationRequest(
      JSON.stringify({
        schema: TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA,
        id: '1',
        method: 'session.facts',
        params: { sessionId: 'debug-session-1' },
      }),
    );

    expect(request).toMatchObject({
      id: '1',
      method: 'session.facts',
      params: { sessionId: 'debug-session-1' },
    });
  });

  it('fails visibly for invalid json, schema, and unknown method', () => {
    expect(() => parseTuiDebugAutomationRequest('{')).toThrow(TuiDebugAutomationProtocolError);
    expect(() =>
      parseTuiDebugAutomationRequest(
        JSON.stringify({ schema: 'wrong', id: '1', method: 'session.facts' }),
      ),
    ).toThrow('request schema');
    expect(() =>
      parseTuiDebugAutomationRequest(
        JSON.stringify({
          schema: TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA,
          id: '1',
          method: 'agent.turn',
        }),
      ),
    ).toThrow('Unknown debug automation method');
  });

  it('accepts message.cancel as a generic active-turn control', () => {
    const request = parseTuiDebugAutomationRequest(
      JSON.stringify({
        schema: TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA,
        id: 'cancel-1',
        method: 'message.cancel',
        params: { sessionId: 'debug-session-1' },
      }),
    );
    expect(request.method).toBe('message.cancel');
  });

  it('accepts tool.confirm as a generic pending-confirmation control', () => {
    const request = parseTuiDebugAutomationRequest(
      JSON.stringify({
        schema: TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA,
        id: 'confirm-1',
        method: 'tool.confirm',
        params: {
          sessionId: 'debug-session-1',
          toolName: 'BindEntityRepresentation',
          approved: true,
        },
      }),
    );
    expect(request.method).toBe('tool.confirm');
  });

  it('accepts terminal.resize and validates its positive integer bounds', () => {
    const request = parseTuiDebugAutomationRequest(
      JSON.stringify({
        schema: TUI_DEBUG_AUTOMATION_REQUEST_SCHEMA,
        id: 'resize-1',
        method: 'terminal.resize',
        params: { sessionId: 'debug-session-1', columns: 120, rows: 40 },
      }),
    );
    expect(request.method).toBe('terminal.resize');

    const method = 'terminal.resize' as const;
    expect(readRequiredPositiveIntegerParam({ columns: 1 }, 'columns', method, 1_000)).toBe(1);
    expect(readRequiredPositiveIntegerParam({ columns: 1_000 }, 'columns', method, 1_000)).toBe(
      1_000,
    );
    expect(() =>
      readRequiredPositiveIntegerParam({ columns: 0 }, 'columns', method, 1_000),
    ).toThrow('positive integer');
    expect(() =>
      readRequiredPositiveIntegerParam({ columns: 1.5 }, 'columns', method, 1_000),
    ).toThrow('positive integer');
    expect(() =>
      readRequiredPositiveIntegerParam({ columns: 1_001 }, 'columns', method, 1_000),
    ).toThrow('<= 1000');
  });

  it('validates timeout values without provider credentials', () => {
    expect(
      validateTuiDebugAutomationTimeout(undefined, { defaultMs: 42, label: 'timeoutMs' }),
    ).toBe(42);
    expect(() =>
      validateTuiDebugAutomationTimeout(0, { defaultMs: 42, label: 'timeoutMs' }),
    ).toThrow('positive integer');
    expect(() =>
      validateTuiDebugAutomationTimeout(20, {
        defaultMs: 42,
        label: 'timeoutMs',
        maxMs: 10,
      }),
    ).toThrow('<= 10ms');
  });
});
