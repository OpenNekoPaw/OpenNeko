import * as vscode from 'vscode';
import type { IErrorHandler } from '@neko/shared';
import { getMediaType } from '@neko/shared';
import type { IExtensionI18n } from '../contracts/IExtensionI18n';

interface IRegisterCommandsDependencies {
  i18n: IExtensionI18n;
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
  const { errorHandler, i18n } = dependencies;

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

    vscode.commands.registerCommand('neko.tools.showMediaInfo', async (uri?: vscode.Uri) => {
      const targetUri = uri ?? (await pickMediaInfoFile(i18n));
      if (!targetUri) return;

      const mediaType = getMediaType(targetUri.fsPath) ?? i18n.t('neko.tools.mediaType.unknown');
      vscode.window.showInformationMessage(
        i18n.t('neko.tools.mediaInfo.fallback', targetUri.fsPath, mediaType),
      );
    }),
  );
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
