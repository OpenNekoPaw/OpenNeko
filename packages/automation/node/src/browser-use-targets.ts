import {
  parseAutomationTarget,
  sameAutomationTarget,
  type AutomationTarget,
  type BrowserAutomationTarget,
} from '@neko/automation-contracts';
import type { AutomationTargetDiscoveryPort } from './session-authorization';

export interface IsolatedBrowserTargetDiscovery extends AutomationTargetDiscoveryPort {
  listCandidates(input: {
    readonly sessionId: string;
    readonly targetHint?: unknown;
    readonly signal?: AbortSignal;
  }): Promise<readonly BrowserAutomationTarget[]>;
}

export function createIsolatedBrowserTargetDiscovery(): IsolatedBrowserTargetDiscovery {
  return Object.freeze({
    async listCandidates(input: {
      readonly sessionId: string;
      readonly targetHint?: unknown;
      readonly signal?: AbortSignal;
    }) {
      throwIfAborted(input.signal);
      const sessionId = identity(input.sessionId, 'Browser Automation session');
      const origin = parseTargetOrigin(input.targetHint);
      return Object.freeze([createTarget(sessionId, origin)]);
    },

    async revalidate(input: { readonly target: AutomationTarget; readonly signal?: AbortSignal }) {
      throwIfAborted(input.signal);
      if (input.target.kind !== 'browser') {
        throw new Error('Browser Use target discovery requires a Browser Automation target.');
      }
      const expected = createTarget(input.target.browserSessionId, input.target.origin);
      if (!sameAutomationTarget(input.target, expected)) {
        throw new Error('Browser Use isolated target identity is invalid or changed.');
      }
      return expected;
    },
  });
}

function createTarget(sessionId: string, origin: string): BrowserAutomationTarget {
  const hostname = new URL(origin).hostname;
  const target = parseAutomationTarget({
    kind: 'browser',
    targetKey: `browser-target:${sessionId}`,
    browserProfileId: `browser-profile:${sessionId}`,
    browserSessionId: sessionId,
    tabId: `browser-page:${sessionId}`,
    origin,
    allowedDomains: [hostname],
    label: origin,
  });
  if (target.kind !== 'browser') {
    throw new Error('Browser Use target projection produced a non-Browser target.');
  }
  return target;
}

function parseTargetOrigin(value: unknown): string {
  if (!isRecord(value) || Object.keys(value).length !== 1) {
    throw new Error('Browser Automation requires one exact target origin.');
  }
  const origin = value['origin'];
  if (typeof origin !== 'string' || origin.length === 0 || origin !== origin.trim()) {
    throw new Error('Browser Automation target origin is invalid.');
  }
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error('Browser Automation target origin is invalid.');
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.origin !== origin ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.pathname !== '/' ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new Error('Browser Automation target must be a canonical HTTP(S) origin.');
  }
  return parsed.origin;
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new Error('Browser Automation was aborted.');
}
