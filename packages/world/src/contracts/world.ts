import {
  optionalIdentity,
  readDiagnosticIdentity,
  requireArray,
  requireExactRecord,
  requireIdentity,
  requireIsoDate,
  requireJsonValue,
  requireNonNegativeInteger,
  requireOneOf,
  requirePositiveInteger,
  requireString,
  requireUniqueIdentities,
  type WorldJsonValue,
} from './codec';

export type { WorldJsonValue } from './codec';

export const WORLD_REVIEW_STATUSES = ['draft', 'ready', 'blocked'] as const;
export const WORLD_VISIBILITY_KINDS = ['public', 'actors', 'hidden'] as const;
export const WORLD_FACT_MUTATION_KINDS = ['set', 'delete'] as const;

export type WorldReviewStatus = (typeof WORLD_REVIEW_STATUSES)[number];

export type WorldVisibility =
  | { readonly kind: 'public' }
  | { readonly kind: 'actors'; readonly actorIds: readonly string[] }
  | { readonly kind: 'hidden' };

export interface WorldSourceRef {
  readonly sourceRefId: string;
  readonly sourceRef: string;
  readonly excerpt?: string;
  readonly reviewedAt: string;
}

export interface WorldBookEntry {
  readonly worldBookEntryId: string;
  readonly title: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly sourceRefIds: readonly string[];
  readonly visibility: WorldVisibility;
}

export interface WorldNamedDefinition {
  readonly definitionId: string;
  readonly name: string;
  readonly description: string;
  readonly sourceRefIds: readonly string[];
}

export interface WorldRule {
  readonly ruleId: string;
  readonly statement: string;
  readonly sourceRefIds: readonly string[];
}

export interface WorldFact {
  readonly factId: string;
  readonly key: string;
  readonly value: WorldJsonValue;
  readonly visibility: WorldVisibility;
  readonly knownByActorIds: readonly string[];
}

export interface WorldDefinition {
  readonly background: string;
  readonly worldBook: readonly WorldBookEntry[];
  readonly locations: readonly WorldNamedDefinition[];
  readonly organizations: readonly WorldNamedDefinition[];
  readonly rules: readonly WorldRule[];
  readonly initialFacts: readonly WorldFact[];
}

