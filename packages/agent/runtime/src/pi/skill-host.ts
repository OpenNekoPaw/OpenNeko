import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, relative } from 'node:path';

import {
  formatSkillInvocation,
  getOrThrow,
  loadSourcedSkills,
  type ExecutionEnv,
  type Skill,
  type SkillDiagnostic,
} from '@earendil-works/pi-agent-core';
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import type { ExternalProcessorResult } from '@neko/agent-contracts';
import { parse as parseYaml } from 'yaml';

export type SkillSourceKind = 'builtin' | 'personal' | 'plugin' | 'project';

export type SkillSource =
  | { readonly kind: 'builtin' | 'personal' | 'project' }
  | { readonly kind: 'plugin'; readonly pluginId: string };

export interface SkillSourceRoot {
  readonly path: string;
  readonly source: SkillSource;
  readonly entryPointKind: 'skill' | 'command-artifact';
}

export interface SkillLocator {
  readonly kind: 'skill';
  readonly value: string;
  readonly fingerprint: string;
}

export interface SkillResourceLocator {
  readonly kind: 'skill-resource';
  readonly value: string;
  readonly fingerprint: string;
  readonly relativePath: string;
}

export interface SkillHostRecord {
  readonly name: string;
  readonly description: string;
  readonly source: SkillSource;
  readonly trusted: boolean;
  readonly enabled: boolean;
  readonly fingerprint: string;
  readonly locator: SkillLocator;
  readonly entryPoint:
    | { readonly kind: 'skill' }
    | {
        readonly kind: 'command-artifact';
        readonly commandId: string;
        readonly artifactId: string;
        readonly argumentHint?: string;
        readonly supportsArguments: boolean;
      };
}

export function buildSkillActivationId(
  record: Pick<SkillHostRecord, 'source' | 'fingerprint' | 'entryPoint'>,
): string {
  const source =
    record.source.kind === 'plugin' ? `plugin:${record.source.pluginId}` : record.source.kind;
  return `skill:${source}:${record.entryPoint.kind}:${record.fingerprint}`;
}

export interface SkillContentReadResult {
  readonly content: string;
  readonly receipt: {
    readonly skillName: string;
    readonly source: SkillSource;
    readonly fingerprint: string;
    readonly locator: string;
    readonly locatorKind: 'skill' | 'skill-resource';
  };
}

export interface SkillHostPolicy {
  isTrusted(input: {
    readonly name: string;
    readonly source: SkillSource;
    readonly physicalSkillFile: string;
  }): boolean | Promise<boolean>;
  isEnabled(input: {
    readonly name: string;
    readonly source: SkillSource;
  }): boolean | Promise<boolean>;
}

export interface SkillHostWarning {
  readonly type: 'warning';
  readonly code: 'duplicate-skill';
  readonly message: string;
  readonly skillName: string;
  readonly selectedSource: SkillSourceKind;
  readonly shadowedSource: SkillSourceKind;
  readonly selectedPluginId?: string;
  readonly shadowedPluginId?: string;
}

export interface SkillExternalProcessorPermissionInput {
  readonly skillName: string;
  readonly source: SkillSource;
  readonly fingerprint: string;
  readonly script: SkillResourceLocator;
  readonly args: readonly string[];
  readonly conversationId: string;
  readonly turnId: string;
  readonly workspaceTrusted: boolean;
}

export type SkillExternalProcessorPermissionDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

export interface SkillExternalProcessorAuthorizer {
  authorize(
    input: SkillExternalProcessorPermissionInput,
  ): SkillExternalProcessorPermissionDecision | Promise<SkillExternalProcessorPermissionDecision>;
}

export interface SkillExternalProcessorExecutor {
  execute(input: {
    readonly physicalScriptPath: string;
    readonly args: readonly string[];
    readonly signal?: AbortSignal;
  }): Promise<SkillExternalProcessorResult>;
}

export type SkillExternalProcessorResult = ExternalProcessorResult;

export interface ExecuteSkillExternalProcessorInput {
  readonly skillName: string;
  readonly script: SkillResourceLocator;
  readonly args?: readonly string[];
  readonly conversationId: string;
  readonly turnId: string;
  readonly workspaceTrusted: boolean;
  readonly signal?: AbortSignal;
}

export type SkillHostErrorCode =
  | 'skill-not-found'
  | 'invalid-locator'
  | 'invalid-resource-path'
  | 'resource-outside-skill'
  | 'external-processor-denied'
  | 'external-processor-unavailable';

