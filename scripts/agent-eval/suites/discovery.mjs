import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateBaseline,
  validateRubricDefinition,
  validateScenario,
  validateSuite,
  validateSuiteIndex,
} from '../schemas/contracts.mjs';
import { validateOutputSchemaDefinition } from '../runner/structured-output.mjs';
import { loadCoverageIndex } from './coverage-index.mjs';

const DEFAULT_SUITES_ROOT = dirname(fileURLToPath(import.meta.url));

export async function discoverSuites(options = {}) {
  const root = resolve(options.root ?? DEFAULT_SUITES_ROOT);
  const suiteFiles = await findSuiteFiles(root);
  const suites = await Promise.all(suiteFiles.map((file) => loadSuite(file, { suitesRoot: root })));
  assertUnique(
    suites.map((item) => item.suite.id),
    'suite ids',
  );
  await validateSuiteIndexes(root, suites);
  await loadCoverageIndex({ root, suites });
  return suites.sort((left, right) => left.suite.id.localeCompare(right.suite.id));
}

export async function loadSuite(suiteFile, options = {}) {
  const file = resolve(suiteFile);
  const suitesRoot = resolve(options.suitesRoot ?? DEFAULT_SUITES_ROOT);
  assertContained(suitesRoot, file, 'suite file');
  const suite = validateSuite(await readJson(file));
  validateDeclaredHashes(suite);
  const suiteDirectory = dirname(file);
  let baseline;
  if (suite.baselinePolicy.mode === 'approved') {
    const baselineFile = resolve(
      suiteDirectory,
      'baselines',
      `${suite.baselinePolicy.baselineId}.json`,
    );
    assertContained(suiteDirectory, baselineFile, `baseline ${suite.baselinePolicy.baselineId}`);
    baseline = validateBaseline(await readJson(baselineFile));
    if (baseline.repositoryRevision === 'working-tree') {
      throw new Error(`approved baseline ${baseline.id} requires a concrete repository revision`);
    }
    if (baseline.id !== suite.baselinePolicy.baselineId) {
      throw new Error(`baseline id ${baseline.id} does not match suite baseline policy`);
    }
    if (stableStringify(baseline.target) !== stableStringify(suite.target)) {
      throw new Error(`baseline ${baseline.id} target does not match suite target`);
    }
  }
  const cases = [];
  const outputSchemas = {};
  const rubrics = {};
  for (const rubricRef of suite.rubricRefs) {
    if (!rubricRef.startsWith('rubrics/')) {
      throw new Error(`rubric ${rubricRef} must be owned under suite rubrics/`);
    }
    const rubricFile = resolve(suiteDirectory, rubricRef);
    assertContained(suiteDirectory, rubricFile, `rubric ${rubricRef}`);
    rubrics[rubricRef] = validateRubricDefinition(await readJson(rubricFile));
  }
  for (const index of suite.cases) {
    const caseFile = resolve(suiteDirectory, index.file);
    assertContained(suiteDirectory, caseFile, `suite case ${index.id}`);
    const scenario = validateScenario(await readJson(caseFile));
    validateCaseIndex(suite, index, scenario);
    cases.push({ file: caseFile, scenario });
    for (const assertion of scenario.assertions) {
      if (assertion.kind !== 'structured-output' || !assertion.schemaRef) continue;
      if (!assertion.schemaRef.startsWith('schemas/')) {
        throw new Error(`output schema ${assertion.schemaRef} must be owned under suite schemas/`);
      }
      if (outputSchemas[assertion.schemaRef]) continue;
      const schemaFile = resolve(suiteDirectory, assertion.schemaRef);
      assertContained(suiteDirectory, schemaFile, `output schema ${assertion.schemaRef}`);
      outputSchemas[assertion.schemaRef] = validateOutputSchemaDefinition(
        await readJson(schemaFile),
        `output schema ${assertion.schemaRef}`,
      );
    }
  }
  validateReferences(suite, cases, rubrics);
  return { file, suite, cases, outputSchemas, rubrics, baseline };
}

