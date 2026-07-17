/**
 * ConversationId helpers.
 *
 * Canonical format:
 *   <workDirHash>-<ulid>
 *
 * - workDirHash: 8-char lowercase base36 hash derived from workDir
 * - ulid: 26-char Crockford base32, lexicographically sortable by time
 */

import { createHash, randomBytes } from 'node:crypto';

const CROCKFORD_BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const WORK_DIR_HASH_WIDTH = 8;
const ULID_TIMESTAMP_WIDTH = 10;
const ULID_RANDOM_WIDTH = 16;
const ULID_RANDOM_BYTES = 10;
const WORK_DIR_HASH_SPACE = 36n ** BigInt(WORK_DIR_HASH_WIDTH);
const MAX_ULID_TIMESTAMP = 2n ** 48n - 1n;

export interface ConversationIdOptions {
  now?: number;
  random?: Uint8Array;
}

export interface ParsedConversationId {
  workDirHash: string;
  ulid: string;
}

export function createConversationId(workDir: string, options: ConversationIdOptions = {}): string {
  return `${getConversationWorkDirHash(workDir)}-${createUlid(options)}`;
}

export function getConversationWorkDirHash(workDir: string): string {
  const digest = createHash('sha256').update(workDir).digest();
  let value = 0n;

  // Use the first 48 bits and fold them into a fixed 8-char base36 space.
  for (let index = 0; index < 6; index += 1) {
    value = (value << 8n) | BigInt(digest[index] ?? 0);
  }

  return (value % WORK_DIR_HASH_SPACE).toString(36).padStart(WORK_DIR_HASH_WIDTH, '0');
}

export function isCanonicalConversationId(conversationId: string): boolean {
  return parseConversationId(conversationId) !== null;
}

export function parseConversationId(conversationId: string): ParsedConversationId | null {
  const matched = /^([0-9a-z]{8})-([0-9A-HJKMNP-TV-Z]{26})$/.exec(conversationId);
  if (!matched) {
    return null;
  }

  return {
    workDirHash: matched[1],
    ulid: matched[2],
  };
}

function createUlid(options: ConversationIdOptions): string {
  const now = BigInt(normalizeTimestamp(options.now));
  if (now < 0n || now > MAX_ULID_TIMESTAMP) {
    throw new RangeError('ULID timestamp is out of range');
  }

  const entropy = options.random ?? randomBytes(ULID_RANDOM_BYTES);
  if (entropy.length !== ULID_RANDOM_BYTES) {
    throw new RangeError(`ULID entropy must be ${ULID_RANDOM_BYTES} bytes`);
  }

  return `${encodeBase32(now, ULID_TIMESTAMP_WIDTH)}${encodeBase32(bytesToBigInt(entropy), ULID_RANDOM_WIDTH)}`;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

function encodeBase32(value: bigint, length: number): string {
  let remaining = value;
  const encoded = Array.from({ length }, () => '0');

  for (let index = length - 1; index >= 0; index -= 1) {
    encoded[index] = CROCKFORD_BASE32_ALPHABET[Number(remaining & 31n)] ?? '0';
    remaining >>= 5n;
  }

  return encoded.join('');
}

function normalizeTimestamp(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return Date.now();
  }
  return Math.floor(value);
}
