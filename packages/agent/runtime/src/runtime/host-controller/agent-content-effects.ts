import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import { isMentionExcludedPath } from '@neko/agent-runtime/input/mention-excludes';
import {
  parseGitignoreRules,
  shouldIgnoreWorkspaceFile,
} from '@neko/agent-runtime/input/workspace-ignore';
import {
  type AgentContentControllerEffectPort,
  type AgentHostConnectionIdentity,
  type AgentHostRouteEffectContext,
} from '@neko/agent-runtime/runtime/host-controller';
import {
  executeAgentProjectFileSearch,
  type AgentProjectFileCandidate,
  type AgentProjectFileSearchPlan,
  type AgentProjectMentionCandidate,
} from '@neko/agent-runtime/runtime/message-runtime';
import type { NekoHostPorts } from '@neko/host/ports';
import {
  validateContentLocator,
  type ContentLocator,
  type DocumentLocator,
  type WorkspaceFileContentLocator,
} from '@neko/content';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { readConfirmedEntityResources } from '@neko/entity-node';

const MAX_SVG_BYTES = 10 * 1024 * 1024;

type AgentContentEffectErrorCode =
  | 'desktop-agent-content-access-denied'
  | 'desktop-agent-content-kind-unsupported'
  | 'desktop-agent-content-locator-invalid'
  | 'desktop-agent-content-not-file'
  | 'desktop-agent-content-outside-workspace'
  | 'desktop-agent-content-presentation-unavailable'
  | 'desktop-agent-context-locator-required'
  | 'desktop-agent-svg-invalid'
  | 'desktop-agent-svg-too-large'
  | 'desktop-agent-workspace-grant-mismatch'
  | 'desktop-agent-workspace-write-target-invalid';

class AgentContentEffectError extends Error {
  constructor(
    readonly code: AgentContentEffectErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentContentEffectError';
  }
}

export interface AgentContentInteractionPort {
  openContent(input: {
    readonly identity: AgentHostConnectionIdentity;
    readonly workspaceId: string;
    readonly contentLocator: ContentLocator;
    readonly absolutePath: string;
    readonly options?: {
      readonly preview?: boolean;
      readonly line?: number;
      readonly column?: number;
    };
  }): Promise<void>;
  revealDocument(input: {
    readonly identity: AgentHostConnectionIdentity;
    readonly workspaceId: string;
    readonly contentLocator: ContentLocator;
    readonly absolutePath: string;
    readonly locator: DocumentLocator;
  }): Promise<void>;
  selectWorkspaceWriteTarget(input: {
    readonly identity: AgentHostConnectionIdentity;
    readonly workspaceId: string;
    readonly suggestedLocator: WorkspaceFileContentLocator;
    readonly mediaType: 'image/svg+xml';
  }): Promise<WorkspaceFileContentLocator | undefined>;
  didWriteWorkspaceContent?(input: {
    readonly identity: AgentHostConnectionIdentity;
    readonly workspaceId: string;
    readonly contentLocator: WorkspaceFileContentLocator;
    readonly byteLength: number;
  }): void | Promise<void>;
}

export interface CreateAgentContentEffectsOptions {
  readonly workspace: AssetWorkspaceResolution;
  readonly host: Pick<NekoHostPorts, 'files' | 'paths' | 'accessPolicy' | 'external'>;
  readonly interaction: AgentContentInteractionPort;
}

