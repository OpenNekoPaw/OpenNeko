import {
  createNekoProjectAuthoringDiagnostic,
  validateNekoProjectAuthoringTarget,
  type NekoProjectAuthoringDiagnostic,
  type NekoProjectAuthoringTarget,
  type NekoProjectAuthoringValidationResult,
} from '@neko/shared';

export type CutProjectAuthoringTargetMode = 'existing' | 'create' | 'existing-or-create';

export function validateCutProjectAuthoringTarget(
  target: NekoProjectAuthoringTarget | undefined,
  mode: CutProjectAuthoringTargetMode,
): NekoProjectAuthoringValidationResult {
  if (!target) {
    return failed('missing-authoring-target', 'Cut authoring requires an explicit .nkv target.');
  }

  const diagnostics: NekoProjectAuthoringDiagnostic[] = [
    ...validateNekoProjectAuthoringTarget(target, {
      createNewAllowed: mode !== 'existing',
    }).diagnostics,
  ];

  if (!target.kind) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'missing-authoring-target',
        message: 'Cut authoring target kind must be explicitly file or new.',
        path: ['target', 'kind'],
      }),
    );
  } else if (target.kind === 'active') {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'invalid-authoring-target',
        message: 'Durable Cut authoring cannot use the active editor as an implicit target.',
        path: ['target', 'kind'],
      }),
    );
  } else if (mode === 'existing' && target.kind !== 'file') {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'invalid-authoring-target',
        message: 'This Cut operation requires an explicit existing file target.',
        path: ['target', 'kind'],
      }),
    );
  } else if (mode === 'create' && target.kind !== 'new') {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'invalid-authoring-target',
        message: 'Cut project creation requires an explicit new target.',
        path: ['target', 'kind'],
      }),
    );
  }

  if (target.kind === 'new' && !target.documentUri) {
    diagnostics.push(
      createNekoProjectAuthoringDiagnostic({
        code: 'workspace-required',
        message: 'Cut create-new authoring requires an adapter-resolved documentUri.',
        path: ['target', 'documentUri'],
      }),
    );
  }

  if (target.documentUri) {
    const uri = parseLocalFileUri(target.documentUri);
    if (!uri) {
      diagnostics.push(
        createNekoProjectAuthoringDiagnostic({
          code: 'invalid-authoring-target',
          message: 'Cut authoring target must be a durable local file URI.',
          path: ['target', 'documentUri'],
        }),
      );
    } else if (!uri.pathname.toLowerCase().endsWith('.nkv')) {
      diagnostics.push(
        createNekoProjectAuthoringDiagnostic({
          code: 'invalid-authoring-target',
          message: 'Cut authoring target must end with .nkv.',
          path: ['target', 'documentUri'],
        }),
      );
    }
  }

  return { ok: !diagnostics.some(({ severity }) => severity === 'error'), diagnostics };
}

function failed(
  code: NekoProjectAuthoringDiagnostic['code'],
  message: string,
): NekoProjectAuthoringValidationResult {
  return {
    ok: false,
    diagnostics: [createNekoProjectAuthoringDiagnostic({ code, message })],
  };
}

function parseLocalFileUri(value: string): URL | undefined {
  try {
    const uri = new URL(value);
    return uri.protocol === 'file:' ? uri : undefined;
  } catch {
    return undefined;
  }
}
