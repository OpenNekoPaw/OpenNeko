import * as vscode from 'vscode';
import type { AssetEntity, AssetVariant, IErrorHandler } from '@neko/shared';
import { getMediaType } from '@neko/shared';
import type { IAssetEntityReader } from '../contracts/IAssetEntityReader';
import type { IExtensionI18n } from '../contracts/IExtensionI18n';

interface IRegisterCommandsDependencies {
  i18n: IExtensionI18n;
  assetEntityReader: IAssetEntityReader;
  errorHandler: IErrorHandler;
}

type SupportedMediaType = 'image' | 'video' | 'audio';

const MEDIA_EXTENSIONS: Record<SupportedMediaType, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'],
  video: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'],
  audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'],
};

const MEDIA_INFO_EXTENSIONS = [
  ...MEDIA_EXTENSIONS.image,
  ...MEDIA_EXTENSIONS.video,
  ...MEDIA_EXTENSIONS.audio,
];

export function registerNekoToolsCommands(
  context: vscode.ExtensionContext,
  dependencies: IRegisterCommandsDependencies,
): void {
  const { assetEntityReader, errorHandler, i18n } = dependencies;

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'neko.tools.compareFiles',
      async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
        const selectedFiles = uris ?? (uri ? [uri] : []);

        if (selectedFiles.length < 2) {
          await errorHandler.handleError(
            new Error(i18n.t('neko.tools.error.selectAtLeastTwoFiles')),
            {
              showToUser: true,
              severity: 'warning',
            },
          );
          return;
        }

        await vscode.commands.executeCommand(
          'neko.mediaDiff.compareFiles',
          selectedFiles[0],
          selectedFiles,
        );
      },
    ),

    vscode.commands.registerCommand('neko.tools.compareImages', async () => {
      const files = await pickTwoMediaFiles('image', i18n);
      if (!files) return;
      await vscode.commands.executeCommand('neko.mediaDiff.compareFiles', files[1], files);
    }),

    vscode.commands.registerCommand('neko.tools.compareVideos', async () => {
      const files = await pickTwoMediaFiles('video', i18n);
      if (!files) return;
      await vscode.commands.executeCommand('neko.mediaDiff.compareFiles', files[1], files);
    }),

    vscode.commands.registerCommand('neko.tools.compareAudio', async () => {
      const files = await pickTwoMediaFiles('audio', i18n);
      if (!files) return;
      await vscode.commands.executeCommand('neko.mediaDiff.compareFiles', files[1], files);
    }),

    vscode.commands.registerCommand('neko.tools.compareAssetVariants', async () => {
      let entities: AssetEntity[] = [];

      try {
        entities = await assetEntityReader.listEntities();
      } catch {
        await errorHandler.handleError(new Error(i18n.t('neko.tools.error.assetsUnavailable')), {
          showToUser: true,
        });
        return;
      }

      const multiVariantEntities = entities.filter((entity) => entity.variants.length >= 2);
      if (multiVariantEntities.length === 0) {
        vscode.window.showInformationMessage(i18n.t('neko.tools.info.noMultiVariantEntities'));
        return;
      }

      const entityPick = await vscode.window.showQuickPick(
        multiVariantEntities.map((entity) => ({
          label: entity.name,
          description: i18n.t('neko.tools.quickPick.variantCount', entity.variants.length),
          entity,
        })),
        { placeHolder: i18n.t('neko.tools.quickPick.selectEntity') },
      );
      if (!entityPick) return;

      const variantAPick = await vscode.window.showQuickPick(
        entityPick.entity.variants.map((variant) => ({
          label: variant.name,
          description: i18n.t('neko.tools.quickPick.fileCount', variant.files.length),
          variant,
        })),
        { placeHolder: i18n.t('neko.tools.quickPick.selectFirstVariant') },
      );
      if (!variantAPick) return;

      const remainingVariants = entityPick.entity.variants.filter(
        (variant) => variant.id !== variantAPick.variant.id,
      );
      const variantBPick = await vscode.window.showQuickPick(
        remainingVariants.map((variant) => ({
          label: variant.name,
          description: i18n.t('neko.tools.quickPick.fileCount', variant.files.length),
          variant,
        })),
        { placeHolder: i18n.t('neko.tools.quickPick.selectSecondVariant') },
      );
      if (!variantBPick) return;

      await vscode.commands.executeCommand(
        'neko.assetDiff.compareVariants',
        entityPick.entity.id,
        variantAPick.variant.id,
        variantBPick.variant.id,
      );
    }),

    vscode.commands.registerCommand('neko.tools.showMediaInfo', async (uri?: vscode.Uri) => {
      const targetUri = uri ?? (await pickMediaInfoFile(i18n));
      if (!targetUri) return;

      try {
        const entities = await assetEntityReader.listEntities();
        const mediaInfoMessage = buildMediaInfoMessage(entities, targetUri, i18n);

        if (mediaInfoMessage) {
          vscode.window.showInformationMessage(mediaInfoMessage);
          return;
        }
      } catch {
        // Asset library is optional for this command. Fall back to basic file info.
      }

      const mediaType = getMediaType(targetUri.fsPath) ?? i18n.t('neko.tools.mediaType.unknown');
      vscode.window.showInformationMessage(
        i18n.t('neko.tools.mediaInfo.fallback', targetUri.fsPath, mediaType),
      );
    }),
  );
}