function validateDeclaredHashes(suite) {
  if (suite.target.kind !== 'skill' && isPlaceholderHash(suite.target.contractHash)) {
    throw new Error(`suite ${suite.id} target contractHash must not be a placeholder hash`);
  }
  for (const profile of suite.runtimeProfiles) {
    const expected = hashJson(profile.settings);
    if (profile.configurationHash !== expected) {
      throw new Error(
        `suite ${suite.id} runtime profile ${profile.id} configurationHash mismatch; expected ${expected}`,
      );
    }
  }
  for (const profile of suite.modelProfiles) {
    const identity =
      profile.selection === 'configured-default'
        ? { selection: profile.selection }
        : profile.purposes
          ? { chat: profile.chat, purposes: profile.purposes }
          : profile.chat;
    const expected = hashJson(identity);
    if (profile.configurationHash !== expected) {
      throw new Error(
        `suite ${suite.id} model profile ${profile.id} configurationHash mismatch; expected ${expected}`,
      );
    }
  }
}

function isPlaceholderHash(value) {
  const digest = value?.replace(/^sha256:/u, '');
  return typeof digest === 'string' && digest.length === 64 && new Set(digest).size === 1;
}

export function selectSuiteCases(discovered, selector = {}) {
  validateSelector(selector);
  const selected = [];
  for (const entry of discovered) {
    if (selector.suiteId && entry.suite.id !== selector.suiteId) continue;
    if (selector.target && !matchesTarget(entry.suite.target, selector.target)) continue;
    for (const item of entry.cases) {
      if (selector.caseGroup && item.scenario.caseGroup !== selector.caseGroup) continue;
      if (selector.caseId && item.scenario.id !== selector.caseId) continue;
      selected.push({
        suite: entry.suite,
        scenario: item.scenario,
        suiteFile: entry.file,
        caseFile: item.file,
        outputSchemas: entry.outputSchemas,
        rubrics: entry.rubrics,
        baseline: entry.baseline,
      });
    }
  }
  if (selected.length === 0) {
    throw new Error(`no v2 Evaluation cases matched selector: ${JSON.stringify(selector)}`);
  }
  if (selector.caseId && selected.length !== 1) {
    throw new Error(`case id ${selector.caseId} is ambiguous across ${selected.length} suites`);
  }
  return selected;
}

async function findSuiteFiles(root) {
  const files = [];
  await visit(root);
  return files.sort();

  async function visit(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name === 'suite.json') {
        files.push(path);
      }
    }
  }
}

