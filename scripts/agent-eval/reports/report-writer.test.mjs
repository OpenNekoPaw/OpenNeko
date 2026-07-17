import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createM1ReportDocuments,
  redactRuntimeEvidence,
  writeEvaluationReport,
} from './report-writer.mjs';

const HASH = `sha256:${'a'.repeat(64)}`;
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

function input() {
  return {
    reportId: 'report-1',
    runId: 'run-1',
    suite: {
      id: 'agent-runtime.single-message-tui',
      target: { kind: 'runtime', id: 'single-message-tui', contractHash: HASH },
      repositoryRevision: 'abc123',
    },
    scenario: { id: 'canonical-answer' },
    outcome: 'pass',
    facts: {
      history: [{ role: 'system', content: 'hidden prompt' }],
      apiKey: 'secret',
      runtimeErrors: [],
      idle: { fullyIdle: true },
      turns: [
        { id: 'u1', role: 'user', content: 'read /Users/example/private.txt' },
        { id: 'a1', role: 'assistant', content: 'done' },
      ],
      markdown: { droppedPathEventCount: 0 },
    },
    hardGates: [
      { id: 'runtime', kind: 'runtime-errors-empty', status: 'pass', evidenceRefs: ['turn-facts'] },
    ],
    modelIdentity: { providerId: 'openai', modelId: 'gpt-5' },
    effectiveConfiguration: {
      runtimeProfileId: 'default',
      modelProfileId: 'configured-default',
      digest: HASH,
    },
    fixtureDigest: HASH,
    command: 'node scripts/agent-eval/runner.mjs',
    usage: { latencyMs: 100, retries: 0 },
    skippedStages: ['judge', 'baseline'],
    residualRisk: ['Single provider-backed sample only.'],
  };
}

describe('Agent Evaluation report writer', () => {
  it('creates versioned evidence-linked report documents with sanitized summary', () => {
    const documents = createM1ReportDocuments(input());
    expect(documents.result.schema).toBe('neko.agent-eval.result.v2');
    expect(documents.evidence.schema).toBe('neko.agent-eval.evidence.v2');
    expect(documents.artifactManifest.schema).toBe('neko.agent-eval.artifact-manifest.v2');
    expect(documents.qualityReport).toContain('# Agent Evaluation Quality Report');
    expect(documents.evidence.items[0].data).toMatchObject({
      history: '[REDACTED]',
      apiKey: '[REDACTED]',
    });
    expect(JSON.stringify(documents.evidence)).not.toContain('/Users/example');
    expect(JSON.stringify(documents.summary)).not.toContain('secret');
    expect(JSON.stringify(documents.summary)).not.toContain('hidden prompt');
  });

  it('writes all raw and sanitized artifacts under the selected report root', async () => {
    const outputRoot = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-report-'));
    temporaryDirectories.push(outputRoot);
    const files = await writeEvaluationReport(createM1ReportDocuments(input()), { outputRoot });
    await expect(fs.readFile(files.result, 'utf8')).resolves.toContain('neko.agent-eval.result.v2');
    await expect(fs.readFile(files.evidence, 'utf8')).resolves.toContain('turn-facts');
    await expect(fs.readFile(files.artifactManifest, 'utf8')).resolves.toContain(
      'artifact-manifest.v2',
    );
    await expect(fs.readFile(files.qualityReport, 'utf8')).resolves.toContain('Hard Gates');
    await expect(fs.readFile(files.summary, 'utf8')).resolves.toContain(
      'neko.agent-eval.summary.v2',
    );
  });

  it('tracks incomplete bounded evidence and all redaction classes', () => {
    const facts = input().facts;
    facts.markdown.droppedPathEventCount = 3;
    const documents = createM1ReportDocuments({ ...input(), facts });
    expect(documents.evidence.items[0]).toMatchObject({ complete: false, droppedCount: 3 });
    expect(documents.evidence.redactions).toEqual(
      expect.arrayContaining([
        { kind: 'history', count: 1 },
        { kind: 'secret-field', count: 1 },
        { kind: 'absolute-user-path', count: 1 },
      ]),
    );
  });

  it('redacts nested secret-bearing keys without mutating input', () => {
    const value = { nested: { authorization: 'Bearer secret' } };
    const redacted = redactRuntimeEvidence(value);
    expect(redacted.value).toEqual({ nested: { authorization: '[REDACTED]' } });
    expect(value.nested.authorization).toBe('Bearer secret');
  });

  it('redacts failure messages and residual diagnostics before result and summary output', () => {
    const unsafe = input();
    unsafe.outcome = 'infrastructure-fail';
    unsafe.hardGates = [
      {
        id: 'runtime',
        kind: 'runtime-errors-empty',
        status: 'fail',
        evidenceRefs: ['turn-facts'],
        message: 'Provider failed at /Users/example/private with Bearer abc.def.ghi',
      },
    ];
    unsafe.residualRisk = ['OPENAI_API_KEY=sk-live-secret in /home/example/.neko/config.toml'];

    const documents = createM1ReportDocuments(unsafe);
    const serialized = JSON.stringify({
      result: documents.result,
      summary: documents.summary,
      qualityReport: documents.qualityReport,
    });
    expect(serialized).not.toContain('/Users/example');
    expect(serialized).not.toContain('/home/example');
    expect(serialized).not.toContain('abc.def.ghi');
    expect(serialized).not.toContain('sk-live-secret');
    expect(documents.evidence.redactions).toEqual(
      expect.arrayContaining([
        { kind: 'absolute-user-path', count: 3 },
        { kind: 'diagnostic-secret', count: 2 },
      ]),
    );
  });
});
