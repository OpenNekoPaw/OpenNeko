import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  ProjectEntityContractError,
  ProjectEntityInspectorIntentService,
  ProjectEntityOperationService,
  assertProjectEntityDocument,
  createEmptyProjectEntityDocument,
  projectEntityManagement,
  type ProjectEntityProjectionRecord,
  type ProjectEntityProjectionRepository,
  type ProjectEntityCandidateDecision,
  type ProjectEntityCandidateProjection,
  type ProjectEntityCandidateWorkflowPort,
  type ProjectEntityDocument,
  type ProjectEntityInspectorIntent,
  type ProjectEntityOperationCommitPort,
  type ProjectEntityOperationMutation,
} from '@neko/entity-domain';
import { NodeProjectEntityRepository } from './node-project-entity-repository';

const JOURNAL_WORKSPACE_PATH = 'neko/entity-operation-journal.json' as const;

export interface NodeProjectEntityInspectorRuntimeOptions {
  readonly workspace: {
    readonly workspaceId: string;
    readonly workspacePath: string;
  };
  readonly projections?: Pick<ProjectEntityProjectionRepository, 'list' | 'replaceSource'>;
  readonly now?: () => string;
  readonly createEntityId?: (candidateId: string) => string;
  readonly createBindingId?: (entityId: string) => string;
}

export class NodeProjectEntityInspectorRuntime {
  private readonly repository: NodeProjectEntityRepository;
  private readonly partition;
  private readonly journalPath: string;
  private readonly now: () => string;
  private readonly candidates: NodeProjectEntityCandidateWorkflow;
  private readonly commits: NodeProjectEntityOperationCommitCoordinator;
  private readonly service: ProjectEntityInspectorIntentService;

  constructor(private readonly options: NodeProjectEntityInspectorRuntimeOptions) {
    this.repository = new NodeProjectEntityRepository({
      workspacePath: options.workspace.workspacePath,
      projectId: options.workspace.workspaceId,
    });
    this.partition = {
      scope: 'workspace' as const,
      workspaceId: options.workspace.workspaceId,
      domain: 'project-entity-projection',
    };
    this.journalPath = resolveJournalPath(options.workspace.workspacePath);
    this.now = options.now ?? (() => new Date().toISOString());
    this.candidates = new NodeProjectEntityCandidateWorkflow({
      projectId: options.workspace.workspaceId,
      partition: this.partition,
      projections: options.projections,
      now: this.now,
    });
    this.commits = new NodeProjectEntityOperationCommitCoordinator({
      repository: this.repository,
      candidates: this.candidates,
      journalPath: this.journalPath,
    });
    const operations = new ProjectEntityOperationService({
      candidates: this.candidates,
      references: [],
      commits: this.commits,
    });
    this.service = new ProjectEntityInspectorIntentService({
      operations,
      createEntityId:
        options.createEntityId ?? ((candidateId) => `entity-${candidateId}-${randomUUID()}`),
      createBindingId:
        options.createBindingId ?? ((entityId) => `binding-${entityId}-${randomUUID()}`),
      now: this.now,
    });
  }

  execute(intent: ProjectEntityInspectorIntent, signal?: AbortSignal): Promise<void> {
    return withInspectorOperationLock(this.journalPath, async () => {
      await this.commits.recover(signal);
      await this.service.execute(intent, signal);
    });
  }
}

interface CandidateWorkflowOptions {
  readonly projectId: string;
  readonly partition: {
    readonly scope: 'workspace';
    readonly workspaceId: string;
    readonly domain: string;
  };
  readonly projections?: Pick<ProjectEntityProjectionRepository, 'list' | 'replaceSource'>;
  readonly now: () => string;
}

class NodeProjectEntityCandidateWorkflow implements ProjectEntityCandidateWorkflowPort {
  constructor(private readonly options: CandidateWorkflowOptions) {}

