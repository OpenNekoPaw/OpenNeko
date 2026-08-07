import type { SessionTreeEntry } from '@earendil-works/pi-agent-core';

export interface PortablePiConversationBranch {
  readonly branchId: string;
  readonly parentBranchId?: string;
  readonly state: 'active' | 'historical';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly entries: readonly SessionTreeEntry[];
}

export interface PortablePiConversationManifest {
  readonly workspaceId: string;
  readonly conversationId: string;
  readonly title: string;
  readonly activeBranchId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly branches: readonly PortablePiConversationBranch[];
}

const MANIFEST_FIELDS = new Set([
  'workspaceId',
  'conversationId',
  'title',
  'activeBranchId',
  'createdAt',
  'updatedAt',
  'branches',
]);
const BRANCH_FIELDS = new Set([
  'branchId',
  'parentBranchId',
  'state',
  'createdAt',
  'updatedAt',
  'entries',
]);

export function parsePortablePiConversationManifest(
  value: unknown,
): PortablePiConversationManifest {
  const manifest = requireRecord(value, 'Conversation manifest');
  rejectUnknownFields(manifest, MANIFEST_FIELDS, 'Conversation manifest');
  const branchesValue = manifest['branches'];
  if (!Array.isArray(branchesValue) || branchesValue.length === 0) {
    throw new TypeError('Conversation manifest branches must be a non-empty array.');
  }
  const branches = branchesValue.map((branch, index) => parseBranch(branch, index));
  const activeBranchId = requireText(manifest, 'activeBranchId', 'Conversation manifest');
  validateBranchTopology(branches, activeBranchId);
  return Object.freeze({
    workspaceId: requireText(manifest, 'workspaceId', 'Conversation manifest'),
    conversationId: requireText(manifest, 'conversationId', 'Conversation manifest'),
    title: requireText(manifest, 'title', 'Conversation manifest'),
    activeBranchId,
    createdAt: requireTimestamp(manifest, 'createdAt', 'Conversation manifest'),
    updatedAt: requireTimestamp(manifest, 'updatedAt', 'Conversation manifest'),
    branches: Object.freeze(branches),
  });
}

export function parsePortablePiConversationManifestJson(
  json: string,
): PortablePiConversationManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new TypeError(`Conversation manifest is not valid JSON: ${String(error)}`);
  }
  return parsePortablePiConversationManifest(parsed);
}

export function serializePortablePiConversationManifest(
  manifest: PortablePiConversationManifest,
): string {
  const parsed = parsePortablePiConversationManifest(manifest);
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function parseBranch(value: unknown, index: number): PortablePiConversationBranch {
  const label = `Conversation manifest branch ${index}`;
  const branch = requireRecord(value, label);
  rejectUnknownFields(branch, BRANCH_FIELDS, label);
  const state = requireText(branch, 'state', label);
  if (state !== 'active' && state !== 'historical') {
    throw new TypeError(`${label} state must be active or historical.`);
  }
  const entriesValue = branch['entries'];
  if (!Array.isArray(entriesValue)) throw new TypeError(`${label} entries must be an array.`);
  const entries = entriesValue.map((entry, entryIndex) =>
    parseSessionEntry(entry, `${label} entry ${entryIndex}`),
  );
  validateSessionEntryGraph(entries, label);
  const parentBranchId = optionalText(branch, 'parentBranchId', label);
  return Object.freeze({
    branchId: requireText(branch, 'branchId', label),
    ...(parentBranchId === undefined ? {} : { parentBranchId }),
    state,
    createdAt: requireTimestamp(branch, 'createdAt', label),
    updatedAt: requireTimestamp(branch, 'updatedAt', label),
    entries: Object.freeze(entries),
  });
}

function parseSessionEntry(value: unknown, label: string): SessionTreeEntry {
  if (!isSessionTreeEntry(value)) throw new TypeError(`${label} is not a valid Pi Session entry.`);
  if (!Number.isFinite(Date.parse(value.timestamp))) {
    throw new TypeError(`${label} timestamp must be an ISO timestamp.`);
  }
  return Object.freeze(structuredClone(value));
}

function isSessionTreeEntry(value: unknown): value is SessionTreeEntry {
  if (!isSessionTreeEntryBase(value)) return false;
  switch (value['type']) {
    case 'message':
      return isAgentMessage(value['message']);
    case 'thinking_level_change':
      return isText(value['thinkingLevel']);
    case 'model_change':
      return isText(value['provider']) && isText(value['modelId']);
    case 'active_tools_change':
      return isTextArray(value['activeToolNames']);
    case 'compaction':
      return (
        isText(value['summary']) &&
        isText(value['firstKeptEntryId']) &&
        isFiniteNumber(value['tokensBefore']) &&
        isOptionalBoolean(value['fromHook'])
      );
    case 'branch_summary':
      return (
        isText(value['fromId']) && isText(value['summary']) && isOptionalBoolean(value['fromHook'])
      );
    case 'custom':
      return isText(value['customType']);
    case 'custom_message':
      return (
        isText(value['customType']) &&
        (isText(value['content']) || isContentArray(value['content'], false)) &&
        typeof value['display'] === 'boolean'
      );
    case 'label':
      return isText(value['targetId']) && isOptionalText(value['label']);
    case 'session_info':
      return isOptionalText(value['name']);
    case 'leaf':
      return value['targetId'] === null || isText(value['targetId']);
    default:
      return false;
  }
}

function isSessionTreeEntryBase(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    isText(value['type']) &&
    isText(value['id']) &&
    (value['parentId'] === null || isText(value['parentId'])) &&
    isText(value['timestamp'])
  );
}