export class SkillHostError extends Error {
  readonly code: SkillHostErrorCode;

  constructor(code: SkillHostErrorCode, message: string) {
    super(message);
    this.name = 'SkillHostError';
    this.code = code;
  }
}

interface StoredSkill {
  readonly record: SkillHostRecord;
  readonly skill: Readonly<Skill>;
  readonly physicalRoot: string;
}

interface LoadedSkillEntry {
  readonly skill: Skill;
  readonly root: SkillSourceRoot;
  readonly commandMetadata?: {
    readonly argumentHint?: string;
    readonly supportsArguments: boolean;
  };
}

const SOURCE_PRIORITY: Readonly<Record<SkillSourceKind, number>> = {
  project: 4,
  personal: 3,
  plugin: 2,
  builtin: 1,
};

export class PiSkillHost {
  private readonly namespace = randomUUID();

  constructor(
    private readonly env: ExecutionEnv,
    private readonly policy: SkillHostPolicy,
    private readonly externalProcessor?: {
      readonly authorizer: SkillExternalProcessorAuthorizer;
      readonly executor: SkillExternalProcessorExecutor;
    },
  ) {}

  async discover(inputs: readonly SkillSourceRoot[]): Promise<PiSkillHostSnapshot> {
    for (const input of inputs) validateSkillSource(input.source);
    const loadedEntries: LoadedSkillEntry[] = [];
    const diagnostics: Array<SkillDiagnostic & { readonly source: SkillSource }> = [];
    for (const input of inputs) {
      if (input.entryPointKind === 'command-artifact') {
        const loaded = await loadCommandArtifacts(this.env, input);
        loadedEntries.push(...loaded.entries);
        diagnostics.push(...loaded.diagnostics);
        continue;
      }
      const loaded = await loadSourcedSkills(this.env, [
        { path: input.path, source: input.source },
      ]);
      loadedEntries.push(...loaded.skills.map(({ skill }) => ({ skill, root: input })));
      diagnostics.push(...loaded.diagnostics);
    }
    const candidates: StoredSkill[] = [];
    for (const { skill, root, commandMetadata } of loadedEntries) {
      const source = root.source;
      const trusted = await this.policy.isTrusted({
        name: skill.name,
        source,
        physicalSkillFile: skill.filePath,
      });
      const enabled = await this.policy.isEnabled({ name: skill.name, source });
      if (!trusted || !enabled) continue;

      const physicalRoot = getOrThrow(await this.env.canonicalPath(dirname(skill.filePath)));
      const fingerprint =
        root.entryPointKind === 'command-artifact'
          ? fingerprintCommandArtifact(skill, commandMetadata)
          : await fingerprintSkillPackage(this.env, skill, physicalRoot);
      const locator = createSkillLocator(this.namespace, fingerprint);
      const projectedSkill = Object.freeze({
        ...skill,
        filePath: locator.value,
      });
      candidates.push({
        record: Object.freeze({
          name: skill.name,
          description: skill.description,
          source: Object.freeze({ ...source }),
          trusted,
          enabled,
          fingerprint,
          locator,
          entryPoint:
            root.entryPointKind === 'command-artifact'
              ? Object.freeze({
                  kind: 'command-artifact' as const,
                  commandId: skill.name,
                  artifactId: `command:${skill.name}`,
                  ...(commandMetadata?.argumentHint === undefined
                    ? {}
                    : { argumentHint: commandMetadata.argumentHint }),
                  supportsArguments: commandMetadata?.supportsArguments ?? false,
                })
              : Object.freeze({ kind: 'skill' as const }),
        }),
        skill: projectedSkill,
        physicalRoot,
      });
    }

    const warnings: SkillHostWarning[] = [];
    const selected = selectBySourcePriority(candidates, warnings);
    return new PiSkillHostSnapshot(
      this.env,
      this.namespace,
      selected,
      candidates.filter((candidate) => !selected.includes(candidate)),
      Object.freeze(diagnostics),
      Object.freeze(warnings),
      this.externalProcessor,
    );
  }
}

export function createNodePiSkillHost(input: {
  readonly cwd: string;
  readonly policy: SkillHostPolicy;
  readonly externalProcessor?: {
    readonly authorizer: SkillExternalProcessorAuthorizer;
    readonly executor: SkillExternalProcessorExecutor;
  };
}): PiSkillHost {
  return new PiSkillHost(
    new NodeExecutionEnv({ cwd: input.cwd }),
    input.policy,
    input.externalProcessor,
  );
}

