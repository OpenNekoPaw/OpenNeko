import { describe, expect, it } from 'vitest';
import { CONTENT_LOCATOR_DRAG_MIME } from '@neko/content-domain';
import { readDroppedMediaSource } from './droppedMedia';

describe('dropped Cut media', () => {
  it('prefers the VS Code URI list and ignores comments', () => {
    expect(
      readDroppedMediaSource({
        files: emptyFiles(),
        getData: (type) =>
          type === 'application/vnd.code.uri-list'
            ? '# VS Code Explorer\nfile:///workspace/media/shot.mp4\nfile:///workspace/media/music.wav\n'
            : '',
      }),
    ).toEqual({
      kind: 'local-file-uris',
      uris: ['file:///workspace/media/shot.mp4', 'file:///workspace/media/music.wav'],
    });
  });

  it('projects an Electron system file path to a file URI', () => {
    const file = new File([], 'shot 01.mp4');
    Object.defineProperty(file, 'path', { value: '/workspace/media/shot 01.mp4' });
    expect(
      readDroppedMediaSource({
        files: fileList(file),
        getData: () => '',
      }),
    ).toEqual({
      kind: 'local-file-uris',
      uris: ['file:///workspace/media/shot%2001.mp4'],
    });
  });

  it('prefers the portable Resource Browser locator without projecting a local path', () => {
    expect(
      readDroppedMediaSource({
        files: emptyFiles(),
        getData: (type) =>
          type === CONTENT_LOCATOR_DRAG_MIME
            ? JSON.stringify({
                type: 'content-locator',
                locator: {
                  file: { authority: 'workspace', path: 'media/shot.mp4' },
                },
                name: 'shot.mp4',
              })
            : '',
      }),
    ).toEqual({
      kind: 'content-locator',
      data: {
        type: 'content-locator',
        locator: {
          file: { authority: 'workspace', path: 'media/shot.mp4' },
        },
        name: 'shot.mp4',
      },
    });
  });
});

function emptyFiles(): FileList {
  return fileList();
}

function fileList(...files: File[]): FileList {
  const list = Object.assign([...files], {
    item: (index: number) => files[index] ?? null,
  });
  return list as unknown as FileList;
}
