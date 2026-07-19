import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  PROJECT_QUALITY_CONTRACT_VERSION,
  createResourceRef,
  type ProjectQualityFacade,
  type QualityProjectRef,
  type QualityTarget,
} from '@neko/shared';
import { collectProjectQualityEvidence } from '../projectQualityOrchestration';

const project: QualityProjectRef = {
  domain: 'cut',
  documentUri: 'file:///workspace/edit.nkv',
  projectRevision: 'nkv:digest',
  contentDigest: 'digest',
};
const target: QualityTarget = {
  version: MEDIA_QUALITY_CONTRACT_VERSION,
  targetId: 'cut-project',
  kind: 'project-artifact',
  projectRef: project,
  revision: project.projectRevision,
  contentDigest: project.contentDigest,
};
const snapshotRef = createResourceRef({
  scope: 'project',
  provider: 'neko-cut',
  kind: 'document',
  source: {
    kind: 'document',
    uri: project.documentUri,
    identity: { hash: project.contentDigest },
  },
  locator: { kind: 'file', uri: project.documentUri },
  fingerprint: { strategy: 'hash', value: project.contentDigest! },
});

describe('collectProjectQualityEvidence', () => {
  it('routes structural, runtime, and export checks through the owning facade', async () => {
    const facade = createFacade();
    const resolver = { resolve: vi.fn(async () => facade) };

    const evidence = await collectProjectQualityEvidence(target, resolver, {
      now: () => '2026-07-12T00:00:00.000Z',
      createId: (prefix) => `${prefix}-1`,
    });

    expect(resolver.resolve).toHaveBeenCalledWith(project);
    expect(facade.validateProject).toHaveBeenCalledTimes(1);
    expect(facade.getProjectSnapshot).toHaveBeenCalledTimes(1);
    expect(facade.probeRuntime).toHaveBeenCalledTimes(1);
    expect(facade.checkExportReadiness).toHaveBeenCalledTimes(1);
    expect(facade.renderPreview).not.toHaveBeenCalled();
    expect(evidence.map((item) => item.evaluator.evaluatorClass)).toEqual([
      'structural',
      'technical',
      'policy',
    ]);
    expect(evidence.every((item) => item.sourceEvidenceRefs[0]?.id === snapshotRef.id)).toBe(true);
  });

  it('returns blocking structural evidence and does not continue after validation failure', async () => {
    const facade = createFacade({ validationOk: false });

    const evidence = await collectProjectQualityEvidence(target, {
      resolve: vi.fn(async () => facade),
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      evaluator: { evaluatorClass: 'structural' },
      metrics: [{ id: 'project.valid', value: false, passed: false }],
      issues: [expect.objectContaining({ severity: 'error' })],
    });
    expect(facade.getProjectSnapshot).not.toHaveBeenCalled();
  });

  it('projects failed runtime and readiness results without reading absent data', async () => {
    const facade = createFacade({ runtimeOk: false, readinessOk: false });

    const evidence = await collectProjectQualityEvidence(target, {
      resolve: vi.fn(async () => facade),
    });

    expect(evidence[1]).toMatchObject({
      evaluator: { evaluatorClass: 'technical' },
      metrics: [{ id: 'project.runtime.available', value: false, passed: false }],
      issues: [expect.objectContaining({ category: 'runtime-unavailable', severity: 'error' })],
    });
    expect(evidence[2]).toMatchObject({
      evaluator: { evaluatorClass: 'policy' },
      metrics: [{ id: 'project.export.ready', value: false, passed: false }],
      issues: [expect.objectContaining({ category: 'export-not-ready', severity: 'error' })],
    });
  });

  it('does not import or duplicate owning .nk* parsers', () => {
    const source = readFileSync(
      new URL('../projectQualityOrchestration.ts', import.meta.url),
      'utf8',
    );
    for (const forbidden of [
      'nkpProjectFormatCodec',
      'nkmProjectFormatCodec',
      'nksProjectFormatCodec',
      'nkvProjectFormatCodec',
      'nkaProjectFormatCodec',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('fails visibly when the owning extension facade is unavailable', async () => {
    await expect(
      collectProjectQualityEvidence(target, { resolve: vi.fn(async () => undefined) }),
    ).rejects.toThrow('quality-project-facade-unavailable');
  });
});

function createFacade(
  options: {
    readonly validationOk?: boolean;
    readonly runtimeOk?: boolean;
    readonly readinessOk?: boolean;
  } = {},
): ProjectQualityFacade & {
  readonly validateProject: ReturnType<typeof vi.fn>;
  readonly getProjectSnapshot: ReturnType<typeof vi.fn>;
  readonly renderPreview: ReturnType<typeof vi.fn>;
  readonly probeRuntime: ReturnType<typeof vi.fn>;
  readonly checkExportReadiness: ReturnType<typeof vi.fn>;
} {
  const validationOk = options.validationOk ?? true;
  const runtimeOk = options.runtimeOk ?? true;
  const readinessOk = options.readinessOk ?? true;
  return {
    validateProject: vi.fn(async (request) => ({
      version: PROJECT_QUALITY_CONTRACT_VERSION,
      requestId: request.requestId,
      operation: 'validate-project' as const,
      ok: validationOk,
      ...(validationOk ? { data: target } : {}),
      diagnostics: validationOk
        ? []
        : [
            {
              code: 'invalid-quality-target' as const,
              severity: 'error' as const,
              message: 'Broken graph.',
            },
          ],
    })),
    getProjectSnapshot: vi.fn(async (request) => ({
      version: PROJECT_QUALITY_CONTRACT_VERSION,
      requestId: request.requestId,
      operation: 'get-project-snapshot' as const,
      ok: true,
      data: { project, snapshotRef, createdAt: '2026-07-12T00:00:00.000Z' },
      diagnostics: [],
    })),
    renderPreview: vi.fn(),
    probeRuntime: vi.fn(async (request) => ({
      version: PROJECT_QUALITY_CONTRACT_VERSION,
      requestId: request.requestId,
      operation: 'probe-runtime' as const,
      ok: runtimeOk,
      ...(runtimeOk
        ? { data: { project, available: true, profileId: '3d', diagnostics: [] } }
        : {}),
      diagnostics: runtimeOk
        ? []
        : [
            {
              code: 'runtime-unavailable' as const,
              severity: 'error' as const,
              message: 'Runtime is unavailable.',
            },
          ],
    })),
    checkExportReadiness: vi.fn(async (request) => ({
      version: PROJECT_QUALITY_CONTRACT_VERSION,
      requestId: request.requestId,
      operation: 'check-export-readiness' as const,
      ok: readinessOk,
      ...(readinessOk
        ? { data: { project, ready: true, requiredEvidenceIds: [], diagnostics: [] } }
        : {}),
      diagnostics: readinessOk
        ? []
        : [
            {
              code: 'export-not-ready' as const,
              severity: 'error' as const,
              message: 'Export is not ready.',
            },
          ],
    })),
  };
}