export class PiSkillHostSnapshot {
  private readonly selected: readonly StoredSkill[];
  private readonly byName: ReadonlyMap<string, StoredSkill>;
  private readonly byFingerprint: ReadonlyMap<string, StoredSkill>;
  private readonly byActivationId: ReadonlyMap<string, StoredSkill>;

  constructor(
    private readonly env: ExecutionEnv,
    private readonly namespace: string,
    selected: readonly StoredSkill[],
    private readonly shadowed: readonly StoredSkill[],
    readonly diagnostics: readonly (SkillDiagnostic & { readonly source: SkillSource })[],
    readonly warnings: readonly SkillHostWarning[],
    private readonly externalProcessor?: {
      readonly authorizer: SkillExternalProcessorAuthorizer;
      readonly executor: SkillExternalProcessorExecutor;
    },
  ) {
    this.selected = selected;
    this.byName = new Map(
      selected
        .filter((entry) => entry.record.entryPoint.kind === 'skill')
        .map((entry) => [entry.record.name, entry]),
    );
    this.byFingerprint = new Map(selected.map((entry) => [entry.record.fingerprint, entry]));
    this.byActivationId = new Map(
      selected.map((entry) => [buildSkillActivationId(entry.record), entry]),
    );
  }

  get records(): readonly SkillHostRecord[] {
    return Object.freeze(this.selected.map((entry) => entry.record));
  }

  get skills(): readonly Readonly<Skill>[] {
    return Object.freeze([...this.byName.values()].map((entry) => entry.skill));
  }

  get shadowedRecords(): readonly SkillHostRecord[] {
    return Object.freeze(this.shadowed.map((entry) => entry.record));
  }

  invoke(skillName: string, additionalInstructions?: string): string {
    const stored = this.byName.get(skillName);
    if (stored === undefined) {
      throw new SkillHostError('skill-not-found', `Skill ${skillName} is not available.`);
    }
    return formatSkillInvocation(stored.skill, additionalInstructions);
  }

  invokeExact(skillName: string, activationId: string, additionalInstructions?: string): string {
    const stored = this.byActivationId.get(activationId);
    if (stored === undefined || stored.record.name !== skillName) {
      throw new SkillHostError(
        'skill-not-found',
        `Skill activation ${activationId} for ${skillName} is not available in this turn snapshot.`,
      );
    }
    return formatSkillInvocation(stored.skill, additionalInstructions);
  }

  resource(skillName: string, relativePath: string): SkillResourceLocator {
    const stored = this.byName.get(skillName);
    if (stored === undefined) {
      throw new SkillHostError('skill-not-found', `Skill ${skillName} is not available.`);
    }
    const normalized = validateRelativeResourcePath(relativePath);
    return createResourceLocator(this.namespace, stored.record.fingerprint, normalized);
  }

  async readText(locator: SkillLocator | SkillResourceLocator): Promise<string> {
    const stored = this.resolveStoredSkill(locator);
    if (locator.kind === 'skill') return stored.skill.content;
    this.validateResourceLocator(locator);
    const physicalPath = await this.resolvePhysicalResource(stored, locator.relativePath);
    return getOrThrow(await this.env.readTextFile(physicalPath));
  }

  async readModelSelectedContent(locatorValue: string): Promise<SkillContentReadResult> {
    const locator = parseLocator(this.namespace, locatorValue);
    const stored = this.resolveStoredSkill(locator);
    return Object.freeze({
      content: await this.readText(locator),
      receipt: Object.freeze({
        skillName: stored.record.name,
        source: stored.record.source,
        fingerprint: stored.record.fingerprint,
        locator: locator.value,
        locatorKind: locator.kind,
      }),
    });
  }

