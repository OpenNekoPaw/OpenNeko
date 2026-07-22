import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, relative } from 'node:path';

import {
  formatSkillInvocation,
  getOrThrow,
  loadSourcedSkills,
  type ExecutionEnv,
  type Skill,
  type SkillDiagnostic,
} from '@earendil-works/pi-agent-core';
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node';
import type { ExternalProcessorResult } from '@neko-agent/types';

export type SkillSourceKind = 'builtin' | 'personal' | 'project';

export interface SkillSource {
  readonly kind: SkillSourceKind;
}

export interface SkillSourceRoot {
  readonly path: string;
  readonly source: SkillSource;
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

const SOURCE_PRIORITY: Readonly<Record<SkillSourceKind, number>> = {
  project: 3,
  personal: 2,
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
    const loaded = await loadSourcedSkills(
      this.env,
      inputs.map((input) => ({ path: input.path, source: input.source })),
    );
    const candidates: StoredSkill[] = [];
    for (const { skill, source } of loaded.skills) {
      const trusted = await this.policy.isTrusted({
        name: skill.name,
        source,
        physicalSkillFile: skill.filePath,
      });
      const enabled = await this.policy.isEnabled({ name: skill.name, source });
      if (!trusted || !enabled) continue;

      const physicalRoot = getOrThrow(await this.env.canonicalPath(dirname(skill.filePath)));
      const fingerprint = await fingerprintSkillPackage(this.env, skill, physicalRoot);
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
        }),
        skill: projectedSkill,
        physicalRoot,
      });
    }

    const warnings: SkillHostWarning[] = [];
    const selected = selectProjectFirst(candidates, warnings);
    return new PiSkillHostSnapshot(
      this.env,
      this.namespace,
      selected,
      candidates.filter((candidate) => !selected.includes(candidate)),
      Object.freeze([...loaded.diagnostics]),
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
  private readonly byName: ReadonlyMap<string, StoredSkill>;
  private readonly byFingerprint: ReadonlyMap<string, StoredSkill>;

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
    this.byName = new Map(selected.map((entry) => [entry.record.name, entry]));
    this.byFingerprint = new Map(selected.map((entry) => [entry.record.fingerprint, entry]));
  }

  get records(): readonly SkillHostRecord[] {
    return Object.freeze([...this.byName.values()].map((entry) => entry.record));
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

function selectProjectFirst(
  candidates: readonly StoredSkill[],
  warnings: SkillHostWarning[],
): readonly StoredSkill[] {
  const ordered = [...candidates].sort(
    (left, right) =>
      SOURCE_PRIORITY[right.record.source.kind] - SOURCE_PRIORITY[left.record.source.kind],
  );
  const selected = new Map<string, StoredSkill>();
  for (const candidate of ordered) {
    const winner = selected.get(candidate.record.name);
    if (winner === undefined) {
      selected.set(candidate.record.name, candidate);
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
      }),
    );
  }
  return Object.freeze([...selected.values()]);
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