async function validateSuiteIndexes(root, suites) {
  for (const [directoryName, ownerKind] of [
    ['agent-runtime', 'agent-runtime'],
    ['skills', 'skill'],
  ]) {
    const directory = resolve(root, directoryName);
    const index = validateSuiteIndex(await readJson(resolve(directory, 'index.json')));
    if (index.ownerKind !== ownerKind) {
      throw new Error(`suite index ${directoryName} ownerKind must be ${ownerKind}`);
    }
    const owned = suites.filter((entry) => entry.suite.owner.kind === ownerKind);
    const indexedIds = new Set(index.entries.map((entry) => entry.suiteId));
    const missing = owned.filter((entry) => !indexedIds.has(entry.suite.id));
    const stale = index.entries.filter(
      (entry) => !owned.some((candidate) => candidate.suite.id === entry.suiteId),
    );
    if (missing.length > 0 || stale.length > 0) {
      throw new Error(
        `suite index ${directoryName} coverage mismatch; missing=${missing.map((entry) => entry.suite.id).join(',') || 'none'} stale=${stale.map((entry) => entry.suiteId).join(',') || 'none'}`,
      );
    }
    for (const item of index.entries) {
      const suite = owned.find((entry) => entry.suite.id === item.suiteId);
      const indexedFile = resolve(directory, item.path);
      assertContained(directory, indexedFile, `suite index ${item.suiteId}`);
      if (suite.file !== indexedFile) {
        throw new Error(`suite index ${item.suiteId} path does not match discovered suite file`);
      }
      if (suite.suite.owner.id !== item.ownerId || suite.suite.target.kind !== item.targetKind) {
        throw new Error(`suite index ${item.suiteId} owner/target metadata drift`);
      }
    }
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(
      `failed to read Evaluation JSON ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function validateCaseIndex(suite, index, scenario) {
  if (scenario.id !== index.id) {
    throw new Error(
      `suite ${suite.id} case index id ${index.id} does not match scenario ${scenario.id}`,
    );
  }
  if (scenario.suiteId !== suite.id) {
    throw new Error(
      `scenario ${scenario.id} references suite ${scenario.suiteId}; expected ${suite.id}`,
    );
  }
  if (scenario.caseGroup !== index.group || scenario.visibility !== index.visibility) {
    throw new Error(
      `suite ${suite.id} case ${scenario.id} group/visibility does not match its index`,
    );
  }
}

function validateReferences(suite, cases, rubrics) {
  const fixtures = new Set(suite.fixtures.map((item) => item.id));
  const runtimeProfiles = new Set(suite.runtimeProfiles.map((item) => item.id));
  const modelProfiles = new Set(suite.modelProfiles.map((item) => item.id));
  const judgeProfiles = new Set(suite.judgeProfiles.map((item) => item.id));
  for (const { scenario } of cases) {
    assertReferencesExist(scenario.fixtureRefs, fixtures, `scenario ${scenario.id} fixture`);
    assertReferencesExist(
      [scenario.runtimeProfileId],
      runtimeProfiles,
      `scenario ${scenario.id} runtime profile`,
    );
    assertReferencesExist(
      scenario.modelProfileIds,
      modelProfiles,
      `scenario ${scenario.id} model profile`,
    );
    assertReferencesExist(
      scenario.assertions
        .filter((assertion) => assertion.kind === 'model')
        .map((assertion) => assertion.profileId),
      modelProfiles,
      `scenario ${scenario.id} model assertion profile`,
    );
    assertReferencesExist(
      scenario.assertions
        .filter((assertion) => assertion.kind === 'pi-runtime' && assertion.modelProfileId)
        .map((assertion) => assertion.modelProfileId),
      modelProfiles,
      `scenario ${scenario.id} Pi runtime model profile`,
    );
    if (scenario.rubric) {
      assertReferencesExist(
        [scenario.rubric.judgeProfileId],
        judgeProfiles,
        `scenario ${scenario.id} Judge profile`,
      );
      assertReferencesExist(
        [scenario.rubric.ref],
        new Set(suite.rubricRefs),
        `scenario ${scenario.id} rubric`,
      );
      const rubric = rubrics[scenario.rubric.ref];
      const evidenceRefs = new Set(
        scenario.evidenceContract.observables.map((observable) => observable.ref),
      );
      for (const criterion of rubric.criteria) {
        assertReferencesExist(
          criterion.evidenceRefs,
          evidenceRefs,
          `scenario ${scenario.id} rubric criterion ${criterion.id} evidence`,
        );
      }
    }
  }
}

function assertReferencesExist(refs, available, label) {
  const missing = refs.filter((ref) => !available.has(ref));
  if (missing.length > 0) throw new Error(`${label} reference(s) not found: ${missing.join(', ')}`);
}

function validateSelector(selector) {
  const allowed = new Set(['suiteId', 'target', 'caseGroup', 'caseId']);
  const unknown = Object.keys(selector).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`unknown suite selector field(s): ${unknown.join(', ')}`);
  if (selector.target?.kind === 'skill') {
    const required = ['name', 'source', 'provenance', 'rootId', 'relativePath', 'fingerprint'];
    const missing = required.filter((key) => !selector.target.identity?.[key]);
    if (missing.length > 0) {
      throw new Error(`Skill target selector requires full Host identity: ${missing.join(', ')}`);
    }
  }
}

function matchesTarget(actual, selected) {
  if (actual.kind !== selected.kind) return false;
  if (actual.kind === 'skill') {
    return stableStringify(actual.identity) === stableStringify(selected.identity);
  }
  return (
    actual.id === selected.id &&
    (!selected.contractHash || actual.contractHash === selected.contractHash)
  );
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashJson(value) {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

function assertContained(root, target, label) {
  const relation = relative(root, target);
  if (relation === '..' || relation.startsWith(`..${sep}`) || relation.startsWith(sep)) {
    throw new Error(`${label} escapes its owning directory`);
  }
}

function assertUnique(values, label) {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate !== undefined) throw new Error(`${label} must be unique; duplicate=${duplicate}`);
}
