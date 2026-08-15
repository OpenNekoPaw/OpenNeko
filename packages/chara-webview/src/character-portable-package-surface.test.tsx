import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CharacterPortableExportScopeSurface,
  CharacterPortableImportSurface,
} from './character-portable-package-surface';

describe('Character portable package surfaces', () => {
  it('selects one exact CharacterVersion and bound representations without exposing raw paths', () => {
    const onExport = vi.fn();
    const { container } = render(
      <CharacterPortableExportScopeSurface
        locale="zh-cn"
        scope={{
          characterProjectId: 'character-a',
          displayName: '林',
          characterVersionIds: ['version-root', 'version-left', 'version-right'],
          representations: [
            {
              representationId: 'live2d-main',
              kind: 'live2d',
              canEmbed: true,
              ownedFileCount: 2,
              ownedByteLength: 2048,
            },
            {
              representationId: 'voice-main',
              kind: 'voice',
              canEmbed: false,
              ownedFileCount: 0,
              ownedByteLength: 0,
            },
          ],
        }}
        onCancel={() => undefined}
        onExport={onExport}
      />,
    );

    expect(screen.getByText('2 个文件 · 2.0 KB')).toBeTruthy();
    expect(screen.getByText('外部依赖')).toBeTruthy();
    expect(
      (screen.getByRole('checkbox', { name: /语音 · voice-main/u }) as HTMLInputElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /Live2D · live2d-main/u }));
    fireEvent.click(screen.getByRole('button', { name: '选择保存位置并导出' }));

    expect(onExport).toHaveBeenCalledWith({
      characterVersionId: 'version-root',
      embeddedRepresentationIds: ['live2d-main'],
    });
    expect(container.textContent).not.toMatch(/file:\/\/|\/Users\/|[A-Z]:\\/u);
  });

  it('shows external dependencies and disables conflicting import', () => {
    const onCommit = vi.fn();
    render(
      <CharacterPortableImportSurface
        locale="zh-cn"
        preview={{
          characterProjectId: 'character-a',
          displayName: '林',
          characterVersionIds: ['version-root', 'version-left'],
          embeddedAssets: [
            {
              representationId: 'live2d-main',
              kind: 'live2d',
              resourceRef: 'asset:live2d-main',
              archivePath: 'assets/live2d/model.model3.json',
              entry: true,
              mediaType: 'application/json',
              byteLength: 1024,
              integrityDigest: `sha256:${'a'.repeat(64)}`,
            },
          ],
          externalDependencies: [
            {
              representationId: 'voice-main',
              kind: 'voice',
              resourceRef: 'voice:provider-a',
            },
          ],
          conflicts: [{ kind: 'character-project', recordId: 'character-a' }],
          canCommit: false,
        }}
        onCancel={() => undefined}
        onCommit={onCommit}
      />,
    );

    expect(screen.getByText('全局角色')).toBeTruthy();
    expect(screen.getByText('voice-main')).toBeTruthy();
    const install = screen.getByRole('button', { name: '导入到全局目录' }) as HTMLButtonElement;
    expect(install.disabled).toBe(true);
    expect(screen.getByRole('alert')).toBeTruthy();
    const cancel = screen.getByRole('button', { name: '取消' });
    cancel.focus();
    expect(document.activeElement).toBe(cancel);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('allows a conflict-free self-contained package to be imported into the global catalog', () => {
    const onCommit = vi.fn();
    render(
      <CharacterPortableImportSurface
        locale="en"
        preview={{
          characterProjectId: 'character-a',
          displayName: 'Lin',
          characterVersionIds: [],
          embeddedAssets: [],
          externalDependencies: [],
          conflicts: [],
          canCommit: true,
        }}
        onCancel={() => undefined}
        onCommit={onCommit}
      />,
    );

    expect(screen.getByText('All declared representation assets are embedded.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Import to global catalog' }));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('keeps a dense asset policy operable and labels every checkbox', () => {
    render(
      <CharacterPortableExportScopeSurface
        locale="en"
        scope={{
          characterProjectId: 'character-dense',
          displayName: 'Dense character',
          characterVersionIds: [],
          representations: Array.from({ length: 32 }, (_, index) => ({
            representationId: `portrait-${String(index)}`,
            kind: 'portrait' as const,
            canEmbed: true,
            ownedFileCount: 1,
            ownedByteLength: 16,
          })),
        }}
        onCancel={() => undefined}
        onExport={() => undefined}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(32);
    checkboxes[31]?.focus();
    expect(document.activeElement).toBe(checkboxes[31]);
  });
});