  async executeExternalProcessor(
    input: ExecuteSkillExternalProcessorInput,
  ): Promise<SkillExternalProcessorResult> {
    if (this.externalProcessor === undefined) {
      throw new SkillHostError(
        'external-processor-unavailable',
        'No Skill external processor executor is configured.',
      );
    }
    if (!input.workspaceTrusted) {
      throw new SkillHostError(
        'external-processor-denied',
        'Skill external processors require a trusted workspace.',
      );
    }
    const stored = this.byName.get(input.skillName);
    if (stored === undefined) {
      throw new SkillHostError('skill-not-found', `Skill ${input.skillName} is not available.`);
    }
    this.validateResourceLocator(input.script);
    if (input.script.fingerprint !== stored.record.fingerprint) {
      throw new SkillHostError(
        'invalid-locator',
        `Script locator does not belong to Skill ${input.skillName}.`,
      );
    }
    if (!input.script.relativePath.startsWith('scripts/')) {
      throw new SkillHostError(
        'invalid-resource-path',
        'External processors must be located under the Skill scripts/ directory.',
      );
    }
    const args = Object.freeze([...(input.args ?? [])]);
    const decision = await this.externalProcessor.authorizer.authorize({
      skillName: stored.record.name,
      source: stored.record.source,
      fingerprint: stored.record.fingerprint,
      script: input.script,
      args,
      conversationId: input.conversationId,
      turnId: input.turnId,
      workspaceTrusted: input.workspaceTrusted,
    });
    if (!decision.allowed) {
      throw new SkillHostError('external-processor-denied', decision.reason);
    }
    const physicalScriptPath = await this.resolvePhysicalResource(
      stored,
      input.script.relativePath,
    );
    return this.externalProcessor.executor.execute({
      physicalScriptPath,
      args,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
  }

  private resolveStoredSkill(locator: SkillLocator | SkillResourceLocator): StoredSkill {
    this.validateNamespace(locator.value);
    const stored = this.byFingerprint.get(locator.fingerprint);
    if (stored === undefined) {
      throw new SkillHostError(
        'invalid-locator',
        'Skill locator is not part of this turn snapshot.',
      );
    }
    const expected =
      locator.kind === 'skill'
        ? createSkillLocator(this.namespace, locator.fingerprint).value
        : createResourceLocator(
            this.namespace,
            locator.fingerprint,
            validateRelativeResourcePath(locator.relativePath),
          ).value;
    if (locator.value !== expected) {
      throw new SkillHostError('invalid-locator', 'Skill locator value does not match its fields.');
    }
    return stored;
  }

  private validateResourceLocator(locator: SkillResourceLocator): void {
    this.resolveStoredSkill(locator);
  }

  private validateNamespace(value: string): void {
    if (!value.startsWith(`/__neko_skills/${this.namespace}/`)) {
      throw new SkillHostError('invalid-locator', 'Skill locator belongs to another process.');
    }
  }

  private async resolvePhysicalResource(
    stored: StoredSkill,
    relativePath: string,
  ): Promise<string> {
    const normalized = validateRelativeResourcePath(relativePath);
    const addressed = getOrThrow(await this.env.joinPath([stored.physicalRoot, normalized]));
    const canonical = getOrThrow(await this.env.canonicalPath(addressed));
    const fromRoot = relative(stored.physicalRoot, canonical);
    if (
      fromRoot === '..' ||
      fromRoot.startsWith(`..${pathSeparator(fromRoot)}`) ||
      isAbsolute(fromRoot)
    ) {
      throw new SkillHostError(
        'resource-outside-skill',
        'Skill resource resolves outside its physical Skill package.',
      );
    }
    return canonical;
  }
}

function selectBySourcePriority(
  candidates: readonly StoredSkill[],
  warnings: SkillHostWarning[],
): readonly StoredSkill[] {
  const ordered = [...candidates].sort((left, right) => {
    const byPriority =
      SOURCE_PRIORITY[right.record.source.kind] - SOURCE_PRIORITY[left.record.source.kind];
    if (byPriority !== 0) return byPriority;
    return sourceStableId(left.record.source).localeCompare(sourceStableId(right.record.source));
  });
  const selected = new Map<string, StoredSkill>();
  for (const candidate of ordered) {
    const key = `${candidate.record.entryPoint.kind}\u0000${candidate.record.name}`;
    const winner = selected.get(key);
    if (winner === undefined) {
      selected.set(key, candidate);
      continue;
    }
    warnings.push(
      Object.freeze({
        type: 'warning',
        code: 'duplicate-skill',
        message: `Skill ${candidate.record.name} from ${candidate.record.source.kind} is shadowed by ${winner.record.source.kind}.`,
        skillName: candidate.record.name,
        selectedSource: winner.record.source.kind,
        shadowedSource: candidate.record.source.kind,
        ...(winner.record.source.kind === 'plugin'
          ? { selectedPluginId: winner.record.source.pluginId }
          : {}),
        ...(candidate.record.source.kind === 'plugin'
          ? { shadowedPluginId: candidate.record.source.pluginId }
          : {}),
      }),
    );
  }
  return Object.freeze([...selected.values()]);
}

function validateSkillSource(source: SkillSource): void {
  if (
    source.kind === 'plugin' &&
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*@[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(source.pluginId)
  ) {
    throw new Error(`Plugin Skill source has invalid plugin id '${source.pluginId}'.`);
  }
}

function sourceStableId(source: SkillSource): string {
  return source.kind === 'plugin' ? `plugin:${source.pluginId}` : source.kind;
}

async function loadCommandArtifacts(
  env: ExecutionEnv,
  root: SkillSourceRoot,
): Promise<{
  readonly entries: readonly LoadedSkillEntry[];
  readonly diagnostics: readonly (SkillDiagnostic & { readonly source: SkillSource })[];
}> {
  const entries: LoadedSkillEntry[] = [];
  const diagnostics: Array<SkillDiagnostic & { readonly source: SkillSource }> = [];
  const rootInfo = await env.fileInfo(root.path);
  if (!rootInfo.ok) {
    if (rootInfo.error.code !== 'not_found') {
      diagnostics.push(
        commandDiagnostic('file_info_failed', rootInfo.error.message, root.path, root),
      );
    }
    return { entries, diagnostics };
  }
  if (rootInfo.value.kind !== 'directory') {
    diagnostics.push(
      commandDiagnostic(
        'invalid_metadata',
        'Command artifact root must be a directory.',
        root.path,
        root,
      ),
    );
    return { entries, diagnostics };
  }
  const listed = await env.listDir(root.path);
  if (!listed.ok) {
    diagnostics.push(commandDiagnostic('list_failed', listed.error.message, root.path, root));
    return { entries, diagnostics };
  }
  for (const file of [...listed.value].sort((left, right) => left.name.localeCompare(right.name))) {
    if (file.kind !== 'file' || !file.name.endsWith('.md')) continue;
    const content = await env.readTextFile(file.path);
    if (!content.ok) {
      diagnostics.push(commandDiagnostic('read_failed', content.error.message, file.path, root));
      continue;
    }
    try {
      entries.push(parseCommandArtifact(content.value, file.path, root));
    } catch (error) {
      diagnostics.push(
        commandDiagnostic(
          'invalid_metadata',
          error instanceof Error ? error.message : String(error),
          file.path,
          root,
        ),
      );
    }
  }
  return { entries, diagnostics };
}

function parseCommandArtifact(
  content: string,
  filePath: string,
  root: SkillSourceRoot,
): LoadedSkillEntry {
  const normalized = content.replace(/\r\n?/gu, '\n');
  if (!normalized.startsWith('---\n')) {
    throw new Error('Command artifact requires YAML frontmatter.');
  }
  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) throw new Error('Command artifact frontmatter is not terminated.');
  const parsed = parseYaml(normalized.slice(4, end));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Command artifact frontmatter must be an object.');
  }
  const metadata = parsed as Record<string, unknown>;
  const allowed = new Set([
    'name',
    'description',
    'argument-hint',
    'supports-arguments',
    'disable-model-invocation',
  ]);
  const unknown = Object.keys(metadata).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`Command artifact contains unsupported field '${unknown}'.`);
  const commandId = basename(filePath, '.md');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(commandId)) {
    throw new Error(`Command artifact filename '${commandId}' is not a valid command identity.`);
  }
  if (metadata['name'] !== undefined && metadata['name'] !== commandId) {
    throw new Error(`Command artifact name must match filename '${commandId}'.`);
  }
  const description = metadata['description'];
  if (typeof description !== 'string' || description.trim().length === 0) {
    throw new Error('Command artifact description is required.');
  }
  if (description.length > 1024) throw new Error('Command artifact description is too long.');
  const argumentHint = metadata['argument-hint'];
  if (
    argumentHint !== undefined &&
    (typeof argumentHint !== 'string' || argumentHint.trim().length === 0)
  ) {
    throw new Error('Command artifact argument hint must be a non-empty string.');
  }
  const supportsArguments = metadata['supports-arguments'] ?? false;
  if (typeof supportsArguments !== 'boolean') {
    throw new Error('Command artifact supports-arguments must be a boolean.');
  }
  const disableModelInvocation = metadata['disable-model-invocation'] ?? true;
  if (typeof disableModelInvocation !== 'boolean') {
    throw new Error('Command artifact disable-model-invocation must be a boolean.');
  }
  const body = normalized.slice(end + 5).trim();
  if (!body) throw new Error('Command artifact body is required.');
  return {
    root,
    skill: {
      name: commandId,
      description,
      content: body,
      filePath,
      disableModelInvocation,
    },
    commandMetadata: {
      ...(argumentHint === undefined ? {} : { argumentHint }),
      supportsArguments,
    },
  };
}