export function createAgentContentEffects(
  options: CreateAgentContentEffectsOptions,
): AgentContentControllerEffectPort {
  return {
    async searchProjectFiles(input, context): Promise<void> {
      assertWorkspaceGrant(options.workspace, context);
      const message = await executeAgentProjectFileSearch({
        ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
        filter: input.filter,
        ...(input.purpose === undefined ? {} : { purpose: input.purpose }),
        searchProjectFiles: (plan) => searchGrantedWorkspace(options.workspace, options.host, plan),
        getMentionCandidates: (plan) =>
          searchGrantedWorkspaceEntities(options.workspace, options.host, plan),
        onSearchError: (error) => {
          throw error;
        },
      });
      await context.post(message);
    },

    async openFile(input, context): Promise<void> {
      assertWorkspaceGrant(options.workspace, context);
      const absolutePath = await resolveExistingContentPath(
        input.contentLocator,
        options,
        'project',
      );
      await options.interaction.openContent({
        identity: context.identity,
        workspaceId: options.workspace.workspaceId,
        contentLocator: input.contentLocator,
        absolutePath,
        ...(input.options === undefined ? {} : { options: input.options }),
      });
    },

    async revealDocumentLocator(input, context): Promise<void> {
      assertWorkspaceGrant(options.workspace, context);
      const absolutePath = await resolveExistingContentPath(
        input.contentLocator,
        options,
        'project',
      );
      await options.interaction.revealDocument({
        identity: context.identity,
        workspaceId: options.workspace.workspaceId,
        contentLocator: input.contentLocator,
        absolutePath,
        locator: input.locator,
      });
    },

    async revealFile(contentLocator, context): Promise<void> {
      assertWorkspaceGrant(options.workspace, context);
      const absolutePath = await resolveExistingContentPath(contentLocator, options, 'project');
      const external = options.host.external;
      if (!external?.revealPath) {
        throw new AgentContentEffectError(
          'desktop-agent-content-presentation-unavailable',
          'Desktop revealPath effect is not registered.',
        );
      }
      await external.revealPath(absolutePath);
    },

    async openExternalUrl(url, context): Promise<void> {
      assertWorkspaceGrant(options.workspace, context);
      const external = options.host.external;
      if (!external) {
        throw new AgentContentEffectError(
          'desktop-agent-content-presentation-unavailable',
          'Desktop external-open effect is not registered.',
        );
      }
      await external.openExternal(url);
    },

    async revealContextSource(message, context): Promise<void> {
      assertWorkspaceGrant(options.workspace, context);
      if (!message.contentLocator) {
        throw new AgentContentEffectError(
          'desktop-agent-context-locator-required',
          `Desktop cannot reveal context source '${message.contextId}' without a stable content locator.`,
        );
      }
      const absolutePath = await resolveExistingContentPath(
        message.contentLocator,
        options,
        'project',
      );
      await options.interaction.openContent({
        identity: context.identity,
        workspaceId: options.workspace.workspaceId,
        contentLocator: message.contentLocator,
        absolutePath,
      });
    },

    async downloadSvg(input, context): Promise<void> {
      assertWorkspaceGrant(options.workspace, context);
      assertSvg(input.svg);
      const suggestedLocator: WorkspaceFileContentLocator = {
        kind: 'workspace-file',
        path: normalizeSvgFileName(input.filename),
      };
      const selected = await options.interaction.selectWorkspaceWriteTarget({
        identity: context.identity,
        workspaceId: options.workspace.workspaceId,
        suggestedLocator,
        mediaType: 'image/svg+xml',
      });
      if (!selected) return;
      const contentLocator = requireWorkspaceWriteLocator(selected);
      const absolutePath = await resolveWorkspaceWritePath(contentLocator, options);
      await assertHostAccess(options.host, 'write', absolutePath);
      await options.host.files.writeText(absolutePath, input.svg);
      await options.interaction.didWriteWorkspaceContent?.({
        identity: context.identity,
        workspaceId: options.workspace.workspaceId,
        contentLocator,
        byteLength: Buffer.byteLength(input.svg, 'utf8'),
      });
    },
  };
}

async function searchGrantedWorkspaceEntities(
  workspace: AssetWorkspaceResolution,
  host: CreateAgentContentEffectsOptions['host'],
  plan: AgentProjectFileSearchPlan,
): Promise<readonly AgentProjectMentionCandidate[]> {
  await assertHostAccess(host, 'list', workspace.workspacePath);
  const { entities, bindings } = await readConfirmedEntityResources({
    workspace,
    host,
  });
  const filter = extractSearchFilter(plan.includePattern);
  return entities
    .filter((entity) => {
      const searchText = [
        entity.displayName,
        entity.canonicalName,
        ...entity.aliases,
        entity.kind,
        entity.id,
      ]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLocaleLowerCase();
      return !filter || searchText.includes(filter);
    })
    .slice(0, plan.limit)
    .map((entity): AgentProjectMentionCandidate => {
      const binding = bindings.find(
        (candidate) =>
          candidate.entityId === entity.id &&
          candidate.entityKind === entity.kind &&
          candidate.status === 'confirmed' &&
          candidate.availability === 'active',
      );
      const label = entity.displayName ?? entity.canonicalName;
      return {
        type: 'entity',
        id: `entity:${entity.kind}:${entity.id}`,
        label,
        summary: `${titleCaseEntityKind(entity.kind)}: ${label}`,
        searchText: [label, ...entity.aliases, entity.kind, entity.id].join(' '),
        source: 'entity-graph',
        ...(binding ? { contentLocator: binding.representation } : {}),
        entityType: entity.kind,
        navigationData: {
          entityId: entity.id,
          entityKind: entity.kind,
        },
      };
    });
}

