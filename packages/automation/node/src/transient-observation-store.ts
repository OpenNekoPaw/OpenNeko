import { randomUUID } from 'node:crypto';
import type { AutomationTransientObservationPort } from './index';

export interface AutomationTransientObservationReceipt {
  readonly receiptId: string;
  readonly sessionId: string;
  readonly actionId: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export interface AutomationTransientObservationStore extends AutomationTransientObservationPort {
  readReceipt(receiptId: string): AutomationTransientObservationReceipt | undefined;
  consume(input: {
    readonly receiptId: string;
    readonly sessionId: string;
    readonly actionId: string;
  }): { readonly receipt: AutomationTransientObservationReceipt; readonly data: Uint8Array };
  releaseSession(sessionId: string): void;
  dispose(): void;
}

interface ObservationRecord {
  readonly receipt: AutomationTransientObservationReceipt;
  readonly data: Uint8Array;
}

export function createAutomationTransientObservationStore(options: {
  readonly ttlMs: number;
  readonly maxBytes: number;
  readonly now?: () => number;
  readonly createId?: () => string;
}): AutomationTransientObservationStore {
  if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs <= 0) {
    throw new Error('Automation observation TTL must be a positive integer.');
  }
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) {
    throw new Error('Automation observation byte limit must be a positive integer.');
  }
  const now = options.now ?? Date.now;
  const createId = options.createId ?? randomUUID;
  const records = new Map<string, ObservationRecord>();

  const purgeExpired = (): void => {
    const current = now();
    for (const [receiptId, record] of records) {
      if (record.receipt.expiresAt <= current) records.delete(receiptId);
    }
  };

  const store: AutomationTransientObservationStore = {
    async publish(input) {
      purgeExpired();
      if (input.data.byteLength === 0 || input.data.byteLength > options.maxBytes) {
        throw new Error('Automation observation exceeds the transient byte limit.');
      }
      if (!Number.isSafeInteger(input.width) || input.width <= 0) {
        throw new Error('Automation observation width is invalid.');
      }
      if (!Number.isSafeInteger(input.height) || input.height <= 0) {
        throw new Error('Automation observation height is invalid.');
      }
      const receiptId = requireIdentity(createId(), 'receipt');
      if (records.has(receiptId)) {
        throw new Error(`Automation observation receipt '${receiptId}' is duplicated.`);
      }
      const createdAt = now();
      const receipt = Object.freeze({
        receiptId,
        sessionId: requireIdentity(input.sessionId, 'session'),
        actionId: requireIdentity(input.actionId, 'action'),
        mimeType: requireMimeType(input.mimeType),
        width: input.width,
        height: input.height,
        byteLength: input.data.byteLength,
        createdAt,
        expiresAt: createdAt + options.ttlMs,
      });
      records.set(receiptId, {
        receipt,
        data: Uint8Array.from(input.data),
      });
      return { receiptId };
    },
    readReceipt(receiptId) {
      purgeExpired();
      return records.get(receiptId)?.receipt;
    },
    consume(input) {
      purgeExpired();
      const record = records.get(input.receiptId);
      if (!record) throw new Error('Automation observation receipt is unavailable or expired.');
      if (
        record.receipt.sessionId !== input.sessionId ||
        record.receipt.actionId !== input.actionId
      ) {
        throw new Error('Automation observation receipt owner does not match the request.');
      }
      records.delete(input.receiptId);
      return { receipt: record.receipt, data: Uint8Array.from(record.data) };
    },
    releaseSession(sessionId) {
      for (const [receiptId, record] of records) {
        if (record.receipt.sessionId === sessionId) records.delete(receiptId);
      }
    },
    dispose() {
      records.clear();
    },
  };
  return Object.freeze(store);
}

function requireIdentity(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value)) {
    throw new Error(`Automation observation ${label} identity is invalid.`);
  }
  return value;
}

function requireMimeType(value: string): string {
  if (!/^image\/[a-z0-9.+-]+$/u.test(value)) {
    throw new Error('Automation observation MIME type is invalid.');
  }
  return value;
}
