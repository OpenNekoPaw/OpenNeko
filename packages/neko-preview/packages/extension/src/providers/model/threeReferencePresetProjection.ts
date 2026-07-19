import * as vscode from 'vscode';
import type { ThreeReferencePresetRuntimeDescriptor } from '@neko/shared';
import type { LocalResourceAccessService } from '@neko/shared/vscode/extension';
import type { ThreeReferencePresetCatalogEntry } from './threeReferencePresetCatalog';

export interface ProjectThreeReferencePresetRuntimeInput {
  readonly entry: ThreeReferencePresetCatalogEntry;
  readonly webview: vscode.Webview;
  readonly extensionUri: vscode.Uri;
  readonly authorization: Pick<LocalResourceAccessService, 'configureWebview' | 'toWebviewUri'>;
  readonly signal: AbortSignal;
}

export async function projectThreeReferencePresetRuntime(
  input: ProjectThreeReferencePresetRuntimeInput,
): Promise<ThreeReferencePresetRuntimeDescriptor> {
  input.signal.throwIfAborted();
  if (input.entry.runtime.kind === 'procedural') {
    return {
      kind: 'procedural',
      implementationId: input.entry.runtime.implementationId,
      ...(input.entry.poseCapabilities
        ? {
            poseCapabilities: {
              posePresets: input.entry.poseCapabilities.posePresets,
              joints: input.entry.poseCapabilities.joints,
            },
          }
        : {}),
    };
  }

  await input.authorization.configureWebview(input.webview, { enableScripts: true });
  const dependencies = [];
  for (const dependency of input.entry.packagedDependencies) {
    input.signal.throwIfAborted();
    const sourceUri = vscode.Uri.joinPath(
      input.extensionUri,
      ...dependency.packageRelativePath.split('/'),
    );
    const projection = await input.authorization.toWebviewUri(input.webview, sourceUri.fsPath, {
      caller: `3d-reference-preset:${input.entry.presetId}`,
    });
    if (!projection.ok || projection.kind !== 'local') {
      throw new Error(
        `3D Reference preset dependency is not authorized: ${dependency.dependencyId}`,
      );
    }
    dependencies.push({
      dependencyId: dependency.dependencyId,
      uri: projection.uri,
      mediaType: dependency.mediaType,
      sha256: dependency.sha256,
    });
  }
  return {
    kind: 'packaged',
    entryDependencyId: input.entry.runtime.entryDependencyId,
    dependencies,
  };
}