async function searchGrantedWorkspace(
  workspace: AssetWorkspaceResolution,
  host: CreateAgentContentEffectsOptions['host'],
  plan: AgentProjectFileSearchPlan,
): Promise<readonly AgentProjectFileCandidate[]> {
  await assertHostAccess(host, 'list', workspace.workspacePath);
  const gitignoreRules = await readGitignoreRules(workspace.workspacePath, host);
  const filter = extractSearchFilter(plan.includePattern);
  const candidates: AgentProjectFileCandidate[] = [];
  await walkWorkspaceFiles({
    absoluteDirectory: workspace.workspacePath,
    relativeDirectory: '',
    host,
    gitignoreRules,
    filter,
    limit: Math.max(plan.limit * 4, plan.limit),
    candidates,
  });
  return candidates
    .sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath, undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
    )
    .slice(0, plan.limit);
}

async function walkWorkspaceFiles(input: {
  readonly absoluteDirectory: string;
  readonly relativeDirectory: string;
  readonly host: CreateAgentContentEffectsOptions['host'];
  readonly gitignoreRules: readonly string[];
  readonly filter: string;
  readonly limit: number;
  readonly candidates: AgentProjectFileCandidate[];
}): Promise<void> {
  if (input.candidates.length >= input.limit) return;
  const entries = [...(await input.host.files.readDirectory(input.absoluteDirectory))].sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  for (const entry of entries) {
    if (input.candidates.length >= input.limit) return;
    const relativePath = input.relativeDirectory
      ? `${input.relativeDirectory}/${entry.name}`
      : entry.name;
    if (
      isMentionExcludedPath(relativePath) ||
      shouldIgnoreWorkspaceFile(relativePath, {
        gitignoreRules: input.gitignoreRules,
      }).ignored
    ) {
      continue;
    }
    if (entry.type === 'directory') {
      await walkWorkspaceFiles({
        ...input,
        absoluteDirectory: path.join(input.absoluteDirectory, entry.name),
        relativeDirectory: relativePath,
      });
      continue;
    }
    if (
      entry.type === 'file' &&
      (!input.filter || relativePath.toLocaleLowerCase().includes(input.filter))
    ) {
      input.candidates.push({
        relativePath,
        source: 'workspace',
        ...workspaceFilePresentation(relativePath),
      });
    }
  }
}

async function readGitignoreRules(
  workspacePath: string,
  host: CreateAgentContentEffectsOptions['host'],
): Promise<readonly string[]> {
  try {
    return parseGitignoreRules(await host.files.readText(path.join(workspacePath, '.gitignore')));
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return [];
    throw error;
  }
}

async function resolveExistingContentPath(
  contentLocator: ContentLocator,
  options: CreateAgentContentEffectsOptions,
  operation: 'project',
): Promise<string> {
  const relativePath = workspaceRelativePath(contentLocator);
  const candidate = resolveLexicalWorkspacePath(
    options.workspace.workspacePath,
    relativePath,
    options.host,
  );
  const [canonicalWorkspace, canonicalTarget] = await Promise.all([
    realpath(options.workspace.workspacePath),
    realpath(candidate),
  ]);
  assertInsideWorkspace(canonicalTarget, canonicalWorkspace, options.host);
  await assertHostAccess(options.host, operation, canonicalTarget);
  const stat = await options.host.files.stat(canonicalTarget);
  if (stat.type !== 'file') {
    throw new AgentContentEffectError(
      'desktop-agent-content-not-file',
      `Desktop content locator '${relativePath}' does not resolve to a file.`,
    );
  }
  return canonicalTarget;
}

async function resolveWorkspaceWritePath(
  locator: WorkspaceFileContentLocator,
  options: CreateAgentContentEffectsOptions,
): Promise<string> {
  const candidate = resolveLexicalWorkspacePath(
    options.workspace.workspacePath,
    locator.path,
    options.host,
  );
  const [canonicalWorkspace, canonicalParent] = await Promise.all([
    realpath(options.workspace.workspacePath),
    realpath(path.dirname(candidate)),
  ]);
  assertInsideWorkspace(canonicalParent, canonicalWorkspace, options.host);
  return path.join(canonicalParent, path.basename(candidate));
}

function resolveLexicalWorkspacePath(
  workspacePath: string,
  relativePath: string,
  host: CreateAgentContentEffectsOptions['host'],
): string {
  const resolved = host.paths.resolvePath({
    path: relativePath,
    baseDir: workspacePath,
  });
  if (resolved.type !== 'local') {
    throw new AgentContentEffectError(
      'desktop-agent-content-outside-workspace',
      'Desktop content effects require workspace-local content.',
    );
  }
  assertInsideWorkspace(resolved.path, workspacePath, host);
  return resolved.path;
}

function assertInsideWorkspace(
  targetPath: string,
  workspacePath: string,
  host: CreateAgentContentEffectsOptions['host'],
): void {
  if (host.paths.isInside({ path: targetPath, root: workspacePath })) return;
  throw new AgentContentEffectError(
    'desktop-agent-content-outside-workspace',
    'Desktop content locator resolves outside its sender-bound workspace grant.',
  );
}