function commandDiagnostic(
  code: SkillDiagnostic['code'],
  message: string,
  path: string,
  root: SkillSourceRoot,
): SkillDiagnostic & { readonly source: SkillSource } {
  return { type: 'warning', code, message, path, source: root.source };
}

async function fingerprintSkillPackage(
  env: ExecutionEnv,
  skill: Skill,
  physicalRoot: string,
): Promise<string> {
  const hash = createHash('sha256')
    .update(skill.name)
    .update('\u0000')
    .update(skill.description)
    .update('\u0000')
    .update(skill.content);
  const pending = [physicalRoot];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    const entries = [...getOrThrow(await env.listDir(directory))].sort((left, right) =>
      left.path.localeCompare(right.path),
    );
    for (const entry of entries) {
      const relativePath = relative(physicalRoot, entry.path).replaceAll('\\', '/');
      hash.update('\u0000').update(entry.kind).update('\u0000').update(relativePath);
      if (entry.kind === 'directory') {
        pending.push(entry.path);
      } else if (entry.kind === 'file') {
        hash.update('\u0000').update(getOrThrow(await env.readBinaryFile(entry.path)));
      } else {
        const canonical = getOrThrow(await env.canonicalPath(entry.path));
        hash
          .update('\u0000')
          .update(
            canonical.startsWith(`${physicalRoot}/`)
              ? relative(physicalRoot, canonical).replaceAll('\\', '/')
              : 'outside',
          );
      }
    }
  }
  return hash.digest('hex');
}

