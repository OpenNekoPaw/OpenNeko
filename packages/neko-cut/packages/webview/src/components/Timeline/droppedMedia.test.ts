import { describe, expect, it } from 'vitest';
import { readDroppedMediaUris } from './droppedMedia';

describe('dropped Cut media', () => {
  it('prefers the VS Code URI list and ignores comments', () => {
    expect(
      readDroppedMediaUris({
        files: emptyFiles(),
        getData: (type) =>
          type === 'application/vnd.code.uri-list'
            ? '# VS Code Explorer\nfile:///workspace/media/shot.mp4\nfile:///workspace/media/music.wav\n'
            : '',
      }),
    ).toEqual(['file:///workspace/media/shot.mp4', 'file:///workspace/media/music.wav']);
  });

  it('projects an Electron system file path to a file URI', () => {
    const file = new File([], 'shot 01.mp4');
    Object.defineProperty(file, 'path', { value: '/workspace/media/shot 01.mp4' });
    expect(
      readDroppedMediaUris({
        files: fileList(file),
        getData: () => '',
      }),
    ).toEqual(['file:///workspace/media/shot%2001.mp4']);
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