function workspaceRelativePath(locatorValue: ContentLocator): string {
  const validation = validateContentLocator(locatorValue);
  if (!validation.ok) {
    throw new AgentContentEffectError(
      'desktop-agent-content-locator-invalid',
      validation.diagnostics.map((diagnostic) => diagnostic.message).join(' '),
    );
  }
  const locator = validation.locator;
  switch (locator.kind) {
    case 'workspace-file':
      return locator.path;
    case 'document-entry':
      return locator.source.path;
    case 'generated-output':
      return locator.path;
    case 'package-resource':
      throw new AgentContentEffectError(
        'desktop-agent-content-kind-unsupported',
        `Desktop package resource '${locator.packageId}/${locator.resourcePath}' requires its owning package resolver.`,
      );
  }
}

function requireWorkspaceWriteLocator(
  locatorValue: WorkspaceFileContentLocator,
): WorkspaceFileContentLocator {
  const validation = validateContentLocator(locatorValue);
  if (!validation.ok || validation.locator.kind !== 'workspace-file') {
    throw new AgentContentEffectError(
      'desktop-agent-workspace-write-target-invalid',
      'Desktop Host selected an invalid workspace write target.',
    );
  }
  if (validation.locator.fingerprint !== undefined) {
    throw new AgentContentEffectError(
      'desktop-agent-workspace-write-target-invalid',
      'Desktop Host write targets cannot silently ignore a content fingerprint precondition.',
    );
  }
  return validation.locator;
}

function assertWorkspaceGrant(
  workspace: AssetWorkspaceResolution,
  context: AgentHostRouteEffectContext,
): void {
  if (
    context.identity.hostKind !== 'electron' ||
    context.identity.workspaceId !== workspace.workspaceId
  ) {
    throw new AgentContentEffectError(
      'desktop-agent-workspace-grant-mismatch',
      `Desktop Agent connection '${context.identity.connectionId}' is not granted workspace '${workspace.workspaceId}'.`,
    );
  }
}

async function assertHostAccess(
  host: CreateAgentContentEffectsOptions['host'],
  operation: 'list' | 'project' | 'write',
  targetPath: string,
): Promise<void> {
  const decision = await host.accessPolicy?.decide({
    actor: 'agent',
    operation,
    scope: 'workspace-facts',
    path: targetPath,
    reason: 'Desktop Agent content effect',
  });
  if (decision?.allowed === false) {
    throw new AgentContentEffectError(
      'desktop-agent-content-access-denied',
      decision.diagnostic?.message ?? 'Desktop Host denied the Agent content effect.',
    );
  }
}

function normalizeSvgFileName(value: string): string {
  const baseName = path.posix.basename(value.replace(/\\/g, '/').trim());
  const withoutControlCharacters = baseName.replace(/[\u0000-\u001f\u007f]/g, '');
  if (
    !withoutControlCharacters ||
    withoutControlCharacters === '.' ||
    withoutControlCharacters === '..'
  ) {
    return 'diagram.svg';
  }
  return withoutControlCharacters.toLocaleLowerCase().endsWith('.svg')
    ? withoutControlCharacters
    : `${withoutControlCharacters}.svg`;
}

function assertSvg(svg: string): void {
  if (!/<svg(?:\s|>)/i.test(svg)) {
    throw new AgentContentEffectError(
      'desktop-agent-svg-invalid',
      'Desktop SVG write requires an SVG document.',
    );
  }
  if (Buffer.byteLength(svg, 'utf8') > MAX_SVG_BYTES) {
    throw new AgentContentEffectError(
      'desktop-agent-svg-too-large',
      `Desktop SVG write exceeds the ${MAX_SVG_BYTES}-byte limit.`,
    );
  }
}

function extractSearchFilter(includePattern: string): string {
  const match = /^\*\*\/\*(.*)\*$/.exec(includePattern);
  return (match?.[1] ?? '').toLocaleLowerCase();
}

function titleCaseEntityKind(value: string): string {
  return `${value.charAt(0).toLocaleUpperCase()}${value.slice(1)}`;
}

function workspaceFilePresentation(relativePath: string): Pick<AgentProjectFileCandidate, 'icon'> {
  const extension = relativePath.split('.').pop()?.toLocaleLowerCase();
  if (extension === 'ts' || extension === 'tsx' || extension === 'js' || extension === 'jsx') {
    return { icon: 'TS' };
  }
  if (extension === 'md' || extension === 'mdx') return { icon: 'MD' };
  return {};
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    Reflect.get(error, 'code') === code
  );
}