export interface WorldProject {
  readonly worldProjectId: string;
  readonly title: string;
  readonly draft: WorldDefinition;
  readonly sourceRefs: readonly WorldSourceRef[];
  readonly reviewStatus: WorldReviewStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorldVersion {
  readonly worldVersionId: string;
  readonly worldProjectId: string;
  readonly label: string;
  readonly definition: WorldDefinition;
  readonly acceptedSourceRefIds: readonly string[];
  readonly publishedAt: string;
}

/** Immutable publication identity for a complete, formally runnable World Experience. */
export type WorldExperienceVersionId = string;

export interface WorldRun {
  readonly worldRunId: string;
  readonly worldVersionId: string;
  readonly worldSaveId: string;
  readonly branchId: string;
  readonly worldStateRevision: number;
  readonly timepoint: number;
  readonly createdAt: string;
}

export interface WorldActionIntent {
  readonly worldActionIntentId: string;
  readonly worldRunId: string;
  readonly worldSaveId: string;
  readonly branchId: string;
  readonly actorId: string;
  readonly action: string;
  readonly targetRef?: string;
  readonly parameters: Readonly<Record<string, WorldJsonValue>>;
  readonly observedTimepoint: number;
  readonly expectedWorldStateRevision: number;
  readonly createdAt: string;
}

export type WorldFactMutation =
  | { readonly kind: 'set'; readonly fact: WorldFact }
  | { readonly kind: 'delete'; readonly factId: string };

export interface WorldEvent {
  readonly worldEventId: string;
  readonly worldActionIntentId: string;
  readonly worldRunId: string;
  readonly worldSaveId: string;
  readonly branchId: string;
  readonly sequence: number;
  readonly timepoint: number;
  readonly actorId: string;
  readonly action: string;
  readonly mutations: readonly WorldFactMutation[];
  readonly visibility: WorldVisibility;
  readonly knownByActorIds: readonly string[];
  readonly committedAt: string;
}

export interface WorldState {
  readonly worldVersionId: string;
  readonly worldRunId: string;
  readonly worldSaveId: string;
  readonly branchId: string;
  readonly worldStateRevision: number;
  readonly timepoint: number;
  readonly facts: readonly WorldFact[];
}

export interface WorldSaveBranch {
  readonly branchId: string;
  readonly parentBranchId?: string;
  readonly forkedFromWorldEventId?: string;
  readonly events: readonly WorldEvent[];
  readonly state: WorldState;
}

export interface WorldSave {
  readonly worldSaveId: string;
  readonly worldRunId: string;
  readonly worldVersionId: string;
  readonly label: string;
  readonly activeBranchId: string;
  readonly branches: readonly WorldSaveBranch[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorldView {
  readonly worldVersionId: string;
  readonly worldRunId: string;
  readonly worldSaveId: string;
  readonly branchId: string;
  readonly participantId: string;
  readonly actorId?: string;
  readonly worldStateRevision: number;
  readonly timepoint: number;
  readonly background: string;
  readonly worldBook: readonly WorldBookEntry[];
  readonly facts: readonly WorldFact[];
  readonly events: readonly WorldEvent[];
}

export type WorldRecordKind =
  | 'world-project'
  | 'world-version'
  | 'world-run'
  | 'world-action-intent'
  | 'world-event'
  | 'world-state'
  | 'world-save'
  | 'world-view';

export interface WorldRecordDiagnostic {
  readonly code: 'invalid-world-record';
  readonly recordKind: WorldRecordKind;
  readonly recordId?: string;
  readonly message: string;
}

export interface WorldRecordDecodeResult<T> {
  readonly records: readonly T[];
  readonly diagnostics: readonly WorldRecordDiagnostic[];
}

export function parseWorldProject(value: unknown): WorldProject {
  const record = requireExactRecord(
    value,
    ['worldProjectId', 'title', 'draft', 'sourceRefs', 'reviewStatus', 'createdAt', 'updatedAt'],
    'WorldProject',
  );
  const sourceRefs = requireUniqueIdentities(
    requireArray(record['sourceRefs'], parseWorldSourceRef, 'WorldProject sourceRefs'),
    (item) => item.sourceRefId,
    'WorldProject sourceRefs',
  );
  const sourceRefIds = new Set(sourceRefs.map((item) => item.sourceRefId));
  const draft = parseWorldDefinition(record['draft']);
  validateDefinitionSources(draft, sourceRefIds, 'WorldProject');
  return {
    worldProjectId: requireIdentity(record['worldProjectId'], 'WorldProject identity'),
    title: requireIdentity(record['title'], 'WorldProject title'),
    draft,
    sourceRefs,
    reviewStatus: requireOneOf(record['reviewStatus'], WORLD_REVIEW_STATUSES, 'World reviewStatus'),
    createdAt: requireIsoDate(record['createdAt'], 'WorldProject createdAt'),
    updatedAt: requireIsoDate(record['updatedAt'], 'WorldProject updatedAt'),
  };
}

export function parseWorldVersion(value: unknown): WorldVersion {
  const record = requireExactRecord(
    value,
    [
      'worldVersionId',
      'worldProjectId',
      'label',
      'definition',
      'acceptedSourceRefIds',
      'publishedAt',
    ],
    'WorldVersion',
  );
  const acceptedSourceRefIds = requireUniqueStringArray(
    record['acceptedSourceRefIds'],
    'WorldVersion acceptedSourceRefIds',
  );
  const definition = parseWorldDefinition(record['definition']);
  validateDefinitionSources(definition, new Set(acceptedSourceRefIds), 'WorldVersion');
  return {
    worldVersionId: requireIdentity(record['worldVersionId'], 'WorldVersion identity'),
    worldProjectId: requireIdentity(record['worldProjectId'], 'WorldVersion source project'),
    label: requireIdentity(record['label'], 'WorldVersion label'),
    definition,
    acceptedSourceRefIds,
    publishedAt: requireIsoDate(record['publishedAt'], 'WorldVersion publishedAt'),
  };
}

export function parseWorldRun(value: unknown): WorldRun {
  const record = requireExactRecord(
    value,
    [
      'worldRunId',
      'worldVersionId',
      'worldSaveId',
      'branchId',
      'worldStateRevision',
      'timepoint',
      'createdAt',
    ],
    'WorldRun',
  );
  return {
    worldRunId: requireIdentity(record['worldRunId'], 'WorldRun identity'),
    worldVersionId: requireIdentity(record['worldVersionId'], 'WorldRun WorldVersion identity'),
    worldSaveId: requireIdentity(record['worldSaveId'], 'WorldRun WorldSave identity'),
    branchId: requireIdentity(record['branchId'], 'WorldRun branch identity'),
    worldStateRevision: requireNonNegativeInteger(
      record['worldStateRevision'],
      'WorldRun worldStateRevision',
    ),
    timepoint: requireNonNegativeInteger(record['timepoint'], 'WorldRun timepoint'),
    createdAt: requireIsoDate(record['createdAt'], 'WorldRun createdAt'),
  };
}

export function parseWorldActionIntent(value: unknown): WorldActionIntent {
  const record = requireExactRecord(
    value,
    [
      'worldActionIntentId',
      'worldRunId',
      'worldSaveId',
      'branchId',
      'actorId',
      'action',
      'targetRef',
      'parameters',
      'observedTimepoint',
      'expectedWorldStateRevision',
      'createdAt',
    ],
    'WorldActionIntent',
  );
  const targetRef = optionalIdentity(record['targetRef'], 'WorldActionIntent targetRef');
  const parametersValue = requireExactRecord(
    record['parameters'],
    Object.keys(
      typeof record['parameters'] === 'object' && record['parameters'] !== null
        ? record['parameters']
        : {},
    ),
    'WorldActionIntent parameters',
  );
  return {
    worldActionIntentId: requireIdentity(
      record['worldActionIntentId'],
      'WorldActionIntent identity',
    ),
    worldRunId: requireIdentity(record['worldRunId'], 'WorldActionIntent WorldRun identity'),
    worldSaveId: requireIdentity(record['worldSaveId'], 'WorldActionIntent WorldSave identity'),
    branchId: requireIdentity(record['branchId'], 'WorldActionIntent branch identity'),
    actorId: requireIdentity(record['actorId'], 'WorldActionIntent actor identity'),
    action: requireIdentity(record['action'], 'WorldActionIntent action'),
    ...(targetRef === undefined ? {} : { targetRef }),
    parameters: Object.fromEntries(
      Object.entries(parametersValue).map(([key, item]) => [
        key,
        requireJsonValue(item, `WorldActionIntent parameters.${key}`),
      ]),
    ),
    observedTimepoint: requireNonNegativeInteger(
      record['observedTimepoint'],
      'WorldActionIntent observedTimepoint',
    ),
    expectedWorldStateRevision: requireNonNegativeInteger(
      record['expectedWorldStateRevision'],
      'WorldActionIntent expectedWorldStateRevision',
    ),
    createdAt: requireIsoDate(record['createdAt'], 'WorldActionIntent createdAt'),
  };
}

export function parseWorldEvent(value: unknown): WorldEvent {
  const record = requireExactRecord(
    value,
    [
      'worldEventId',
      'worldActionIntentId',
      'worldRunId',
      'worldSaveId',
      'branchId',
      'sequence',
      'timepoint',
      'actorId',
      'action',
      'mutations',
      'visibility',
      'knownByActorIds',
      'committedAt',
    ],
    'WorldEvent',
  );
  return {
    worldEventId: requireIdentity(record['worldEventId'], 'WorldEvent identity'),
    worldActionIntentId: requireIdentity(
      record['worldActionIntentId'],
      'WorldEvent source intent identity',
    ),
    worldRunId: requireIdentity(record['worldRunId'], 'WorldEvent WorldRun identity'),
    worldSaveId: requireIdentity(record['worldSaveId'], 'WorldEvent WorldSave identity'),
    branchId: requireIdentity(record['branchId'], 'WorldEvent branch identity'),
    sequence: requirePositiveInteger(record['sequence'], 'WorldEvent sequence'),
    timepoint: requirePositiveInteger(record['timepoint'], 'WorldEvent timepoint'),
    actorId: requireIdentity(record['actorId'], 'WorldEvent actor identity'),
    action: requireIdentity(record['action'], 'WorldEvent action'),
    mutations: requireArray(record['mutations'], parseWorldFactMutation, 'WorldEvent mutations'),
    visibility: parseWorldVisibility(record['visibility']),
    knownByActorIds: requireUniqueStringArray(
      record['knownByActorIds'],
      'WorldEvent knownByActorIds',
    ),
    committedAt: requireIsoDate(record['committedAt'], 'WorldEvent committedAt'),
  };
}

export function parseWorldState(value: unknown): WorldState {
  const record = requireExactRecord(
    value,
    [
      'worldVersionId',
      'worldRunId',
      'worldSaveId',
      'branchId',
      'worldStateRevision',
      'timepoint',
      'facts',
    ],
    'WorldState',
  );
  return {
    worldVersionId: requireIdentity(record['worldVersionId'], 'WorldState WorldVersion identity'),
    worldRunId: requireIdentity(record['worldRunId'], 'WorldState WorldRun identity'),
    worldSaveId: requireIdentity(record['worldSaveId'], 'WorldState WorldSave identity'),
    branchId: requireIdentity(record['branchId'], 'WorldState branch identity'),
    worldStateRevision: requireNonNegativeInteger(
      record['worldStateRevision'],
      'WorldState worldStateRevision',
    ),
    timepoint: requireNonNegativeInteger(record['timepoint'], 'WorldState timepoint'),
    facts: requireUniqueIdentities(
      requireArray(record['facts'], parseWorldFact, 'WorldState facts'),
      (item) => item.factId,
      'WorldState facts',
    ),
  };
}

export function parseWorldSave(value: unknown): WorldSave {
  const record = requireExactRecord(
    value,
    [
      'worldSaveId',
      'worldRunId',
      'worldVersionId',
      'label',
      'activeBranchId',
      'branches',
      'createdAt',
      'updatedAt',
    ],
    'WorldSave',
  );
  const worldSaveId = requireIdentity(record['worldSaveId'], 'WorldSave identity');
  const worldRunId = requireIdentity(record['worldRunId'], 'WorldSave WorldRun identity');
  const worldVersionId = requireIdentity(
    record['worldVersionId'],
    'WorldSave WorldVersion identity',
  );
  const branches = requireUniqueIdentities(
    requireArray(record['branches'], parseWorldSaveBranch, 'WorldSave branches'),
    (item) => item.branchId,
    'WorldSave branches',
  );
  const activeBranchId = requireIdentity(record['activeBranchId'], 'WorldSave activeBranchId');
  if (!branches.some((branch) => branch.branchId === activeBranchId)) {
    throw new Error('WorldSave active branch does not exist.');
  }
  if (branches.filter((branch) => branch.parentBranchId === undefined).length !== 1) {
    throw new Error('WorldSave must contain exactly one root branch.');
  }
  const branchIds = new Set(branches.map((branch) => branch.branchId));
  for (const [branchIndex, branch] of branches.entries()) {
    if (branch.parentBranchId !== undefined && !branchIds.has(branch.parentBranchId)) {
      throw new Error(`WorldSave branch '${branch.branchId}' has an unknown parent.`);
    }
    if (branch.parentBranchId === branch.branchId) {
      throw new Error(`WorldSave branch '${branch.branchId}' cannot be its own parent.`);
    }
    const parentBranch =
      branch.parentBranchId === undefined
        ? undefined
        : branches.find((candidate) => candidate.branchId === branch.parentBranchId);
    if (parentBranch && branches.indexOf(parentBranch) >= branchIndex) {
      throw new Error(
        `WorldSave branch '${branch.branchId}' parent must precede the child branch.`,
      );
    }
    const forkEvent =
      branch.forkedFromWorldEventId === undefined
        ? undefined
        : parentBranch?.events.find(
            (event) => event.worldEventId === branch.forkedFromWorldEventId,
          );
    if (branch.parentBranchId !== undefined && !forkEvent) {
      throw new Error(
        `WorldSave branch '${branch.branchId}' fork event does not exist on its parent branch.`,
      );
    }
    validateBranchAuthority(
      branch,
      worldVersionId,
      worldRunId,
      worldSaveId,
      forkEvent?.timepoint ?? 0,
    );
  }
  return {
    worldSaveId,
    worldRunId,
    worldVersionId,
    label: requireIdentity(record['label'], 'WorldSave label'),
    activeBranchId,
    branches,
    createdAt: requireIsoDate(record['createdAt'], 'WorldSave createdAt'),
    updatedAt: requireIsoDate(record['updatedAt'], 'WorldSave updatedAt'),
  };
}

export function parseWorldView(value: unknown): WorldView {
  const record = requireExactRecord(
    value,
    [
      'worldVersionId',
      'worldRunId',
      'worldSaveId',
      'branchId',
      'participantId',
      'actorId',
      'worldStateRevision',
      'timepoint',
      'background',
      'worldBook',
      'facts',
      'events',
    ],
    'WorldView',
  );
  const actorId = optionalIdentity(record['actorId'], 'WorldView actor identity');
  const facts = requireUniqueIdentities(
    requireArray(record['facts'], parseWorldFact, 'WorldView facts'),
    (item) => item.factId,
    'WorldView facts',
  );
  const events = requireUniqueIdentities(
    requireArray(record['events'], parseWorldEvent, 'WorldView events'),
    (item) => item.worldEventId,
    'WorldView events',
  );
  if (actorId !== undefined) {
    if (facts.some((fact) => !isVisibleToActor(fact.visibility, fact.knownByActorIds, actorId))) {
      throw new Error('WorldView contains a fact outside actor knowledge or visibility.');
    }
    if (
      events.some((event) => !isVisibleToActor(event.visibility, event.knownByActorIds, actorId))
    ) {
      throw new Error('WorldView contains an event outside actor knowledge or visibility.');
    }
  }
  return {
    worldVersionId: requireIdentity(record['worldVersionId'], 'WorldView WorldVersion identity'),
    worldRunId: requireIdentity(record['worldRunId'], 'WorldView WorldRun identity'),
    worldSaveId: requireIdentity(record['worldSaveId'], 'WorldView WorldSave identity'),
    branchId: requireIdentity(record['branchId'], 'WorldView branch identity'),
    participantId: requireIdentity(record['participantId'], 'WorldView participant identity'),
    ...(actorId === undefined ? {} : { actorId }),
    worldStateRevision: requireNonNegativeInteger(
      record['worldStateRevision'],
      'WorldView worldStateRevision',
    ),
    timepoint: requireNonNegativeInteger(record['timepoint'], 'WorldView timepoint'),
    background: requireString(record['background'], 'WorldView background'),
    worldBook: requireUniqueIdentities(
      requireArray(record['worldBook'], parseWorldBookEntry, 'WorldView worldBook'),
      (item) => item.worldBookEntryId,
      'WorldView worldBook',
    ),
    facts,
    events,
  };
}

export function decodeWorldRecords<T>(
  values: readonly unknown[],
  recordKind: WorldRecordKind,
  parser: (value: unknown) => T,
  identityKey: string,
): WorldRecordDecodeResult<T> {
  const records: T[] = [];
  const diagnostics: WorldRecordDiagnostic[] = [];
  for (const value of values) {
    try {
      records.push(parser(value));
    } catch (error) {
      const recordId = readDiagnosticIdentity(value, identityKey);
      diagnostics.push({
        code: 'invalid-world-record',
        recordKind,
        ...(recordId === undefined ? {} : { recordId }),
        message: error instanceof Error ? error.message : `Invalid ${recordKind} record.`,
      });
    }
  }
  return { records, diagnostics };
}

export function parseWorldDefinition(value: unknown): WorldDefinition {
  const record = requireExactRecord(
    value,
    ['background', 'worldBook', 'locations', 'organizations', 'rules', 'initialFacts'],
    'World definition',
  );
  return {
    background: requireString(record['background'], 'World background'),
    worldBook: requireUniqueIdentities(
      requireArray(record['worldBook'], parseWorldBookEntry, 'WorldBook'),
      (item) => item.worldBookEntryId,
      'WorldBook',
    ),
    locations: requireUniqueIdentities(
      requireArray(record['locations'], parseWorldNamedDefinition, 'World locations'),
      (item) => item.definitionId,
      'World locations',
    ),
    organizations: requireUniqueIdentities(
      requireArray(record['organizations'], parseWorldNamedDefinition, 'World organizations'),
      (item) => item.definitionId,
      'World organizations',
    ),
    rules: requireUniqueIdentities(
      requireArray(record['rules'], parseWorldRule, 'World rules'),
      (item) => item.ruleId,
      'World rules',
    ),
    initialFacts: requireUniqueIdentities(
      requireArray(record['initialFacts'], parseWorldFact, 'World initialFacts'),
      (item) => item.factId,
      'World initialFacts',
    ),
  };
}

function parseWorldSourceRef(value: unknown): WorldSourceRef {
  const record = requireExactRecord(
    value,
    ['sourceRefId', 'sourceRef', 'excerpt', 'reviewedAt'],
    'World source reference',
  );
  const excerpt =
    record['excerpt'] === undefined
      ? undefined
      : requireString(record['excerpt'], 'World source excerpt');
  return {
    sourceRefId: requireIdentity(record['sourceRefId'], 'World source reference identity'),
    sourceRef: requireIdentity(record['sourceRef'], 'World source reference'),
    ...(excerpt === undefined ? {} : { excerpt }),
    reviewedAt: requireIsoDate(record['reviewedAt'], 'World source reviewedAt'),
  };
}

function parseWorldBookEntry(value: unknown): WorldBookEntry {
  const record = requireExactRecord(
    value,
    ['worldBookEntryId', 'title', 'content', 'tags', 'sourceRefIds', 'visibility'],
    'WorldBook entry',
  );
  return {
    worldBookEntryId: requireIdentity(record['worldBookEntryId'], 'WorldBook entry identity'),
    title: requireIdentity(record['title'], 'WorldBook entry title'),
    content: requireString(record['content'], 'WorldBook entry content'),
    tags: requireUniqueStringArray(record['tags'], 'WorldBook entry tags'),
    sourceRefIds: requireUniqueStringArray(record['sourceRefIds'], 'WorldBook sourceRefIds'),
    visibility: parseWorldVisibility(record['visibility']),
  };
}

function parseWorldNamedDefinition(value: unknown): WorldNamedDefinition {
  const record = requireExactRecord(
    value,
    ['definitionId', 'name', 'description', 'sourceRefIds'],
    'World named definition',
  );
  return {
    definitionId: requireIdentity(record['definitionId'], 'World definition identity'),
    name: requireIdentity(record['name'], 'World definition name'),
    description: requireString(record['description'], 'World definition description'),
    sourceRefIds: requireUniqueStringArray(record['sourceRefIds'], 'World definition sourceRefIds'),
  };
}

function parseWorldRule(value: unknown): WorldRule {
  const record = requireExactRecord(value, ['ruleId', 'statement', 'sourceRefIds'], 'World rule');
  return {
    ruleId: requireIdentity(record['ruleId'], 'World rule identity'),
    statement: requireIdentity(record['statement'], 'World rule statement'),
    sourceRefIds: requireUniqueStringArray(record['sourceRefIds'], 'World rule sourceRefIds'),
  };
}

export function parseWorldFact(value: unknown): WorldFact {
  const record = requireExactRecord(
    value,
    ['factId', 'key', 'value', 'visibility', 'knownByActorIds'],
    'World fact',
  );
  return {
    factId: requireIdentity(record['factId'], 'World fact identity'),
    key: requireIdentity(record['key'], 'World fact key'),
    value: requireJsonValue(record['value'], 'World fact value'),
    visibility: parseWorldVisibility(record['visibility']),
    knownByActorIds: requireUniqueStringArray(
      record['knownByActorIds'],
      'World fact knownByActorIds',
    ),
  };
}

function parseWorldFactMutation(value: unknown): WorldFactMutation {
  const record = requireExactRecord(value, ['kind', 'fact', 'factId'], 'World fact mutation');
  const kind = requireOneOf(record['kind'], WORLD_FACT_MUTATION_KINDS, 'World fact mutation kind');
  if (kind === 'set') {
    if (record['factId'] !== undefined) throw new Error('Set mutation cannot contain factId.');
    return { kind, fact: parseWorldFact(record['fact']) };
  }
  if (record['fact'] !== undefined) throw new Error('Delete mutation cannot contain fact.');
  return { kind, factId: requireIdentity(record['factId'], 'Deleted World fact identity') };
}

function parseWorldVisibility(value: unknown): WorldVisibility {
  const record = requireExactRecord(value, ['kind', 'actorIds'], 'World visibility');
  const kind = requireOneOf(record['kind'], WORLD_VISIBILITY_KINDS, 'World visibility kind');
  if (kind !== 'actors') {
    if (record['actorIds'] !== undefined) {
      throw new Error('Only actor-scoped World visibility may contain actorIds.');
    }
    return { kind };
  }
  const actorIds = requireUniqueStringArray(record['actorIds'], 'World visibility actorIds');
  if (actorIds.length === 0) throw new Error('Actor-scoped World visibility requires actorIds.');
  return { kind, actorIds };
}

function parseWorldSaveBranch(value: unknown): WorldSaveBranch {
  const record = requireExactRecord(
    value,
    ['branchId', 'parentBranchId', 'forkedFromWorldEventId', 'events', 'state'],
    'WorldSave branch',
  );
  const parentBranchId = optionalIdentity(record['parentBranchId'], 'WorldSave parent branch');
  const forkedFromWorldEventId = optionalIdentity(
    record['forkedFromWorldEventId'],
    'WorldSave fork event',
  );
  if ((parentBranchId === undefined) !== (forkedFromWorldEventId === undefined)) {
    throw new Error('WorldSave branch parent and fork event must be provided together.');
  }
  return {
    branchId: requireIdentity(record['branchId'], 'WorldSave branch identity'),
    ...(parentBranchId === undefined ? {} : { parentBranchId }),
    ...(forkedFromWorldEventId === undefined ? {} : { forkedFromWorldEventId }),
    events: requireUniqueIdentities(
      requireArray(record['events'], parseWorldEvent, 'WorldSave branch events'),
      (item) => item.worldEventId,
      'WorldSave branch events',
    ),
    state: parseWorldState(record['state']),
  };
}

function validateDefinitionSources(
  definition: WorldDefinition,
  sourceRefIds: ReadonlySet<string>,
  label: string,
): void {
  const referenced = [
    ...definition.worldBook.flatMap((item) => item.sourceRefIds),
    ...definition.locations.flatMap((item) => item.sourceRefIds),
    ...definition.organizations.flatMap((item) => item.sourceRefIds),
    ...definition.rules.flatMap((item) => item.sourceRefIds),
  ];
  const missing = referenced.find((sourceRefId) => !sourceRefIds.has(sourceRefId));
  if (missing) throw new Error(`${label} definition references unknown source '${missing}'.`);
}

function validateBranchAuthority(
  branch: WorldSaveBranch,
  worldVersionId: string,
  worldRunId: string,
  worldSaveId: string,
  baseTimepoint: number,
): void {
  const state = branch.state;
  if (
    state.worldVersionId !== worldVersionId ||
    state.worldRunId !== worldRunId ||
    state.worldSaveId !== worldSaveId ||
    state.branchId !== branch.branchId
  ) {
    throw new Error(
      `WorldSave branch '${branch.branchId}' state authority does not match its save.`,
    );
  }
  for (const [index, event] of branch.events.entries()) {
    if (
      event.worldRunId !== worldRunId ||
      event.worldSaveId !== worldSaveId ||
      event.branchId !== branch.branchId
    ) {
      throw new Error(
        `WorldSave branch '${branch.branchId}' contains an event from another authority.`,
      );
    }
    if (event.sequence !== index + 1) throw new Error('WorldEvent sequence must be contiguous.');
    if (event.timepoint !== baseTimepoint + index + 1) {
      throw new Error('WorldEvent timepoint must continue from its branch fork point.');
    }
  }
  if (state.worldStateRevision !== branch.events.length) {
    throw new Error(
      `WorldSave branch '${branch.branchId}' state revision must equal its event count.`,
    );
  }
  const lastEvent = branch.events.at(-1);
  if ((lastEvent?.timepoint ?? baseTimepoint) !== state.timepoint) {
    throw new Error(`WorldSave branch '${branch.branchId}' state timepoint is not current.`);
  }
}

function isVisibleToActor(
  visibility: WorldVisibility,
  knownByActorIds: readonly string[],
  actorId: string,
): boolean {
  if (!knownByActorIds.includes(actorId)) return false;
  return (
    visibility.kind === 'public' ||
    (visibility.kind === 'actors' && visibility.actorIds.includes(actorId))
  );
}

function requireUniqueStringArray(value: unknown, label: string): readonly string[] {
  return requireUniqueIdentities(
    requireArray(value, (item) => requireIdentity(item, label), label),
    (item) => item,
    label,
  );
}