function buildMediaInfoMessage(
  entities: AssetEntity[],
  uri: vscode.Uri,
  i18n: IExtensionI18n,
): string | null {
  for (const entity of entities) {
    for (const variant of entity.variants) {
      const file = findMatchingVariantFile(variant, uri);
      if (!file) {
        continue;
      }

      const lines: string[] = [i18n.t('neko.tools.mediaInfo.file', file.name)];
      const { metadata } = file;

      if (metadata.width && metadata.height) {
        lines.push(
          i18n.t('neko.tools.mediaInfo.resolution', `${metadata.width}x${metadata.height}`),
        );
      }
      if (metadata.duration) {
        lines.push(i18n.t('neko.tools.mediaInfo.duration', metadata.duration.toFixed(1)));
      }
      if (metadata.codec) {
        lines.push(i18n.t('neko.tools.mediaInfo.codec', metadata.codec));
      }
      if (metadata.frameRate) {
        lines.push(i18n.t('neko.tools.mediaInfo.frameRate', metadata.frameRate));
      }
      if (metadata.sampleRate) {
        lines.push(i18n.t('neko.tools.mediaInfo.sampleRate', metadata.sampleRate));
      }
      if (metadata.fileSize) {
        lines.push(
          i18n.t('neko.tools.mediaInfo.size', (metadata.fileSize / (1024 * 1024)).toFixed(1)),
        );
      }

      return lines.join(' | ');
    }
  }

  return null;
}

function findMatchingVariantFile(
  variant: AssetVariant,
  uri: vscode.Uri,
): AssetVariant['files'][number] | undefined {
  return variant.files.find((file) => uri.fsPath.endsWith(file.path) || file.path === uri.fsPath);
}

async function pickTwoMediaFiles(
  mediaType: SupportedMediaType,
  i18n: IExtensionI18n,
): Promise<[vscode.Uri, vscode.Uri] | null> {
  const filters = {
    [i18n.t(`neko.tools.filters.${mediaType}`)]: MEDIA_EXTENSIONS[mediaType],
  };
  const mediaTypeLabel = i18n.t(`neko.tools.mediaType.${mediaType}`);

  const first = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: false,
    filters,
    title: i18n.t('neko.tools.openDialog.selectFirstMediaFile', mediaTypeLabel),
  });
  if (!first?.[0]) return null;

  const second = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: false,
    filters,
    title: i18n.t('neko.tools.openDialog.selectSecondMediaFile', mediaTypeLabel),
  });
  if (!second?.[0]) return null;

  return [first[0], second[0]];
}

async function pickMediaInfoFile(i18n: IExtensionI18n): Promise<vscode.Uri | null> {
  const fileUri = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: false,
    filters: {
      [i18n.t('neko.tools.filters.media')]: MEDIA_INFO_EXTENSIONS,
    },
    title: i18n.t('neko.tools.openDialog.selectMediaInfoFile'),
  });

  return fileUri?.[0] ?? null;
}
