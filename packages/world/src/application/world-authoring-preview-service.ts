import { parseWorldProject, type WorldProject } from '@neko/world/contracts';

export type WorldAuthoringPreviewDiagnosticCode =
  'world-preview-background-empty' | 'world-preview-locations-empty' | 'world-preview-rules-empty';

export interface WorldAuthoringPreviewDiagnostic {
  readonly code: WorldAuthoringPreviewDiagnosticCode;
  readonly message: string;
}

export interface WorldAuthoringPreviewProjection {
  readonly worldProjectId: string;
  readonly title: string;
  readonly background: string;
  readonly locations: readonly { readonly name: string; readonly description: string }[];
  readonly organizations: readonly { readonly name: string; readonly description: string }[];
  readonly rules: readonly string[];
  readonly initialFacts: readonly { readonly key: string; readonly value: string }[];
  readonly sourceReferenceCount: number;
  readonly diagnostics: readonly WorldAuthoringPreviewDiagnostic[];
}

/** Pure, disposable authoring projection. It has no runtime or persistence dependency. */
export class WorldAuthoringPreviewService {
  create(projectValue: WorldProject): WorldAuthoringPreviewProjection {
    const project = parseWorldProject(projectValue);
    const diagnostics: WorldAuthoringPreviewDiagnostic[] = [];
    if (!project.draft.background.trim()) {
      diagnostics.push({
        code: 'world-preview-background-empty',
        message: 'World background is empty.',
      });
    }
    if (project.draft.locations.length === 0) {
      diagnostics.push({
        code: 'world-preview-locations-empty',
        message: 'World has no defined locations.',
      });
    }
    if (project.draft.rules.length === 0) {
      diagnostics.push({
        code: 'world-preview-rules-empty',
        message: 'World has no defined rules.',
      });
    }
    return Object.freeze({
      worldProjectId: project.worldProjectId,
      title: project.title,
      background: project.draft.background,
      locations: Object.freeze(
        project.draft.locations.map(({ name, description }) =>
          Object.freeze({ name, description }),
        ),
      ),
      organizations: Object.freeze(
        project.draft.organizations.map(({ name, description }) =>
          Object.freeze({ name, description }),
        ),
      ),
      rules: Object.freeze(project.draft.rules.map((rule) => rule.statement)),
      initialFacts: Object.freeze(
        project.draft.initialFacts.map((fact) =>
          Object.freeze({ key: fact.key, value: JSON.stringify(fact.value) }),
        ),
      ),
      sourceReferenceCount: project.sourceRefs.length,
      diagnostics: Object.freeze(diagnostics),
    });
  }
}
