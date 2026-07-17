#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createV2DryRun } from './runner/run-v2-case.mjs';
import { discoverSuites } from './suites/discovery.mjs';

const scriptPath = fileURLToPath(import.meta.url);

export async function runAllSuiteDryRun() {
  const suites = await discoverSuites();
  const cases = suites.flatMap((entry) =>
    entry.cases.map((item) => ({
      suite: entry.suite,
      scenario: item.scenario,
      suiteFile: entry.file,
      caseFile: item.file,
      outputSchemas: entry.outputSchemas,
      rubrics: entry.rubrics,
      baseline: entry.baseline,
    })),
  );
  const results = cases.map((selection) => createV2DryRun(selection));
  if (!results.every((result) => result.ok === true)) {
    throw new Error('one or more v2 suite cases did not complete dry-run validation');
  }
  return {
    schema: 'neko.agent-eval.all-suite-dry-run.v2',
    ok: true,
    suiteCount: suites.length,
    caseCount: results.length,
    suites: suites.map((entry) => ({ id: entry.suite.id, caseCount: entry.cases.length })),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    process.stdout.write(`${JSON.stringify(await runAllSuiteDryRun(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `Agent Evaluation all-suite dry-run failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