function fingerprintCommandArtifact(
  skill: Skill,
  metadata: LoadedSkillEntry['commandMetadata'],
): string {
  const hash = createHash('sha256')
    .update('command-artifact')
    .update('\u0000')
    .update(skill.name)
    .update('\u0000')
    .update(skill.description)
    .update('\u0000')
    .update(skill.content)
    .update('\u0000')
    .update(skill.disableModelInvocation ? 'explicit-only' : 'model-visible')
    .update('\u0000')
    .update(metadata?.argumentHint ?? '')
    .update('\u0000')
    .update(metadata?.supportsArguments ? 'supports-arguments' : 'no-arguments');
  return hash.digest('hex');
}

function createSkillLocator(namespace: string, fingerprint: string): SkillLocator {
  return Object.freeze({
    kind: 'skill',
    value: `/__neko_skills/${namespace}/${fingerprint}/SKILL.md`,
    fingerprint,
  });
}

function createResourceLocator(
  namespace: string,
  fingerprint: string,
  relativePath: string,
): SkillResourceLocator {
  const encoded = relativePath.split('/').map(encodeURIComponent).join('/');
  return Object.freeze({
    kind: 'skill-resource',
    value: `/__neko_skills/${namespace}/${fingerprint}/${encoded}`,
    fingerprint,
    relativePath,
  });
}

function parseLocator(namespace: string, value: string): SkillLocator | SkillResourceLocator {
  const prefix = `/__neko_skills/${namespace}/`;
  if (!value.startsWith(prefix)) {
    throw new SkillHostError('invalid-locator', 'Skill locator belongs to another process.');
  }
  const segments = value.slice(prefix.length).split('/');
  const fingerprint = segments.shift();
  if (fingerprint === undefined || !/^[0-9a-f]{64}$/.test(fingerprint)) {
    throw new SkillHostError('invalid-locator', 'Skill locator has an invalid fingerprint.');
  }
  if (segments.length === 1 && segments[0] === 'SKILL.md') {
    return createSkillLocator(namespace, fingerprint);
  }
  let relativePath: string;
  try {
    relativePath = segments.map(decodeURIComponent).join('/');
  } catch {
    throw new SkillHostError('invalid-locator', 'Skill locator contains invalid encoding.');
  }
  return createResourceLocator(namespace, fingerprint, validateRelativeResourcePath(relativePath));
}

function validateRelativeResourcePath(value: string): string {
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new SkillHostError(
      'invalid-resource-path',
      `Skill resource path must be a contained relative path: ${value}`,
    );
  }
  return normalized;
}

function pathSeparator(relativePath: string): string {
  return relativePath.includes('\\') ? '\\' : '/';
}
