#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createV2DryRun } from './runner/run-v2-case.mjs';
import { discoverSuites } from './suites/discovery.mjs';

const scriptPath = fileURLToPath(import.meta.url);

export async function runAllSuiteDryRun(options = {}) {
  const suites = await discoverSuites();
  const selectedSuites = options.suiteId
    ? suites.filter((entry) => entry.suite.id === options.suiteId)
    : suites;
  if (selectedSuites.length === 0) {
    throw new Error(`selected suite does not exist: ${options.suiteId}`);
  }
  const cases = selectedSuites.flatMap((entry) =>
    entry.cases.map((item) => ({
      suite: entry.suite,
      scenario: item.scenario,
      suiteFile: entry.file,
      caseFile: item.file,
      outputSchemas: entry.outputSchemas,
      rubrics: entry.rubrics,
      baseline: entry.baseline,
    })),
  ).filter((selection) => !options.caseId || selection.scenario.id === options.caseId);
  if (cases.length === 0) {
    throw new Error(
      `selected case does not exist in ${options.suiteId}: ${options.caseId}`,
    );
  }
  const results = cases.map((selection) => createV2DryRun(selection));
  if (!results.every((result) => result.ok === true)) {
    throw new Error('one or more v2 suite cases did not complete dry-run validation');
  }
  return {
    schema: 'neko.agent-eval.all-suite-dry-run.v2',
    ok: true,
    suiteCount: selectedSuites.length,
    caseCount: results.length,
    suites: selectedSuites.map((entry) => ({
      id: entry.suite.id,
      caseCount: cases.filter((selection) => selection.suite.id === entry.suite.id).length,
    })),
  };
}

export function parseDryRunArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (name !== '--suite' && name !== '--case') {
      throw new Error(`unknown all-suite dry-run option: ${name}`);
    }
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    if (name === '--suite') options.suiteId = value;
    else options.caseId = value;
    index += 1;
  }
  if (options.caseId && !options.suiteId) {
    throw new Error('--case requires --suite');
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    process.stdout.write(
      `${JSON.stringify(await runAllSuiteDryRun(parseDryRunArgs(process.argv.slice(2))), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Agent Evaluation all-suite dry-run failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
