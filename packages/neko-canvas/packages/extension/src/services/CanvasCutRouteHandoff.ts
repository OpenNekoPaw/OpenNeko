import type {
  CanvasCutDraftPayload,
  CutRouteHandoffItem,
  CutRouteHandoffResult,
  CutRouteHandoffTarget,
  NekoCutAPI,
} from '@neko/shared';

export function projectCanvasDraftToCutRoute(
  draft: CanvasCutDraftPayload,
): readonly CutRouteHandoffItem[] {
  const blockingDiagnostic = draft.diagnostics?.find(
    (diagnostic) => diagnostic.severity === 'error',
  );
  if (blockingDiagnostic) {
    throw new Error(`Canvas route contains an unsupported item: ${blockingDiagnostic.message}`);
  }

  return draft.units.map((unit): CutRouteHandoffItem => {
    const durationMs = unit.durationMs;
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error(`Canvas route unit ${unit.id} requires a positive duration.`);
    }
    if ((unit.cues?.length ?? 0) > 0) {
      throw new Error(`Canvas route unit ${unit.id} contains unsupported cues.`);
    }
    const media = unit.media ?? [];
    if (media.length === 0) {
      return { kind: 'gap', durationSeconds: durationMs / 1_000 };
    }
    if (media.length !== 1) {
      throw new Error(`Canvas route unit ${unit.id} must contain exactly one media source.`);
    }
    const source = media[0];
    if (!source?.assetPath || source.resourceRef) {
      throw new Error(`Canvas route unit ${unit.id} does not contain a workspace media path.`);
    }
    validateWorkspaceRelativePath(source.assetPath, unit.id);
    return {
      kind: 'media',
      workspaceRelativePath: source.assetPath,
      name: unit.label ?? unit.id,
      durationSeconds: durationMs / 1_000,
    };
  });
}

export async function handoffCanvasDraftToCut(
  cutApi: NekoCutAPI,
  draft: CanvasCutDraftPayload,
  target: CutRouteHandoffTarget,
): Promise<CutRouteHandoffResult> {
  return cutApi.routes.handoff({ target, items: projectCanvasDraftToCutRoute(draft) });
}

function validateWorkspaceRelativePath(value: string, unitId: string): void {
  if (
    value.length === 0 ||
    value.includes('\\') ||
    value.startsWith('/') ||
    value === '..' ||
    value.startsWith('../') ||
    /^[a-z][a-z0-9+.-]*:/i.test(value) ||
    value.includes('${')
  ) {
    throw new Error(`Canvas route unit ${unitId} media path is not workspace-relative.`);
  }
}
