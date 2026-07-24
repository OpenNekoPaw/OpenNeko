/**
 * Media generation delivery host adapter.
 *
 * Platform owns media delivery plans and view projection. This adapter owns
 * VSCode-only effects: settings lookup, webview URI conversion, notifications,
 * and "show in folder" commands.
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import { resolveWorkspaceGeneratedAssetRelativeDirectory, type GeneratedAsset } from '@neko/shared';
import {
  DEFAULT_MEDIA_GENERATION_CONFIGURED_OUTPUT_DIR,
  DEFAULT_MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION,
  MEDIA_GENERATION_DELIVERY_CONFIG_SECTION,
  MEDIA_GENERATION_OUTPUT_DIR_SETTING_KEY,
  MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION_SETTING_KEY,
  buildMediaGenerationDeliverySettingsPlan,
  finalizeMediaGenerationOutputs,
} from '@neko/platform';
import type { MediaGenerationResult } from '@neko/generation';
import type { GeneratedMediaKind } from '@neko/platform/media/media-generated-asset';
import { GeneratedAssetIndex } from '@neko/platform/media/generated-asset-index';
import { getLogger } from '../base';
import type { AgentLocalResourceAccess } from './localResourceAccess';

const logger = getLogger('MediaGenerationDeliveryHost');

export interface MediaGenerationDeliveryHostDeps {
  assetIndex?: GeneratedAssetIndex;
  transcodeFile?: (
    inputPath: string,
    outputPath: string,
    mediaType: 'audio' | 'video',
  ) => Promise<boolean>;
  localResourceAccess?: AgentLocalResourceAccess;
  computeContentDigest?: (filePath: string) => Promise<string>;
}

export class MediaGenerationDeliveryHost {
  private readonly assetIndex: GeneratedAssetIndex | undefined;

  constructor(private readonly deps: MediaGenerationDeliveryHostDeps) {
    this.assetIndex = deps.assetIndex;
  }

  async deliverMediaGeneration(
    webview: vscode.Webview,
    input: {
      readonly operationId: string;
      readonly result: MediaGenerationResult;
    },
  ): Promise<{
    readonly resultUrls: readonly string[];
    readonly generatedAssets: readonly GeneratedAsset[];
  }> {
    const finalized = await this.commitMediaGeneration(input);
    return {
      resultUrls: finalized.generatedAssets
        .map((asset) => this.toWebviewMediaUri(webview, asset.path) ?? asset.assetRef?.uri)
        .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0),
      generatedAssets: finalized.generatedAssets,
    };
  }

  async commitMediaGeneration(input: {
    readonly operationId: string;
    readonly result: MediaGenerationResult;
  }) {
    const mediaKind = toGeneratedMediaKind(input.result.type);
    const settingsPlan = this.resolveDeliverySettings(mediaKind);
    if (!settingsPlan.outputDir || !this.assetIndex) {
      throw new Error(
        'Creator-visible media completion requires a workspace and generated asset index.',
      );
    }
    return finalizeMediaGenerationOutputs({
      operationId: input.operationId,
      generationType: input.result.type,
      mediaKind,
      outputs: input.result.outputs,
      providerId: input.result.providerId,
      modelId: input.result.modelId,
      request: input.result.request,
      outputDir: settingsPlan.outputDir,
      assetIndex: this.assetIndex,
      ...(this.deps.transcodeFile ? { transcodeFile: this.deps.transcodeFile } : {}),
      ...(this.deps.computeContentDigest
        ? { computeContentDigest: this.deps.computeContentDigest }
        : {}),
      logger,
    });
  }

  toWebviewMediaUri(webview: vscode.Webview, filePath: string | undefined): string | undefined {
    if (!filePath) return undefined;
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    try {
      if (this.deps.localResourceAccess) {
        return this.deps.localResourceAccess.toWebviewUri(
          webview,
          filePath,
          'neko-agent.media-generation',
        );
      }
      logger.warn('Local resource access service unavailable for media generation projection', {
        filePath,
      });
      return undefined;
    } catch (error) {
      logger.warn('Failed to convert path to webview URI:', { filePath, error });
      return undefined;
    }
  }

  private resolveDeliverySettings(mediaKind: GeneratedMediaKind) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const mediaConfig = vscode.workspace.getConfiguration(MEDIA_GENERATION_DELIVERY_CONFIG_SECTION);
    const defaultOutputDir = workspaceFolder
      ? resolveGeneratedOutputDir(workspaceFolder.uri.fsPath, mediaKind)
      : undefined;
    const configuredOutputDir = mediaConfig.get<string>(
      MEDIA_GENERATION_OUTPUT_DIR_SETTING_KEY,
      DEFAULT_MEDIA_GENERATION_CONFIGURED_OUTPUT_DIR,
    );
    const runtimeConfiguredOutputDir =
      workspaceFolder && defaultOutputDir
        ? resolveConfiguredGeneratedOutputDir(
            workspaceFolder.uri.fsPath,
            defaultOutputDir,
            configuredOutputDir,
          )
        : undefined;
    if (configuredOutputDir && !runtimeConfiguredOutputDir) {
      logger.warn('Rejected generated output directory outside the workspace generated root', {
        configuredOutputDir,
        requiredRoot: defaultOutputDir,
      });
    }
    const settingsPlan = buildMediaGenerationDeliverySettingsPlan({
      workspaceRoot: workspaceFolder?.uri.fsPath,
      defaultOutputDir,
      configuredOutputDir: runtimeConfiguredOutputDir,
      configuredShowSaveNotification: mediaConfig.get<boolean>(
        MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION_SETTING_KEY,
        DEFAULT_MEDIA_GENERATION_SHOW_SAVE_NOTIFICATION,
      ),
    });

    return settingsPlan;
  }
}

function toGeneratedMediaKind(type: MediaGenerationResult['type']): GeneratedMediaKind {
  if (type.includes('video')) return 'video';
  if (type.includes('audio') || type.includes('music')) return 'audio';
  return 'image';
}

function resolveConfiguredGeneratedOutputDir(
  workspaceRoot: string,
  canonicalRoot: string,
  configuredOutputDir: string,
): string | undefined {
  const trimmed = configuredOutputDir.trim();
  if (!trimmed) return undefined;
  const resolved = path.resolve(workspaceRoot, trimmed);
  const relative = path.relative(canonicalRoot, resolved);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
    ? resolved
    : undefined;
}

function resolveGeneratedOutputDir(
  workspaceRoot: string,
  mediaKind: GeneratedMediaKind | 'file',
): string {
  return path.join(workspaceRoot, resolveWorkspaceGeneratedAssetRelativeDirectory({ mediaKind }));
}
