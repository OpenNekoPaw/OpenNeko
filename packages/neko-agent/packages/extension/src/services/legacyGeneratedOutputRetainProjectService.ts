import * as vscode from 'vscode';
import type { CanvasWorkspaceProjectionResult, GeneratedAsset } from '@neko/shared';
import {
  retainLegacyGeneratedOutput,
  type LegacyGeneratedOutputRetentionIndex,
  type LegacyGeneratedOutputRetentionResult,
} from '@neko/platform/media/generated-output-adoption';
import { WorkspaceBoardProjectionHost } from './workspaceBoardProjectionHost';

export const RETAIN_AND_PROJECT_GENERATED_OUTPUT_COMMAND =
  'neko.agent.retainAndProjectGeneratedOutput';

export interface LegacyGeneratedOutputProjectionPort {
  projectGeneratedAssets(
    assets: readonly GeneratedAsset[],
  ): Promise<readonly CanvasWorkspaceProjectionResult[]>;
}

export type LegacyGeneratedOutputRetainProjectResult =
  | {
      readonly status: 'projected' | 'retained';
      readonly retention: Extract<LegacyGeneratedOutputRetentionResult, { status: 'retained' }>;
      readonly projection: CanvasWorkspaceProjectionResult;
      readonly runtimeLayout: 'not-migrated';
    }
  | {
      readonly status: 'unavailable';
      readonly retention: Extract<LegacyGeneratedOutputRetentionResult, { status: 'unavailable' }>;
      readonly runtimeLayout: 'not-migrated';
    };

export class LegacyGeneratedOutputRetainProjectService {
  constructor(
    private readonly workspaceRoot: string,
    private readonly index: LegacyGeneratedOutputRetentionIndex,
    private readonly projection: LegacyGeneratedOutputProjectionPort,
  ) {}

  async execute(assetId: string): Promise<LegacyGeneratedOutputRetainProjectResult> {
    const retention = await retainLegacyGeneratedOutput({
      workspaceRoot: this.workspaceRoot,
      assetId,
      index: this.index,
    });
    if (retention.status === 'unavailable') {
      return { status: 'unavailable', retention, runtimeLayout: 'not-migrated' };
    }

    const [projection] = await this.projection.projectGeneratedAssets([retention.asset]);
    if (!projection) {
      throw new Error('Legacy generated output projection returned no result.');
    }
    return {
      status: projection.status === 'blocked' ? 'retained' : 'projected',
      retention,
      projection,
      runtimeLayout: 'not-migrated',
    };
  }
}

export function registerLegacyGeneratedOutputRetainProjectCommand(options: {
  readonly context: vscode.ExtensionContext;
  readonly workspaceRoot?: string;
  readonly index?: LegacyGeneratedOutputRetentionIndex & { list(): GeneratedAsset[] };
  readonly projection?: LegacyGeneratedOutputProjectionPort;
}): void {
  options.context.subscriptions.push(
    vscode.commands.registerCommand(
      RETAIN_AND_PROJECT_GENERATED_OUTPUT_COMMAND,
      async (requestedAssetId?: unknown) => {
        if (!options.workspaceRoot || !options.index) {
          await vscode.window.showWarningMessage(
            'Retaining a generated output requires one open workspace.',
          );
          return;
        }
        const assetId =
          typeof requestedAssetId === 'string' && requestedAssetId.trim()
            ? requestedAssetId
            : await selectGeneratedOutput(options.index.list());
        if (!assetId) return;

        const service = new LegacyGeneratedOutputRetainProjectService(
          options.workspaceRoot,
          options.index,
          options.projection ?? new WorkspaceBoardProjectionHost(),
        );
        const result = await service.execute(assetId);
        if (result.status === 'unavailable') {
          await vscode.window.showWarningMessage(result.retention.diagnostics[0].message);
          return result;
        }
        if (result.status === 'retained') {
          const message =
            result.projection.diagnostics[0]?.message ??
            'The generated output was retained, but Canvas projection is unavailable.';
          await vscode.window.showWarningMessage(
            `${message} Runtime-only Canvas layout was not migrated.`,
          );
          return result;
        }
        await vscode.window.showInformationMessage(
          'Generated output retained and projected to the Workspace Board. Runtime-only Canvas layout was not migrated.',
        );
        return result;
      },
    ),
  );
}

async function selectGeneratedOutput(
  assets: readonly GeneratedAsset[],
): Promise<string | undefined> {
  if (assets.length === 0) {
    await vscode.window.showInformationMessage('No indexed generated outputs are available.');
    return undefined;
  }
  const selected = await vscode.window.showQuickPick(
    assets.map((asset) => ({
      label: asset.prompt?.trim() || asset.id,
      description: asset.id,
      detail: asset.lifecycle ? 'Generated output' : 'Legacy generated output',
      assetId: asset.id,
    })),
    { placeHolder: 'Select a generated output to retain and project' },
  );
  return selected?.assetId;
}