  async getCandidate(candidateId: string): Promise<ProjectEntityCandidateProjection | null> {
    const projections = this.requireProjections();
    const result = await projections.list({
      partition: this.options.partition,
      candidateId,
      kinds: ['entity-candidate'],
    });
    const records = result.records;
    const candidates = records.flatMap((record) =>
      record.kind === 'entity-candidate' && record.value.freshness !== 'failed'
        ? [record.value]
        : [],
    );
    const management = projectEntityManagement({
      document: createEmptyProjectEntityDocument(this.options.projectId),
      candidates,
      bindingAvailability: [],
    });
    const candidate = management.find(
      (projection) =>
        projection.status === 'candidate' && projection.candidate.candidateId === candidateId,
    );
    return candidate?.status === 'candidate' ? candidate.candidate : null;
  }

  async dismiss(
    decision: Extract<ProjectEntityCandidateDecision, { readonly kind: 'dismiss' }>,
  ): Promise<void> {
    await this.remove(decision.candidate.candidateId);
  }

  async remove(candidateId: string): Promise<void> {
    const projections = this.requireProjections();
    const matches = await projections.list({
      partition: this.options.partition,
      candidateId,
      kinds: ['entity-candidate'],
    });
    const sourceIds = [...new Set(matches.records.map((record) => record.sourceId))];
    const updatedAt = this.options.now();
    for (const sourceId of sourceIds) {
      const records = await projections.list({ partition: this.options.partition, sourceId });
      await projections.replaceSource({
        partition: this.options.partition,
        sourceId,
        records: records.records.filter((record) => !isCandidateRecord(record, candidateId)),
        updatedAt,
      });
    }
  }

  private requireProjections(): Pick<ProjectEntityProjectionRepository, 'list' | 'replaceSource'> {
    if (this.options.projections) return this.options.projections;
    throw nodeIntentError(
      'project-entity-candidate-not-found',
      'Project Entity candidate projection owner is not configured.',
    );
  }
}

interface CommitCoordinatorOptions {
  readonly repository: NodeProjectEntityRepository;
  readonly candidates: NodeProjectEntityCandidateWorkflow;
  readonly journalPath: string;
}

class NodeProjectEntityOperationCommitCoordinator implements ProjectEntityOperationCommitPort {
  constructor(private readonly options: CommitCoordinatorOptions) {}

  async commit(
    mutation: ProjectEntityOperationMutation,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument> {
    let journal: NodeProjectEntityOperationJournal | undefined;
    const committed = await this.options.repository.mutate(async (current) => {
      const request = await mutation(current);
      if (request.referencePlan) {
        throw nodeIntentError(
          'project-entity-reference-plan-incomplete',
          'Project Entity reference owners are not configured for an atomic rewrite.',
        );
      }
      if (request.candidateDecision) {
        journal = {
          previous: current,
          next: request.next,
          candidateDecision: {
            kind: request.candidateDecision.kind,
            candidateId: request.candidateDecision.candidate.candidateId,
          },
        };
        await writeJournal(this.options.journalPath, journal);
      }
      return request.next;
    }, signal);
    if (!journal) return committed;
    await this.options.candidates.remove(journal.candidateDecision.candidateId);
    await removeJournal(this.options.journalPath);
    return committed;
  }

  async recover(signal?: AbortSignal): Promise<void> {
    const journal = await readJournal(this.options.journalPath);
    if (!journal) return;
    const current = await this.options.repository.load(signal);
    if (sameDocument(current, journal.previous)) {
      await this.options.repository.mutate((latest) => {
        if (!sameDocument(latest, journal.previous)) {
          throw nodeIntentError(
            'project-entity-operation-invalid',
            'Project Entity operation journal no longer owns the canonical document.',
          );
        }
        return journal.next;
      }, signal);
    } else if (!sameDocument(current, journal.next)) {
      throw nodeIntentError(
        'project-entity-operation-invalid',
        'Project Entity operation journal conflicts with the canonical document.',
      );
    }
    await this.options.candidates.remove(journal.candidateDecision.candidateId);
    await removeJournal(this.options.journalPath);
  }
}

interface NodeProjectEntityOperationJournal {
  readonly previous: ProjectEntityDocument;
  readonly next: ProjectEntityDocument;
  readonly candidateDecision: {
    readonly kind: 'confirm' | 'merge-into';
    readonly candidateId: string;
  };
}

function isCandidateRecord(record: ProjectEntityProjectionRecord, candidateId: string): boolean {
  return record.kind === 'entity-candidate' && record.value.candidateId === candidateId;
}

function resolveJournalPath(workspacePath: string): string {
  const root = path.resolve(workspacePath);
  const journalPath = path.resolve(root, ...JOURNAL_WORKSPACE_PATH.split('/'));
  const relative = path.relative(root, journalPath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw nodeIntentError(
      'project-entity-path-unauthorized',
      'Project Entity operation journal escapes the authorized Workspace.',
    );
  }
  return journalPath;
}

async function writeJournal(
  journalPath: string,
  journal: NodeProjectEntityOperationJournal,
): Promise<void> {
  await mkdir(path.dirname(journalPath), { recursive: true });
  const temporaryPath = `${journalPath}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporaryPath, 'wx');
    try {
      await handle.writeFile(`${JSON.stringify(journal, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, journalPath);
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true });
    throw nodeIntentError(
      'project-entity-io-failed',
      'Project Entity operation journal could not be written.',
      error,
    );
  }
}

