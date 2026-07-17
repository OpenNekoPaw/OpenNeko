import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFunctionalReport,
  redactEvidence,
  writeEvidenceFile,
  writeFunctionalReport,
} from './report.mjs';

describe('webview functional reports', () => {
  it('redacts credential fields and token-shaped text', () => {
    assert.deepEqual(
      redactEvidence({ authorization: 'Bearer abc.def.ghi', log: 'key sk-abcdefghijklmnop' }),
      { authorization: '<redacted>', log: 'key <redacted>' },
    );
  });

  it('uses the versioned report schema', () => {
    const report = createFunctionalReport({
      scenario: { id: 'canvas.p0.edit', ownerPackage: 'neko-canvas', tier: 'p0', host: 'vscode' },
      status: 'pass',
      failureClassification: undefined,
      startedAt: '2026-07-13T00:00:00.000Z',
      completedAt: '2026-07-13T00:00:01.000Z',
      durationMs: 1000,
      hostIdentity: { version: '1.128.0' },
      fixtureDigest: 'sha256:test',
      steps: [],
      assertions: [],
      runtimeErrors: [],
      sideEffects: [],
      artifacts: {},
    });
    assert.equal(report.schemaVersion, 'neko.webview-functional.report.v1');
    assert.equal(report.status, 'pass');
  });

  it('writes a versioned result under a scenario-owned report directory', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'neko-functional-report-'));
    const report = createFunctionalReport({
      scenario: { id: 'agent.p0', ownerPackage: 'neko-agent', tier: 'p0', host: 'vscode' },
      status: 'case-fail',
      failureClassification: 'test-case',
      startedAt: '2026-07-13T00:00:00.000Z',
      completedAt: '2026-07-13T00:00:01.000Z',
      durationMs: 1000,
      hostIdentity: {}, fixtureDigest: 'sha256:test', steps: [], assertions: [],
      runtimeErrors: [], sideEffects: [], artifacts: {},
    });
    const { resultPath } = await writeFunctionalReport(report, outputRoot);
    assert.equal(JSON.parse(await readFile(resultPath, 'utf8')).status, 'case-fail');
  });

  it('writes nested evidence inside the report directory and rejects traversal', async () => {
    const reportDir = await mkdtemp(join(tmpdir(), 'neko-functional-evidence-'));
    const evidencePath = await writeEvidenceFile(reportDir, 'logs/host.json', '{}\n');

    assert.equal(await readFile(evidencePath, 'utf8'), '{}\n');
    await assert.rejects(
      writeEvidenceFile(reportDir, '../outside.json', '{}\n'),
      /escapes report directory/u,
    );
  });
});
