import type {
  CutExportSettings,
  CutExportTaskSnapshot,
  CutProjectAuthoringService,
} from '@neko/cut-domain';
import type { CutExportTaskRegistry } from './CutExportTaskRegistry';

export interface CutExportApplicationServiceOptions {
  readonly authoring: Pick<CutProjectAuthoringService, 'query'>;
  readonly registry: Pick<CutExportTaskRegistry, 'start' | 'describe' | 'cancel'>;
}

export class CutExportApplicationService {
  constructor(private readonly options: CutExportApplicationServiceOptions) {}

  async submit(input: {
    readonly documentPath: string;
    readonly sessionId: string;
    readonly outputWorkspaceRelativePath: string;
    readonly settings: CutExportSettings;
    readonly signal?: AbortSignal;
  }): Promise<CutExportTaskSnapshot> {
    const project = await this.options.authoring.query({
      documentPath: input.documentPath,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
    if (project.documentPath !== input.documentPath) {
      throw new Error('Cut export authoring query returned a different document identity.');
    }
    if (project.timeline.documentUri !== input.documentPath) {
      throw new Error('Cut export authoring query returned a mismatched timeline identity.');
    }
    return this.options.registry.start({
      documentUri: project.documentPath,
      sessionId: input.sessionId,
      sourceSnapshotId: inputFingerprint(project.fingerprint),
      timeline: { ...project.timeline, sessionId: input.sessionId },
      settings: input.settings,
      outputWorkspaceRelativePath: input.outputWorkspaceRelativePath,
    });
  }

  describe(input: {
    readonly documentPath: string;
    readonly jobId: string;
  }): Promise<CutExportTaskSnapshot> {
    return this.options.registry.describe(input.documentPath, input.jobId);
  }

  cancel(input: {
    readonly documentPath: string;
    readonly jobId: string;
  }): Promise<CutExportTaskSnapshot> {
    return this.options.registry.cancel(input.documentPath, input.jobId);
  }
}

function inputFingerprint(fingerprint: {
  readonly strategy: string;
  readonly value: string;
}): string {
  return `${fingerprint.strategy}:${fingerprint.value}`;
}