async function readJournal(journalPath: string): Promise<NodeProjectEntityOperationJournal | null> {
  let source: string;
  try {
    source = await readFile(journalPath, 'utf8');
  } catch (error: unknown) {
    if (hasNodeErrorCode(error, 'ENOENT')) return null;
    throw nodeIntentError(
      'project-entity-io-failed',
      'Project Entity operation journal could not be read.',
      error,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error: unknown) {
    throw nodeIntentError(
      'project-entity-io-failed',
      'Project Entity operation journal contains invalid JSON.',
      error,
    );
  }
  if (!isRecord(value) || !hasOnlyKeys(value, ['previous', 'next', 'candidateDecision'])) {
    throw nodeIntentError(
      'project-entity-io-failed',
      'Project Entity operation journal is invalid.',
    );
  }
  const decision = value['candidateDecision'];
  if (
    !isRecord(decision) ||
    !hasOnlyKeys(decision, ['kind', 'candidateId']) ||
    (decision['kind'] !== 'confirm' && decision['kind'] !== 'merge-into') ||
    !isStableIdentity(decision['candidateId'])
  ) {
    throw nodeIntentError(
      'project-entity-io-failed',
      'Project Entity operation journal is invalid.',
    );
  }
  return {
    previous: assertProjectEntityDocument(value['previous']),
    next: assertProjectEntityDocument(value['next']),
    candidateDecision: {
      kind: decision['kind'],
      candidateId: decision['candidateId'],
    },
  };
}

async function removeJournal(journalPath: string): Promise<void> {
  try {
    await rm(journalPath, { force: true });
  } catch (error: unknown) {
    throw nodeIntentError(
      'project-entity-io-failed',
      'Project Entity operation journal could not be removed.',
      error,
    );
  }
}

function sameDocument(left: ProjectEntityDocument, right: ProjectEntityDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isStableIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\\/\0]/u.test(value);
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function nodeIntentError(
  code: ConstructorParameters<typeof ProjectEntityContractError>[0][number]['code'],
  message: string,
  cause?: unknown,
): ProjectEntityContractError {
  return new ProjectEntityContractError(
    [{ code, message }],
    cause === undefined ? undefined : { cause },
  );
}

const operationLocks = new Map<string, Promise<void>>();

async function withInspectorOperationLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = operationLocks.get(key) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => undefined).then(() => gate);
  operationLocks.set(key, next);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release?.();
    if (operationLocks.get(key) === next) operationLocks.delete(key);
  }
}