function isAgentMessage(value: unknown): boolean {
  if (!isRecord(value) || !isFiniteNumber(value['timestamp'])) return false;
  switch (value['role']) {
    case 'user':
      return isText(value['content']) || isContentArray(value['content'], false);
    case 'assistant':
      return (
        isContentArray(value['content'], true) &&
        isText(value['api']) &&
        isText(value['provider']) &&
        isText(value['model']) &&
        isUsage(value['usage']) &&
        ['stop', 'length', 'toolUse', 'error', 'aborted'].includes(String(value['stopReason']))
      );
    case 'toolResult':
      return (
        isText(value['toolCallId']) &&
        isText(value['toolName']) &&
        isContentArray(value['content'], false) &&
        typeof value['isError'] === 'boolean' &&
        (value['addedToolNames'] === undefined || isTextArray(value['addedToolNames']))
      );
    default:
      return false;
  }
}

function isContentArray(value: unknown, allowAssistantParts: boolean): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (part) =>
        isRecord(part) &&
        (isTextContent(part) ||
          isImageContent(part) ||
          (allowAssistantParts && (isThinkingContent(part) || isToolCall(part)))),
    )
  );
}

function isTextContent(value: Readonly<Record<string, unknown>>): boolean {
  return value['type'] === 'text' && typeof value['text'] === 'string';
}

function isImageContent(value: Readonly<Record<string, unknown>>): boolean {
  return value['type'] === 'image' && isText(value['data']) && isText(value['mimeType']);
}

function isThinkingContent(value: Readonly<Record<string, unknown>>): boolean {
  return value['type'] === 'thinking' && typeof value['thinking'] === 'string';
}

function isToolCall(value: Readonly<Record<string, unknown>>): boolean {
  return (
    value['type'] === 'toolCall' &&
    isText(value['id']) &&
    isText(value['name']) &&
    isRecord(value['arguments'])
  );
}

function isUsage(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value['cost'])) return false;
  const cost = value['cost'];
  return (
    ['input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'].every((field) =>
      isFiniteNumber(value[field]),
    ) &&
    ['input', 'output', 'cacheRead', 'cacheWrite', 'total'].every((field) =>
      isFiniteNumber(cost[field]),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('\0');
}

function isOptionalText(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isTextArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isText);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

function validateSessionEntryGraph(entries: readonly SessionTreeEntry[], label: string): void {
  const entryIds = new Set<string>();
  for (const entry of entries) {
    if (entryIds.has(entry.id)) throw new TypeError(`${label} repeats entry id '${entry.id}'.`);
    if (entry.parentId !== null && !entryIds.has(entry.parentId)) {
      throw new TypeError(`${label} entry '${entry.id}' has an unavailable parentId.`);
    }
    if (entry.type === 'leaf' && entry.targetId !== null && !entryIds.has(entry.targetId)) {
      throw new TypeError(`${label} entry '${entry.id}' has an unavailable targetId.`);
    }
    entryIds.add(entry.id);
  }
}

function validateBranchTopology(
  branches: readonly PortablePiConversationBranch[],
  activeBranchId: string,
): void {
  const branchIds = new Set<string>();
  for (const branch of branches) {
    if (branchIds.has(branch.branchId)) {
      throw new TypeError(`Conversation manifest repeats branch '${branch.branchId}'.`);
    }
    branchIds.add(branch.branchId);
  }
  for (const branch of branches) {
    if (branch.parentBranchId === branch.branchId) {
      throw new TypeError(`Conversation branch '${branch.branchId}' cannot parent itself.`);
    }
    if (branch.parentBranchId !== undefined && !branchIds.has(branch.parentBranchId)) {
      throw new TypeError(
        `Conversation branch '${branch.branchId}' has unavailable parent '${branch.parentBranchId}'.`,
      );
    }
  }
  const activeBranches = branches.filter((branch) => branch.state === 'active');
  if (activeBranches.length !== 1 || activeBranches[0]?.branchId !== activeBranchId) {
    throw new TypeError('Conversation manifest must identify exactly one matching active branch.');
  }
  for (const branch of branches) assertAcyclicBranch(branch, branches, new Set());
}

function assertAcyclicBranch(
  branch: PortablePiConversationBranch,
  branches: readonly PortablePiConversationBranch[],
  visited: Set<string>,
): void {
  if (visited.has(branch.branchId)) {
    throw new TypeError(`Conversation branch topology contains a cycle at '${branch.branchId}'.`);
  }
  if (branch.parentBranchId === undefined) return;
  const parent = branches.find((candidate) => candidate.branchId === branch.parentBranchId);
  if (parent === undefined) return;
  const nextVisited = new Set(visited);
  nextVisited.add(branch.branchId);
  assertAcyclicBranch(parent, branches, nextVisited);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return Object.fromEntries(Object.entries(value));
}

function rejectUnknownFields(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new TypeError(`${label} has unknown field '${field}'.`);
  }
}

function requireText(
  value: Readonly<Record<string, unknown>>,
  field: string,
  label: string,
): string {
  const candidate = value[field];
  if (typeof candidate !== 'string' || candidate.trim().length === 0 || candidate.includes('\0')) {
    throw new TypeError(`${label} ${field} must be non-empty text without NUL characters.`);
  }
  return candidate;
}

function optionalText(
  value: Readonly<Record<string, unknown>>,
  field: string,
  label: string,
): string | undefined {
  const candidate = value[field];
  return candidate === undefined ? undefined : requireText(value, field, label);
}

function requireTimestamp(
  value: Readonly<Record<string, unknown>>,
  field: string,
  label: string,
): string {
  const timestamp = requireText(value, field, label);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new TypeError(`${label} ${field} must be an ISO timestamp.`);
  }
  return timestamp;
}
